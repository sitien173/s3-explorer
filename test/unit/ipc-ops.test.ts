import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ConnectionStore } from "../../src/main/connections/store";
import { SecretVault } from "../../src/main/connections/secrets";
import type { DialogLike } from "../../src/main/ipc/ops";
import { register, type SenderLike } from "../../src/main/ipc/register";
import {
	TransferManager,
	type DownloadInput,
	type UploadInput,
} from "../../src/main/s3/transfers";
import { channels, events } from "../../src/shared/channels";
import {
	opsProgressPayloadSchema,
	transferDonePayloadSchema,
	transferProgressPayloadSchema,
} from "../../src/shared/ipc";
import { assertNoSecrets } from "./secret-scan";

function cipher() {
	return {
		isEncryptionAvailable: () => true,
		getSelectedStorageBackend: () => "secure",
		encryptString: (value: string) => Buffer.from(value),
		decryptString: (value: Buffer) => value.toString(),
	};
}
function sender(): SenderLike & {
	sent: { channel: string; payload: unknown }[];
	destroyed: boolean;
} {
	return {
		sent: [],
		destroyed: false,
		send(channel, payload) {
			this.sent.push({ channel, payload });
		},
		isDestroyed() {
			return this.destroyed;
		},
		once() {},
		removeListener() {},
	};
}

describe("ops IPC", () => {
	it("registers all six operation channels", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ops-ipc-"));
		const store = new ConnectionStore(
			dir,
			new SecretVault(dir, cipher() as never),
		);
		const handlers = new Map<
			string,
			(event: { sender: SenderLike }, input: unknown) => unknown
		>();
		register(
			{
				handle: (channel, listener) => {
					handlers.set(channel, listener);
				},
			},
			{
				store,
				clients: { get: async () => ({ send: async () => ({}) }) } as never,
			},
		);
		for (const channel of [
			channels.opsCreateFolder,
			channels.opsDelete,
			channels.opsDeletePrefix,
			channels.opsCountPrefix,
			channels.opsRename,
			channels.opsRenamePrefix,
		])
			expect(handlers.has(channel)).toBe(true);
	});
	it("validates request, resolves connection, reports partial operation and emits validated progress safely", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ops-ipc-real-"));
		const store = new ConnectionStore(
			dir,
			new SecretVault(dir, cipher() as never),
		);
		const connection = await store.create({
			kind: "manual",
			name: "Fixture",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const handlers = new Map<
			string,
			(event: { sender: SenderLike }, input: unknown) => unknown
		>();
		const calls: string[] = [];
		const client = {
			send: async (command: {
				constructor: { name: string };
				input: Record<string, unknown>;
			}) => {
				calls.push(command.constructor.name);
				if (command.constructor.name === "ListObjectsV2Command")
					return command.input.Prefix === "docs/"
						? { Contents: [{ Key: "docs/a", Size: 1 }], IsTruncated: false }
						: { Contents: [], IsTruncated: false };
				if (command.constructor.name === "CopyObjectCommand")
					return { CopyObjectResult: { ETag: "etag" } };
				if (command.constructor.name === "DeleteObjectCommand")
					throw Object.assign(new Error("AKIAFIXTUREFIXTURE00"), {
						name: "AccessDenied",
					});
				if (command.constructor.name === "DeleteObjectsCommand") {
					const input = command.input.Delete as { Objects: { Key: string }[] };
					return { Deleted: input.Objects.map((item) => ({ Key: item.Key })) };
				}
				return {}; 
			},
		};
		register(
			{
				handle: (channel, listener) => {
					handlers.set(
						channel,
						listener as typeof handlers extends Map<string, infer F>
							? F
							: never,
					);
				},
			},
			{ store, clients: { get: async () => client } as never },
		);
		const s = sender();
		const invalid = await handlers.get(channels.opsCreateFolder)!(
			{ sender: s },
			{ connectionId: "x", bucket: "bad/name", parent: "", name: "." },
		);
		expect(invalid).toMatchObject({
			ok: false,
			error: { code: "INVALID_REQUEST" },
		});
		const missing = await handlers.get(channels.opsCountPrefix)!(
			{ sender: s },
			{ connectionId: "missing", bucket: "bucket", prefix: "p/" },
		);
		expect(missing).toMatchObject({
			ok: false,
			error: { code: "NOT_FOUND", message: "Request failed" },
		});
		const result = await handlers.get(channels.opsRenamePrefix)!(
			{ sender: s },
			{
				opId: "job-12345678",
				connectionId: connection.id,
				bucket: "bucket",
				fromPrefix: "docs/",
				toPrefix: "archive/",
			},
		);
		expect(result).toMatchObject({
			ok: true,
			data: {
				completed: [],
				remaining: ["docs/a"],
				error: { code: "ACCESS_DENIED", message: "Access denied" },
			},
		});
		const deleted = await handlers.get(channels.opsDelete)!(
			{ sender: s },
			{
				opId: "job-progress1",
				connectionId: connection.id,
				bucket: "bucket",
				keys: ["fixture"],
			},
		);
		expect(deleted).toMatchObject({
			ok: true,
			data: { completed: ["fixture"], remaining: [] },
		});
		const progress = s.sent.filter((x) => x.channel === events.opsProgress);
		expect(progress.length).toBeGreaterThan(0);
		for (const entry of progress)
			expect(opsProgressPayloadSchema.parse(entry.payload)).toEqual(
				entry.payload,
			);
		for (const response of [
			invalid,
			missing,
			result,
			deleted,
			...s.sent.map((x) => x.payload),
		])
			assertNoSecrets(response);
	});
	it("does not send progress after the requesting sender is destroyed", async () => {
		const dir = await mkdtemp(join(tmpdir(), "ops-ipc-destroy-"));
		const store = new ConnectionStore(
			dir,
			new SecretVault(dir, cipher() as never),
		);
		const connection = await store.create({
			kind: "manual",
			name: "Fixture",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const handlers = new Map<
			string,
			(event: { sender: SenderLike }, input: unknown) => unknown
		>();
		let senderRef: ReturnType<typeof sender>;
		const client = {
			send: async (command: { constructor: { name: string } }) => {
				if (command.constructor.name === "ListObjectsV2Command") {
					senderRef.destroyed = true;
					return {
						Contents: [{ Key: "empty/item", Size: 1 }],
						IsTruncated: false,
					};
				}
				if (command.constructor.name === "DeleteObjectsCommand") {
					return { Deleted: [{ Key: "empty/item" }] };
				}
				return {};
			},
		};
		register(
			{
				handle: (channel, listener) => {
					handlers.set(channel, listener as never);
				},
			},
			{ store, clients: { get: async () => client } as never },
		);
		senderRef = sender();
		await handlers.get(channels.opsDeletePrefix)!(
			{ sender: senderRef },
			{
				opId: "job-12345678",
				connectionId: connection.id,
				bucket: "bucket",
				prefix: "empty/",
			},
		);
		expect(senderRef.sent).toEqual([]);
	});
});

type Handler = (event: { sender: SenderLike }, input: unknown) => unknown;
type FakeSender = ReturnType<typeof sender>;

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 2000;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting");
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
}

function dataOf(response: unknown): Record<string, unknown> {
	return (response as { data: Record<string, unknown> }).data;
}

describe("transfer IPC", () => {
	const directories: string[] = [];
	afterEach(async () => {
		for (const directory of directories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	async function tempDir(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}

	async function harness(
		options: {
			dialog?: DialogLike | null;
			maxActiveTransfers?: number;
			useManager?: boolean;
			client?: unknown;
		} = {},
	) {
		const dir = await tempDir("transfer-ipc-");
		const store = new ConnectionStore(
			dir,
			new SecretVault(dir, cipher() as never),
		);
		const connection = await store.create({
			kind: "manual",
			name: "Fixture",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const uploads: UploadInput[] = [];
		const downloads: DownloadInput[] = [];
		const manager = new TransferManager({
			runners: {
				upload: async (input, signal) => {
					uploads.push(input);
					if (input.key.includes("hang")) {
						await new Promise<void>((_resolve, reject) => {
							signal.addEventListener("abort", () => {
								reject(new Error("aborted"));
							});
						});
					}
					if (input.key.includes("boom")) {
						throw Object.assign(new Error("AKIAFIXTUREFIXTURE00"), {
							name: "Boom",
						});
					}
				},
				download: async (input, signal) => {
					downloads.push(input);
					if (input.key.includes("hang")) {
						await new Promise<void>((_resolve, reject) => {
							signal.addEventListener("abort", () => {
								reject(new Error("aborted"));
							});
						});
					}
				},
			},
		});
		const handlers = new Map<string, Handler>();
		const dialog = options.dialog === null ? undefined : options.dialog;
		register(
			{
				handle: (channel, listener) => {
					handlers.set(channel, listener as Handler);
				},
			},
			{
				store,
				clients: { get: async () => options.client ?? { send: async () => ({}) } } as never,
				...(dialog ? { dialog } : {}),
				...(options.maxActiveTransfers
					? { maxActiveTransfers: options.maxActiveTransfers }
					: {}),
				...(options.useManager === false ? {} : { transfers: manager }),
			},
		);
		async function call(
			channel: string,
			from: FakeSender,
			input: unknown,
		): Promise<unknown> {
			const handler = handlers.get(channel);
			if (!handler) {
				return { ok: false, error: { code: "UNREGISTERED", message: channel } };
			}
			return handler({ sender: from }, input);
		}
		function assertAllSafe(...senders: FakeSender[]): void {
			for (const from of senders) {
				for (const entry of from.sent) {
					assertNoSecrets(entry.payload);
					if (entry.channel === events.transferProgress) {
						expect(transferProgressPayloadSchema.parse(entry.payload)).toEqual(
							entry.payload,
						);
					}
					if (entry.channel === events.transferDone) {
						expect(transferDonePayloadSchema.parse(entry.payload)).toEqual(
							entry.payload,
						);
					}
				}
			}
		}
		const doneStatus = (from: FakeSender, id: string) =>
			(
				from.sent.find(
					(entry) =>
						entry.channel === events.transferDone &&
						(entry.payload as { transferId: string }).transferId === id,
				)?.payload as { status: string } | undefined
			)?.status;
		return {
			connection,
			handlers,
			uploads,
			downloads,
			manager,
			call,
			assertAllSafe,
			doneStatus,
		};
	}

	function fakeDialog(
		open: { canceled: boolean; filePaths: string[] },
		save: { canceled: boolean; filePath?: string },
	) {
		const openCalls: unknown[] = [];
		const saveCalls: unknown[] = [];
		const dialog: DialogLike = {
			showOpenDialog: async (options) => {
				openCalls.push(options);
				return open;
			},
			showSaveDialog: async (options) => {
				saveCalls.push(options);
				return save;
			},
		};
		return { dialog, openCalls, saveCalls };
	}

	it("registers all four transfer channels", async () => {
		const { handlers } = await harness();
		for (const channel of [
			channels.transfersUpload,
			channels.transfersUploadPaths,
			channels.transfersDownload,
			channels.transfersCancel,
		]) {
			expect(handlers.has(channel)).toBe(true);
		}
	});

	it("uploads the files chosen in the open dialog under the prefix", async () => {
		const directory = await tempDir("transfer-files-");
		const first = join(directory, "report.txt");
		const second = join(directory, "photo.png");
		await writeFile(first, "a");
		await writeFile(second, "b");
		const picker = fakeDialog(
			{ canceled: false, filePaths: [first, second] },
			{ canceled: true },
		);
		const t = await harness({ dialog: picker.dialog });
		const owner = sender();
		const response = await t.call(channels.transfersUpload, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "docs/",
		});
		expect(picker.openCalls).toEqual([
			{ properties: ["openFile", "multiSelections"] },
		]);
		expect(response).toMatchObject({ ok: true });
		const ids = dataOf(response).transferIds as string[];
		expect(ids).toHaveLength(2);
		await waitFor(() => ids.every((id) => t.doneStatus(owner, id)));
		expect(t.uploads.map((upload) => [upload.key, upload.localPath])).toEqual([
			["docs/report.txt", first],
			["docs/photo.png", second],
		]);
		expect(t.uploads.map((upload) => upload.key)).toEqual(
			[first, second].map((path) => `docs/${basename(path)}`),
		);
		for (const id of ids) expect(t.doneStatus(owner, id)).toBe("completed");
		t.assertAllSafe(owner);
		assertNoSecrets(response);
	});

	it("returns no transfers when the open dialog is closed", async () => {
		const picker = fakeDialog({ canceled: true, filePaths: [] }, { canceled: true });
		const t = await harness({ dialog: picker.dialog });
		const owner = sender();
		const response = await t.call(channels.transfersUpload, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "",
		});
		expect(response).toEqual({ ok: true, data: { transferIds: [] } });
		expect(t.uploads).toEqual([]);
		expect(owner.sent).toEqual([]);
	});

	it("opens the save dialog with the key's last segment and downloads", async () => {
		const directory = await tempDir("transfer-save-");
		const destPath = join(directory, "chosen.txt");
		const picker = fakeDialog(
			{ canceled: true, filePaths: [] },
			{ canceled: false, filePath: destPath },
		);
		const t = await harness({ dialog: picker.dialog });
		const owner = sender();
		const response = await t.call(channels.transfersDownload, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			key: "docs/deep/report.txt",
		});
		expect(picker.saveCalls).toEqual([{ defaultPath: "report.txt" }]);
		const id = dataOf(response).transferId as string;
		expect(typeof id).toBe("string");
		await waitFor(() => t.doneStatus(owner, id) !== undefined);
		expect(t.downloads.map((item) => [item.key, item.destPath])).toEqual([
			["docs/deep/report.txt", destPath],
		]);
		expect(t.doneStatus(owner, id)).toBe("completed");
		t.assertAllSafe(owner);
		assertNoSecrets(response);
	});

	it("returns a null transfer id when the save dialog is closed", async () => {
		const picker = fakeDialog({ canceled: true, filePaths: [] }, { canceled: true });
		const t = await harness({ dialog: picker.dialog });
		const owner = sender();
		const response = await t.call(channels.transfersDownload, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			key: "a/b.txt",
		});
		expect(response).toEqual({ ok: true, data: { transferId: null } });
		expect(t.downloads).toEqual([]);
	});

	it("accepts only absolute regular files in uploadPaths", async () => {
		const directory = await tempDir("transfer-paths-");
		const file = join(directory, "keep.txt");
		const folder = join(directory, "folder");
		await writeFile(file, "x");
		await mkdir(folder);
		const t = await harness();
		const owner = sender();
		const response = await t.call(channels.transfersUploadPaths, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "in/",
			paths: [file, "relative/file.txt", join(directory, "missing.txt"), folder],
		});
		expect(response).toMatchObject({ ok: true, data: { rejectedCount: 3 } });
		const ids = dataOf(response).transferIds as string[];
		expect(ids).toHaveLength(1);
		await waitFor(() => t.doneStatus(owner, ids[0] as string) !== undefined);
		expect(t.uploads.map((upload) => upload.key)).toEqual(["in/keep.txt"]);
		expect(t.uploads).toHaveLength(1);
		t.assertAllSafe(owner);
		assertNoSecrets(response);
	});

	it("rejects every path when none is a regular file", async () => {
		const t = await harness();
		const owner = sender();
		const response = await t.call(channels.transfersUploadPaths, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "",
			paths: ["relative.txt"],
		});
		expect(response).toEqual({
			ok: true,
			data: { transferIds: [], rejectedCount: 1 },
		});
		expect(t.uploads).toEqual([]);
	});

	it("throws Dialog unavailable without a dialog, before any store work", async () => {
		const t = await harness({ dialog: null });
		const owner = sender();
		const expected = {
			ok: false,
			error: { code: "REQUEST_FAILED", message: "Dialog unavailable" },
		};
		expect(
			await t.call(channels.transfersUpload, owner, {
				connectionId: t.connection.id,
				bucket: "bucket",
				prefix: "",
			}),
		).toEqual(expected);
		expect(
			await t.call(channels.transfersDownload, owner, {
				connectionId: "missing-connection",
				bucket: "bucket",
				key: "a.txt",
			}),
		).toEqual(expected);
	});

	it("reports NOT_FOUND for a missing connection on every transfer channel", async () => {
		const picker = fakeDialog({ canceled: true, filePaths: [] }, { canceled: true });
		const t = await harness({ dialog: picker.dialog });
		const owner = sender();
		const missing = {
			ok: false,
			error: { code: "NOT_FOUND", message: "Request failed" },
		};
		const base = { connectionId: "missing-connection", bucket: "bucket" };
		const responses = [
			await t.call(channels.transfersUpload, owner, { ...base, prefix: "" }),
			await t.call(channels.transfersUploadPaths, owner, {
				...base,
				prefix: "",
				paths: ["/tmp/x"],
			}),
			await t.call(channels.transfersDownload, owner, { ...base, key: "a.txt" }),
		];
		for (const response of responses) {
			expect(response).toEqual(missing);
			assertNoSecrets(response);
		}
		expect(picker.openCalls).toEqual([]);
		expect(picker.saveCalls).toEqual([]);
	});

	it("cancels only for the owning sender", async () => {
		const directory = await tempDir("transfer-cancel-");
		const file = join(directory, "hang.bin");
		await writeFile(file, "x");
		const t = await harness();
		const owner = sender();
		const foreign = sender();
		const started = await t.call(channels.transfersUploadPaths, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "",
			paths: [file],
		});
		const id = (dataOf(started).transferIds as string[])[0] as string;
		await waitFor(() => t.uploads.length === 1);
		expect(await t.call(channels.transfersCancel, foreign, { transferId: id })).toEqual(
			{ ok: true, data: { cancelled: false } },
		);
		expect(
			await t.call(channels.transfersCancel, owner, {
				transferId: "unknown-transfer-id",
			}),
		).toEqual({ ok: true, data: { cancelled: false } });
		expect(await t.call(channels.transfersCancel, owner, { transferId: id })).toEqual(
			{ ok: true, data: { cancelled: true } },
		);
		await waitFor(() => t.doneStatus(owner, id) !== undefined);
		expect(t.doneStatus(owner, id)).toBe("cancelled");
		expect(foreign.sent).toEqual([]);
		expect(await t.call(channels.transfersCancel, owner, { transferId: id })).toEqual(
			{ ok: true, data: { cancelled: false } },
		);
		t.assertAllSafe(owner, foreign);
	});

	it("reports a runner failure as transferDone failed without secrets", async () => {
		const directory = await tempDir("transfer-fail-");
		const file = join(directory, "boom.bin");
		await writeFile(file, "x");
		const t = await harness();
		const owner = sender();
		const response = await t.call(channels.transfersUploadPaths, owner, {
			connectionId: t.connection.id,
			bucket: "bucket",
			prefix: "",
			paths: [file],
		});
		expect(response).toMatchObject({ ok: true });
		const id = (dataOf(response).transferIds as string[])[0] as string;
		await waitFor(() => t.doneStatus(owner, id) !== undefined);
		expect(t.doneStatus(owner, id)).toBe("failed");
		const done = owner.sent.find((entry) => entry.channel === events.transferDone);
		expect(done?.payload).toMatchObject({
			status: "failed",
			error: { code: "REQUEST_FAILED", message: "Boom: [redacted]" },
		});
		t.assertAllSafe(owner);
	});

	it("honors maxActiveTransfers", async () => {
		const directory = await tempDir("transfer-max-");
		const picker = fakeDialog(
			{ canceled: true, filePaths: [] },
			{ canceled: false, filePath: join(directory, "out") },
		);
		const gets: string[] = [];
		const client = {
			send: (command: unknown, options?: { abortSignal?: AbortSignal }) => {
				if (!(command instanceof GetObjectCommand)) return Promise.resolve({});
				gets.push(command.input.Key ?? "");
				return new Promise<never>((_resolve, reject) => {
					options?.abortSignal?.addEventListener("abort", () => {
						reject(new Error("aborted"));
					});
				});
			},
		};
		const t = await harness({
			dialog: picker.dialog,
			maxActiveTransfers: 1,
			useManager: false,
			client,
		});
		const owner = sender();
		const ids: string[] = [];
		for (const key of ["one.bin", "two.bin"]) {
			const response = await t.call(channels.transfersDownload, owner, {
				connectionId: t.connection.id,
				bucket: "bucket",
				key,
			});
			ids.push(dataOf(response).transferId as string);
		}
		await waitFor(() => gets.length === 1);
		expect(gets).toEqual(["one.bin"]);
		await t.call(channels.transfersCancel, owner, { transferId: ids[0] as string });
		await waitFor(() => gets.length === 2);
		expect(gets).toEqual(["one.bin", "two.bin"]);
		await t.call(channels.transfersCancel, owner, { transferId: ids[1] as string });
		await waitFor(() => ids.every((id) => t.doneStatus(owner, id)));
		t.assertAllSafe(owner);
	});
});
