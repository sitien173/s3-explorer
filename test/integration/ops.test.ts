import {
	CopyObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { channels, events } from "../../src/shared/channels";
import { opsProgressPayloadSchema } from "../../src/shared/ipc";
import {
	createIntegrationSender,
	createTestBucket,
	emptyAndDeleteBucket,
	seedObjects,
	setupHarness,
	waitFor,
	type IntegrationHarness,
} from "./helpers";

const bucket = `integ-ops-${Date.now()}`;

type CommandLike = {
	input: Record<string, unknown>;
};
type SendOptions = { abortSignal?: AbortSignal };
type SendHook = (command: unknown, options: SendOptions | undefined, next: () => Promise<unknown>) => Promise<unknown>;

type IpcError = { code: string; message: string };
type PartialResult = {
	completed: string[];
	remaining: string[];
	error?: IpcError;
};
type Success<T> = { ok: true; data: T };
type Failure = { ok: false; error: IpcError };

let harness!: IntegrationHarness;
let bucketCreated = false;
let wrapClient = (client: S3Client): S3Client => client;
const clients = {
	get: async (connection: Parameters<IntegrationHarness["factory"]["get"]>[0]) =>
		wrapClient(await harness.factory.get(connection)),
	invalidate: (connectionId: string) => harness.factory.invalidate(connectionId),
};

function wrapSend(client: S3Client, hook: SendHook): S3Client {
	const wrapped = Object.create(client) as S3Client;
	const baseSend = client.send.bind(client);
	const send = (command: unknown, options?: SendOptions): Promise<unknown> =>
		hook(command, options, () => baseSend(command as never, options as never));
	Object.defineProperty(wrapped, "send", { value: send });
	return wrapped;
}

function inputOf(command: unknown): CommandLike["input"] {
	return (command as CommandLike).input;
}

function success<T>(response: unknown): T {
	const result = response as Success<T> | Failure;
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.data;
}

function failure(response: unknown): IpcError {
	const result = response as Failure | Success<unknown>;
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("Expected an IPC failure");
	return result.error;
}

async function invoke(channel: string, input: unknown, sender = createIntegrationSender()): Promise<unknown> {
	const handler = harness.handlers.get(channel);
	if (!handler) throw new Error(`Missing IPC handler for ${channel}`);
	return handler({ sender }, input);
}

async function keysWithPrefix(prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let continuationToken: string | undefined;
	while (true) {
		const page = await harness.s3Client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			}),
		);
		keys.push(...(page.Contents ?? []).flatMap((item) => item.Key ?? []));
		if (!page.IsTruncated || !page.NextContinuationToken) return keys;
		continuationToken = page.NextContinuationToken;
	}
}

async function objectExists(key: string): Promise<boolean> {
	try {
		await harness.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return true;
	} catch (error) {
		if ((error as { name?: string }).name === "NotFound") return false;
		throw error;
	}
}

async function objectBytes(key: string): Promise<Uint8Array> {
	const result = await harness.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
	if (!result.Body) throw new Error(`Missing body for ${key}`);
	return result.Body.transformToByteArray();
}

async function put(key: string, body: string): Promise<void> {
	await harness.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

afterEach(() => {
	wrapClient = (client) => client;
});

beforeAll(async () => {
	harness = await setupHarness({ clients });
	await createTestBucket(harness.s3Client, bucket);
	bucketCreated = true;
}, 120_000);

afterAll(async () => {
	if (!harness) return;
	try {
		if (bucketCreated) {
			await emptyAndDeleteBucket(harness.s3Client, bucket);
		}
	} finally {
		await harness.cleanup();
	}
}, 120_000);

describe("integration waitFor helper", () => {
	it("rejects with a clear timeout message", async () => {
		await expect(waitFor(() => false, 1)).rejects.toThrow("waitFor timed out after 1 ms");
	});
});

describe("RustFS operation IPC integration", () => {
	it("creates a zero-byte folder marker visible as a folder", async () => {
		const result = success<{ key: string }>(
			await invoke(channels.opsCreateFolder, {
				connectionId: harness.connection.id,
				bucket,
				parent: "",
				name: "created",
			}),
		);
		expect(result).toEqual({ key: "created/" });
		const marker = await harness.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: "created/" }));
		expect(marker.ContentLength).toBe(0);
		const listed = success<{ folders: string[]; objects: { key: string }[] }>(
			await invoke(channels.objectsList, {
				connectionId: harness.connection.id,
				bucket,
				prefix: "",
			}),
		);
		expect(listed.folders).toContain("created/");
	});

	it("deletes 2,500 keys in three batches and verifies all are gone", async () => {
		const keys = Array.from({ length: 2500 }, (_, index) => `bulk/key-${index.toString().padStart(4, "0")}`);
		await seedObjects(
			harness.s3Client,
			bucket,
			keys.map((key) => ({ key })),
		);
		let batches = 0;
		wrapClient = (client) =>
			wrapSend(client, async (command, _options, next) => {
				if (command instanceof DeleteObjectsCommand) batches++;
				return next();
			});
		const sender = createIntegrationSender();
		const result = success<PartialResult>(
			await invoke(
				channels.opsDelete,
				{
					opId: "bulk-delete-0001",
					connectionId: harness.connection.id,
					bucket,
					keys,
				},
				sender,
			),
		);
		expect(batches).toBe(3);
		expect(result.completed).toEqual(keys);
		expect(result.remaining).toEqual([]);
		expect(result.error).toBeUndefined();
		expect(await keysWithPrefix("bulk/")).toEqual([]);
		const progress = sender.sent.filter((entry) => entry.channel === events.opsProgress);
		expect(progress).toHaveLength(3);
		for (const event of progress) {
			expect(opsProgressPayloadSchema.parse(event.payload)).toEqual(event.payload);
		}
	});

	it("counts a prefix before deleting it", async () => {
		const keys = Array.from({ length: 12 }, (_, index) => `remove/key-${index.toString().padStart(2, "0")}`);
		await seedObjects(
			harness.s3Client,
			bucket,
			keys.map((key) => ({ key })),
		);
		const counted = success<{ count: number }>(
			await invoke(channels.opsCountPrefix, {
				connectionId: harness.connection.id,
				bucket,
				prefix: "remove/",
			}),
		);
		expect(counted.count).toBe(keys.length);
		const deleted = success<PartialResult>(
			await invoke(channels.opsDeletePrefix, {
				opId: "remove-prefix-0001",
				connectionId: harness.connection.id,
				bucket,
				prefix: "remove/",
			}),
		);
		expect(deleted.completed).toEqual(keys);
		expect(deleted.remaining).toEqual([]);
		expect((await keysWithPrefix("remove/")).length).toBe(0);
	});

	it("renames keys containing spaces, unicode, plus, and percent encoding", async () => {
		const names = ["spaced name.txt", "café.txt", "plus+sign.txt", "percent%25.txt"];
		for (const [index, name] of names.entries()) {
			const fromKey = `special/from/${name}`;
			const toKey = `special/to/${name}`;
			const bytes = Buffer.from(`fixture-${index}`);
			await harness.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: fromKey, Body: bytes }));
			const result = success<{ key: string }>(
				await invoke(channels.opsRename, {
					connectionId: harness.connection.id,
					bucket,
					fromKey,
					toKey,
				}),
			);
			expect(result.key).toBe(toKey);
			expect(Buffer.from(await objectBytes(toKey))).toEqual(bytes);
			expect(await objectExists(fromKey)).toBe(false);
		}
	});

	it("rejects an existing destination without changing either object", async () => {
		await put("conflict/source.txt", "source-bytes");
		await put("conflict/destination.txt", "destination-bytes");
		const response = await invoke(channels.opsRename, {
			connectionId: harness.connection.id,
			bucket,
			fromKey: "conflict/source.txt",
			toKey: "conflict/destination.txt",
		});
		expect(failure(response)).toEqual({
			code: "CONFLICT",
			message: "Destination exists",
		});
		expect(Buffer.from(await objectBytes("conflict/source.txt")).toString()).toBe("source-bytes");
		expect(Buffer.from(await objectBytes("conflict/destination.txt")).toString()).toBe("destination-bytes");
	});

	it("rejects a same-key rename as INVALID_REQUEST", async () => {
		const response = await invoke(channels.opsRename, {
			connectionId: harness.connection.id,
			bucket,
			fromKey: "conflict/source.txt",
			toKey: "conflict/source.txt",
		});
		expect(failure(response)).toEqual({
			code: "INVALID_REQUEST",
			message: "Source and destination are the same",
		});
	});

	it("renames a nested folder and marker, leaving no source keys", async () => {
		const keys = ["tree/branch/"];
		for (let index = 0; index < 50; index++) {
			keys.push(`tree/branch/item-${index.toString().padStart(2, "0")}.txt`);
		}
		await seedObjects(
			harness.s3Client,
			bucket,
			keys.map((key) => ({ key })),
		);
		const result = success<PartialResult>(
			await invoke(channels.opsRenamePrefix, {
				opId: "tree-rename-0001",
				connectionId: harness.connection.id,
				bucket,
				fromPrefix: "tree/branch/",
				toPrefix: "moved/branch/",
			}),
		);
		expect(result.completed).toEqual(keys);
		expect(result.remaining).toEqual([]);
		expect(await keysWithPrefix("tree/branch/")).toEqual([]);
		expect(await keysWithPrefix("moved/branch/")).toEqual(
			keys.map((key) => key.replace("tree/branch/", "moved/branch/")),
		);
	});

	it("reports exact partial state when a prefix copy fails", async () => {
		const sources = ["partial-copy/a.txt", "partial-copy/b.txt", "partial-copy/c.txt"];
		await seedObjects(
			harness.s3Client,
			bucket,
			sources.map((key) => ({ key })),
		);
		wrapClient = (client) =>
			wrapSend(client, async (command, _options, next) => {
				if (command instanceof CopyObjectCommand && inputOf(command).Key === "partial-copy-dest/b.txt") {
					throw Object.assign(new Error("Injected copy failure"), {
						name: "InjectedFailure",
					});
				}
				return next();
			});
		const result = success<PartialResult>(
			await invoke(channels.opsRenamePrefix, {
				opId: "partial-copy-0001",
				connectionId: harness.connection.id,
				bucket,
				fromPrefix: "partial-copy/",
				toPrefix: "partial-copy-dest/",
			}),
		);
		expect(result.completed).toEqual([sources[0]]);
		expect(result.remaining).toEqual(sources.slice(1));
		expect(result.error?.code).toBe("REQUEST_FAILED");
		expect(await objectExists(sources[0]!)).toBe(false);
		expect(await objectExists("partial-copy-dest/a.txt")).toBe(true);
		for (const key of sources.slice(1)) {
			expect(await objectExists(key)).toBe(true);
		}
		expect(await objectExists("partial-copy-dest/b.txt")).toBe(false);
		expect(await objectExists("partial-copy-dest/c.txt")).toBe(false);
	});

	it("reports a copied-but-not-deleted key as remaining", async () => {
		const sources = ["partial-delete/a.txt", "partial-delete/b.txt", "partial-delete/c.txt"];
		await seedObjects(
			harness.s3Client,
			bucket,
			sources.map((key) => ({ key })),
		);
		wrapClient = (client) =>
			wrapSend(client, async (command, _options, next) => {
				if (command instanceof DeleteObjectCommand && inputOf(command).Key === "partial-delete/b.txt") {
					throw Object.assign(new Error("Injected delete failure"), {
						name: "InjectedFailure",
					});
				}
				return next();
			});
		const result = success<PartialResult>(
			await invoke(channels.opsRenamePrefix, {
				opId: "partial-delete-0001",
				connectionId: harness.connection.id,
				bucket,
				fromPrefix: "partial-delete/",
				toPrefix: "partial-delete-dest/",
			}),
		);
		expect(result.completed).toEqual([sources[0]]);
		expect(result.remaining).toEqual(sources.slice(1));
		expect(result.error?.code).toBe("REQUEST_FAILED");
		expect(await objectExists(sources[0]!)).toBe(false);
		expect(await objectExists("partial-delete-dest/a.txt")).toBe(true);
		expect(await objectExists(sources[1]!)).toBe(true);
		expect(await objectExists("partial-delete-dest/b.txt")).toBe(true);
		expect(await objectExists(sources[2]!)).toBe(true);
		expect(await objectExists("partial-delete-dest/c.txt")).toBe(false);
	});
});
