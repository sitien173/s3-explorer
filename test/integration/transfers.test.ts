import { createHash, randomBytes } from "node:crypto";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	PutObjectCommand,
	UploadPartCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DialogLike } from "../../src/main/ipc/ops";
import type { S3ClientFactory } from "../../src/main/s3/client";
import { channels, events } from "../../src/shared/channels";
import { transferDonePayloadSchema, transferProgressPayloadSchema } from "../../src/shared/ipc";
import {
	createIntegrationSender,
	createTestBucket,
	emptyAndDeleteBucket,
	setupHarness,
	waitFor,
	type IntegrationHarness,
} from "./helpers";

const bucket = `integ-transfer-${Date.now()}`;
const multipartBytes = 50 * 1024 * 1024;
const roundTripBytes = 20 * 1024 * 1024;
const largeObjectKey = "download-source/large.bin";
const uploadCancelKey = "cancel-upload/large-fixture.bin";

type SendOptions = { abortSignal?: AbortSignal };
type SendHook = (command: unknown, options: SendOptions | undefined, next: () => Promise<unknown>) => Promise<unknown>;
type Success<T> = { ok: true; data: T };
type Failure = { ok: false; error: { code: string; message: string } };
type Progress = {
	transferId: string;
	kind: "upload" | "download";
	bucket: string;
	key: string;
	loaded: number;
	total: number;
};
type Done = {
	transferId: string;
	status: "completed" | "cancelled" | "failed";
	error?: { code: string; message: string };
};

let harness!: IntegrationHarness;
let bucketCreated = false;
let tempDirectory = "";
let largeFile = "";
let openPaths: string[] = [];
let savePath: string | undefined;
let wrapClient = (client: S3Client): S3Client => client;
const dialog: DialogLike = {
	showOpenDialog: async (options) => {
		openDialogCalls.push(options);
		return { canceled: false, filePaths: openPaths };
	},
	showSaveDialog: async (options) => {
		saveDialogCalls.push(options);
		return {
			canceled: savePath === undefined,
			...(savePath === undefined ? {} : { filePath: savePath }),
		};
	},
};
const openDialogCalls: Parameters<DialogLike["showOpenDialog"]>[0][] = [];
const saveDialogCalls: Parameters<DialogLike["showSaveDialog"]>[0][] = [];
const clients: Pick<S3ClientFactory, "get" | "invalidate"> = {
	get: async (connection) => wrapClient(await harness.factory.get(connection)),
	invalidate: (connectionId) => harness.factory.invalidate(connectionId),
};

function wrapSend(client: S3Client, hook: SendHook): S3Client {
	const wrapped = Object.create(client) as S3Client;
	const baseSend = client.send.bind(client);
	const send = (command: unknown, options?: SendOptions): Promise<unknown> =>
		hook(command, options, () => baseSend(command as never, options as never));
	Object.defineProperty(wrapped, "send", { value: send });
	return wrapped;
}

function success<T>(response: unknown): T {
	const result = response as Success<T> | Failure;
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.data;
}

async function invoke(
	channel: string,
	input: unknown,
	sender: ReturnType<typeof createIntegrationSender>,
): Promise<unknown> {
	const handler = harness.handlers.get(channel);
	if (!handler) throw new Error(`Missing IPC handler for ${channel}`);
	return handler({ sender }, input);
}

function progressFor(sender: ReturnType<typeof createIntegrationSender>, id: string): Progress[] {
	return sender.sent
		.filter((entry) => entry.channel === events.transferProgress)
		.map((entry) => transferProgressPayloadSchema.parse(entry.payload))
		.filter((entry) => entry.transferId === id);
}

function doneFor(sender: ReturnType<typeof createIntegrationSender>, id: string): Done | undefined {
	const entry = sender.sent.find(
		(item) => item.channel === events.transferDone && (item.payload as { transferId: string }).transferId === id,
	);
	return entry ? transferDonePayloadSchema.parse(entry.payload) : undefined;
}

async function waitForDone(
	sender: ReturnType<typeof createIntegrationSender>,
	id: string,
	timeoutMs = 90_000,
): Promise<Done> {
	await waitFor(() => doneFor(sender, id) !== undefined, timeoutMs);
	const done = doneFor(sender, id);
	if (!done) throw new Error(`Transfer ${id} completed without a done event`);
	return done;
}

function expectProgressWithinSize(
	sender: ReturnType<typeof createIntegrationSender>,
	id: string,
	fileSize: number,
): Progress[] {
	const progress = progressFor(sender, id);
	expect(progress.length).toBeGreaterThan(0);
	expect(progress[0]?.loaded).toBe(0);
	for (let index = 1; index < progress.length; index++) {
		expect(progress[index]!.loaded).toBeGreaterThanOrEqual(progress[index - 1]!.loaded);
	}
	for (const event of progress) {
		expect(event.loaded).toBeLessThanOrEqual(fileSize);
	}
	return progress;
}

async function objectIsMissing(key: string): Promise<boolean> {
	try {
		await harness.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return false;
	} catch (error) {
		if ((error as { name?: string }).name === "NotFound") return true;
		throw error;
	}
}

async function multipartUploadsAreEmpty(): Promise<boolean> {
	const output = await harness.s3Client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
	return (output.Uploads ?? []).length === 0;
}

function delayOrAbort(milliseconds: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(new Error("Aborted"));
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, milliseconds);
		const onAbort = () => {
			clearTimeout(timer);
			cleanup();
			reject(new Error("Aborted"));
		};
		const cleanup = () => signal?.removeEventListener("abort", onAbort);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function abortGate() {
	let released = false;
	const waiters = new Set<() => void>();
	return {
		wait(signal?: AbortSignal): Promise<void> {
			if (released) return Promise.resolve();
			if (signal?.aborted) return Promise.reject(new Error("Aborted"));
			return new Promise<void>((resolve, reject) => {
				const release = () => {
					cleanup();
					resolve();
				};
				const onAbort = () => {
					cleanup();
					reject(new Error("Aborted"));
				};
				const cleanup = () => {
					waiters.delete(release);
					signal?.removeEventListener("abort", onAbort);
				};
				waiters.add(release);
				signal?.addEventListener("abort", onAbort, { once: true });
			});
		},
		release() {
			released = true;
			for (const release of [...waiters]) release();
		},
	};
}

function gatedUploadClient(real: S3Client, key: string) {
	const gate = abortGate();
	let uploadPartCount = 0;
	let passedGateCount = 0;
	const client = wrapSend(real, async (command, options, next) => {
		if (command instanceof UploadPartCommand && command.input.Key === key) {
			const partNumber = ++uploadPartCount;
			await delayOrAbort(150, options?.abortSignal);
			if (partNumber > 2) await gate.wait();
			passedGateCount++;
		}
		return next();
	});
	return {
		client,
		gate,
		get uploadPartCount() {
			return uploadPartCount;
		},
		get passedGateCount() {
			return passedGateCount;
		},
	};
}

function destroySender(sender: ReturnType<typeof createIntegrationSender>): void {
	sender.destroyed = true;
	for (const listener of [...(sender.listeners.get("destroyed") ?? [])]) {
		listener();
	}
}

beforeAll(async () => {
	harness = await setupHarness({ dialog, clients });
	await createTestBucket(harness.s3Client, bucket);
	bucketCreated = true;
	tempDirectory = await mkdtemp(join(tmpdir(), "s3-transfer-integration-"));
	largeFile = join(tempDirectory, "large-fixture.bin");
	await writeFile(largeFile, randomBytes(multipartBytes));
	await harness.s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: largeObjectKey,
			Body: createReadStream(largeFile),
			ContentLength: multipartBytes,
		}),
	);
}, 120_000);

afterAll(async () => {
	if (!harness) return;
	try {
		if (bucketCreated) {
			const multipart = await harness.s3Client.send(new ListMultipartUploadsCommand({ Bucket: bucket }));
			for (const upload of multipart.Uploads ?? []) {
				if (!upload.Key || !upload.UploadId) continue;
				await harness.s3Client.send(
					new AbortMultipartUploadCommand({
						Bucket: bucket,
						Key: upload.Key,
						UploadId: upload.UploadId,
					}),
				);
			}
			await emptyAndDeleteBucket(harness.s3Client, bucket);
		}
	} finally {
		await harness.cleanup();
		if (tempDirectory) {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	}
}, 120_000);

describe("RustFS transfer IPC integration", () => {
	it("round-trips a multipart upload and download with matching SHA-256", async () => {
		const uploadPath = join(tempDirectory, "round-trip.bin");
		const downloadPath = join(tempDirectory, "round-trip-download.bin");
		await writeFile(uploadPath, randomBytes(roundTripBytes));
		openPaths = [uploadPath];
		savePath = downloadPath;
		openDialogCalls.length = 0;
		saveDialogCalls.length = 0;
		let multipartCreateCount = 0;
		let partCount = 0;
		let completeCount = 0;
		wrapClient = (client) =>
			wrapSend(client, async (command, _options, next) => {
				if (command instanceof CreateMultipartUploadCommand) {
					multipartCreateCount++;
				}
				if (command instanceof UploadPartCommand) partCount++;
				if (command instanceof CompleteMultipartUploadCommand) completeCount++;
				return next();
			});
		const owner = createIntegrationSender();
		const uploaded = success<{ transferIds: string[] }>(
			await invoke(
				channels.transfersUpload,
				{
					connectionId: harness.connection.id,
					bucket,
					prefix: "round-trip/",
				},
				owner,
			),
		);
		expect(openDialogCalls).toEqual([{ properties: ["openFile", "multiSelections"] }]);
		expect(uploaded.transferIds).toHaveLength(1);
		const uploadId = uploaded.transferIds[0]!;
		const uploadDone = await waitForDone(owner, uploadId);
		expect(uploadDone.status).toBe("completed");
		expect(multipartCreateCount).toBe(1);
		expect(partCount).toBeGreaterThan(0);
		expect(completeCount).toBe(1);
		expectProgressWithinSize(owner, uploadId, roundTripBytes);

		wrapClient = (client) => client;
		const downloaded = success<{ transferId: string | null }>(
			await invoke(
				channels.transfersDownload,
				{
					connectionId: harness.connection.id,
					bucket,
					key: "round-trip/round-trip.bin",
				},
				owner,
			),
		);
		expect(saveDialogCalls).toEqual([{ defaultPath: "round-trip.bin" }]);
		expect(downloaded.transferId).not.toBeNull();
		const downloadId = downloaded.transferId!;
		const downloadDone = await waitForDone(owner, downloadId);
		expect(downloadDone.status).toBe("completed");
		expectProgressWithinSize(owner, downloadId, roundTripBytes);
		const [source, downloadedFile] = await Promise.all([readFile(uploadPath), readFile(downloadPath)]);
		expect(createHash("sha256").update(downloadedFile).digest("hex")).toBe(
			createHash("sha256").update(source).digest("hex"),
		);
	});

	it("cancels a gated upload and cleans up multipart state", async () => {
		openPaths = [largeFile];
		const gated = gatedUploadClient(await harness.factory.get(harness.connection), uploadCancelKey);
		wrapClient = () => gated.client;
		const owner = createIntegrationSender();
		let cancelResponse: Promise<unknown> | undefined;
		let cancelLoaded = 0;
		const normalSend = owner.send.bind(owner);
		owner.send = (channel, payload) => {
			normalSend(channel, payload);
			if (channel !== events.transferProgress || cancelResponse || (payload as Progress).loaded <= 0) {
				return;
			}
			cancelLoaded = (payload as Progress).loaded;
			const transferId = (payload as Progress).transferId;
			cancelResponse = invoke(channels.transfersCancel, { transferId }, owner).finally(() => gated.gate.release());
		};

		try {
			const response = success<{ transferIds: string[] }>(
				await invoke(
					channels.transfersUpload,
					{
						connectionId: harness.connection.id,
						bucket,
						prefix: "cancel-upload/",
					},
					owner,
				),
			);
			const transferId = response.transferIds[0]!;
			await waitFor(() => gated.uploadPartCount > 0, 30_000);
			await waitFor(() => cancelResponse !== undefined, 30_000);
			const done = await waitForDone(owner, transferId, 30_000);
			expect(done.status).toBe("cancelled");
			expect(cancelLoaded).toBeGreaterThan(0);
			expectProgressWithinSize(owner, transferId, multipartBytes);
			expect(cancelResponse).toBeDefined();
			expect(success<{ cancelled: boolean }>(await cancelResponse)).toEqual({
				cancelled: true,
			});
			expect(gated.uploadPartCount).toBeGreaterThan(0);
			expect(gated.passedGateCount).toBeGreaterThan(0);
			await waitFor(() => objectIsMissing(uploadCancelKey), 30_000);
			await waitFor(multipartUploadsAreEmpty, 30_000);
		} finally {
			gated.gate.release();
		}
	});

	it("cancels a 50 MiB download and removes temp and destination files", async () => {
		const destination = join(tempDirectory, "cancelled-download.bin");
		await rm(destination, { force: true });
		savePath = destination;
		wrapClient = (client) =>
			wrapSend(client, async (command, options, next) => {
				if (!(command instanceof GetObjectCommand) || command.input.Key !== largeObjectKey) {
					return next();
				}
				const response = (await next()) as {
					Body?: unknown;
					[key: string]: unknown;
				};
				if (!(response.Body instanceof Readable)) {
					throw new Error("RustFS GetObject did not return a readable body");
				}
				const source = response.Body;
				const signal = options?.abortSignal;
				const delayedBody = Readable.from(
					(async function* () {
						try {
							await delayOrAbort(150, signal);
							const iterator = source[Symbol.asyncIterator]();
							const first = await iterator.next();
							if (!first.done) yield first.value;
							await new Promise<never>((_resolve, reject) => {
								if (signal?.aborted) {
									reject(new Error("Aborted"));
									return;
								}
								signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
							});
						} finally {
							source.destroy();
						}
					})(),
				);
				return { ...response, Body: delayedBody };
			});
		const owner = createIntegrationSender();
		let cancelResponse: Promise<unknown> | undefined;
		let cancelLoaded = 0;
		const normalSend = owner.send.bind(owner);
		owner.send = (channel, payload) => {
			normalSend(channel, payload);
			if (channel !== events.transferProgress || cancelResponse || (payload as Progress).loaded <= 0) {
				return;
			}
			cancelLoaded = (payload as Progress).loaded;
			cancelResponse = invoke(channels.transfersCancel, { transferId: (payload as Progress).transferId }, owner);
		};
		const response = success<{ transferId: string | null }>(
			await invoke(
				channels.transfersDownload,
				{
					connectionId: harness.connection.id,
					bucket,
					key: largeObjectKey,
				},
				owner,
			),
		);
		expect(response.transferId).not.toBeNull();
		const transferId = response.transferId!;
		const done = await waitForDone(owner, transferId, 30_000);
		expect(done.status).toBe("cancelled");
		expect(cancelLoaded).toBeGreaterThan(0);
		expectProgressWithinSize(owner, transferId, multipartBytes);
		expect(cancelResponse).toBeDefined();
		expect(success<{ cancelled: boolean }>(await cancelResponse)).toEqual({
			cancelled: true,
		});
		await waitFor(async () => {
			try {
				await readFile(`${destination}.part`);
				return false;
			} catch (error) {
				if ((error as { code?: string }).code === "ENOENT") return true;
				throw error;
			}
		}, 30_000);
		await waitFor(async () => {
			try {
				await readFile(destination);
				return false;
			} catch (error) {
				if ((error as { code?: string }).code === "ENOENT") return true;
				throw error;
			}
		}, 30_000);
	});

	it("uploads a zero-byte file and rejects invalid uploadPaths entries", async () => {
		const zeroFile = join(tempDirectory, "zero-byte.bin");
		const directory = join(tempDirectory, "not-a-file");
		const missing = join(tempDirectory, "missing-file.bin");
		await writeFile(zeroFile, Buffer.alloc(0));
		await mkdir(directory, { recursive: true });
		openPaths = [];
		const owner = createIntegrationSender();
		const response = success<{
			transferIds: string[];
			rejectedCount: number;
		}>(
			await invoke(
				channels.transfersUploadPaths,
				{
					connectionId: harness.connection.id,
					bucket,
					prefix: "verified/",
					paths: [zeroFile, "relative/file.bin", missing, directory],
				},
				owner,
			),
		);
		expect(response.rejectedCount).toBe(3);
		expect(response.transferIds).toHaveLength(1);
		const transferId = response.transferIds[0]!;
		expect((await waitForDone(owner, transferId)).status).toBe("completed");
		const head = await harness.s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: "verified/zero-byte.bin" }));
		expect(head.ContentLength).toBe(0);
		expectProgressWithinSize(owner, transferId, 0);
		expect(progressFor(owner, transferId).map((event) => event.key)).toContain("verified/zero-byte.bin");
	});

	it("destroys the sender during a gated upload without later events", async () => {
		const gated = gatedUploadClient(await harness.factory.get(harness.connection), "destroy-upload/large-fixture.bin");
		wrapClient = () => gated.client;
		openPaths = [largeFile];
		const owner = createIntegrationSender();
		let sentWhenDestroyed = -1;
		let destroyedLoaded = 0;
		let destroyedTransferId = "";
		const normalSend = owner.send.bind(owner);
		owner.send = (channel, payload) => {
			normalSend(channel, payload);
			if (channel === events.transferProgress && sentWhenDestroyed < 0 && (payload as Progress).loaded > 0) {
				destroyedLoaded = (payload as Progress).loaded;
				destroyedTransferId = (payload as Progress).transferId;
				destroySender(owner);
				gated.gate.release();
				sentWhenDestroyed = owner.sent.length;
			}
		};
		try {
			await invoke(
				channels.transfersUpload,
				{
					connectionId: harness.connection.id,
					bucket,
					prefix: "destroy-upload/",
				},
				owner,
			);
			await waitFor(() => sentWhenDestroyed > 0, 30_000);
			expect(destroyedLoaded).toBeGreaterThan(0);
			expectProgressWithinSize(owner, destroyedTransferId, multipartBytes);
			expect(sentWhenDestroyed).toBeGreaterThan(0);
			await waitFor(() => (owner.listeners.get("destroyed")?.length ?? 0) === 0, 30_000);
			await waitFor(multipartUploadsAreEmpty, 30_000);
			expect(owner.sent).toHaveLength(sentWhenDestroyed);
			expect(owner.sent.some((entry) => entry.channel === events.transferDone)).toBe(false);
		} finally {
			gated.gate.release();
		}
	});
});
