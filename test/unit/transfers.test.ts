import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { TransferManager, type Runners } from "../../src/main/s3/transfers";
import type { SenderLike } from "../../src/main/ipc/register";
import { events } from "../../src/shared/channels";
import { assertNoSecrets } from "./secret-scan";

function sender() {
	const listeners = new Map<string, (() => void)[]>();
	const value = {
		sent: [] as { channel: string; payload: unknown }[],
		destroyed: false,
		listeners,
		send(channel: string, payload: unknown) { this.sent.push({ channel, payload }); },
		isDestroyed() { return this.destroyed; },
		once(event: "destroyed", listener: () => void) {
			const list = listeners.get(event) ?? [];
			list.push(listener);
			listeners.set(event, list);
		},
		removeListener(event: "destroyed", listener: () => void) {
			const list = listeners.get(event) ?? [];
			const index = list.indexOf(listener);
			if (index >= 0) list.splice(index, 1);
		},
	};
	return value as typeof value & SenderLike;
}

const input = (owner: SenderLike, key = "file") => ({
	client: { send: async () => ({}) } as never,
	sender: owner,
	bucket: "bucket",
	key,
	localPath: "/tmp/file",
});
const waitFor = async (predicate: () => boolean) => {
	const deadline = Date.now() + 2000;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for transfer");
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
};

function heldBody(content: string) {
	let notifyStarted!: () => void;
	let announced = false;
	const started = new Promise<void>((resolve) => {
		notifyStarted = resolve;
	});
	const body = new Readable({
		read() {
			if (announced) return;
			announced = true;
			notifyStarted();
		},
	});
	return {
		body,
		started,
		release() {
			body.push(Buffer.from(content));
			body.push(null);
		},
	};
}

 describe("TransferManager", () => {
	it("returns ids synchronously and sends the initial event for running and queued transfers", async () => {
		let release!: () => void;
		const runners: Partial<Runners> = { upload: () => new Promise<void>((resolve) => { release = resolve; }) };
		const manager = new TransferManager({ maxActive: 1, runners });
		const owner = sender();
		const first = manager.startUpload(input(owner, "first"));
		const second = manager.startUpload(input(owner, "second"));
		expect(typeof first).toBe("string");
		expect(owner.sent.filter((event) => event.channel === events.transferProgress)).toHaveLength(2);
		expect(owner.sent.map((event) => event.payload)).toEqual(expect.arrayContaining([
			expect.objectContaining({ transferId: first, loaded: 0 }),
			expect.objectContaining({ transferId: second, loaded: 0 }),
		]));
		expect(manager.activeCount).toBe(1);
		expect(manager.queuedCount).toBe(1);
		release();
		await waitFor(() => manager.size === 1);
		await manager.cancel(second, owner);
	});

	it.each([1, 2])("runs FIFO with maxActive %i", async (maxActive) => {
		const started: string[] = [];
		let active = 0;
		let peak = 0;
		const manager = new TransferManager({ maxActive, runners: { upload: async (transfer) => {
			started.push(transfer.key);
			active++;
			peak = Math.max(peak, active);
			await new Promise<void>((resolve) => setImmediate(resolve));
			active--;
		} } });
		const owner = sender();
		for (let index = 0; index < 4; index++) manager.startUpload(input(owner, `k${index}`));
		await waitFor(() => manager.size === 0);
		expect(started).toEqual(["k0", "k1", "k2", "k3"]);
		expect(peak).toBe(maxActive);
		expect(manager.activeCount).toBe(0);
		expect(manager.queuedCount).toBe(0);
	});

	it("cancels queued jobs and running jobs despite arbitrary runner rejection", async () => {
		let release!: (error?: unknown) => void;
		let started = 0;
		const manager = new TransferManager({ maxActive: 1, runners: { upload: (_transfer, signal) => {
			started++;
			return new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => { release = reject; });
			});
		} } });
		const owner = sender();
		const running = manager.startUpload(input(owner, "running"));
		const queued = manager.startUpload(input(owner, "queued"));
		await waitFor(() => started === 1);
		await expect(manager.cancel(queued, owner)).resolves.toBe(true);
		await expect(manager.cancel(running, owner)).resolves.toBe(true);
		release(new Error("whatever"));
		await waitFor(() => manager.size === 0);
		expect(started).toBe(1);
		expect(owner.sent.filter((event) => event.channel === events.transferDone)).toHaveLength(2);
		expect(owner.sent.filter((event) => event.channel === events.transferDone).map((event) => (event.payload as { status: string }).status)).toEqual(["cancelled", "cancelled"]);
	});

	it.each([
		["resolves", "completed"],
		["rejects", "cancelled"],
	])("reports the truthful status when a runner %s after cancel", async (mode, status) => {
		let settle!: () => void;
		let started = false;
		const manager = new TransferManager({
			runners: {
				upload: () => {
					started = true;
					return new Promise<void>((resolve, reject) => {
						settle = mode === "resolves" ? resolve : () => reject(new Error("late"));
					});
				},
			},
		});
		const owner = sender();
		const id = manager.startUpload(input(owner));
		await waitFor(() => started);
		await expect(manager.cancel(id, owner)).resolves.toBe(true);
		settle();
		await waitFor(() => manager.size === 0);
		const done = owner.sent.filter((event) => event.channel === events.transferDone);
		expect(done).toHaveLength(1);
		expect(done[0]?.payload).toMatchObject({ status });
	});

	it("rejects foreign, unknown and finished cancellation; sends one terminal event and maps failure", async () => {
		const manager = new TransferManager({ runners: { upload: async () => { throw Object.assign(new Error("AWS secret text"), { name: "AccessDenied" }); } } });
		const owner = sender();
		const foreign = sender();
		const id = manager.startUpload(input(owner));
		expect(await manager.cancel(id, foreign)).toBe(false);
		await waitFor(() => manager.size === 0);
		expect(await manager.cancel(id, owner)).toBe(false);
		expect(await manager.cancel("unknown-id", owner)).toBe(false);
		const done = owner.sent.filter((event) => event.channel === events.transferDone);
		expect(done).toHaveLength(1);
		expect(done[0]?.payload).toMatchObject({ status: "failed", error: { code: "ACCESS_DENIED", message: "Access denied" } });
	});

	it("throttles progress to at most one event per 100ms", async () => {
		vi.useFakeTimers();
		try {
			let sendProgress!: (loaded: number, total: number) => void;
			let finish!: () => void;
			const manager = new TransferManager({ runners: { upload: (_transfer, _signal, progress) => {
				sendProgress = progress;
				return new Promise<void>((resolve) => { finish = resolve; });
			} } });
			const owner = sender();
			manager.startUpload(input(owner));
			sendProgress(1, 5);
			sendProgress(2, 5);
			await vi.advanceTimersByTimeAsync(100);
			sendProgress(3, 5);
			expect(owner.sent.filter((event) => event.channel === events.transferProgress)).toHaveLength(2);
			finish();
			await vi.runAllTicks();
			await waitFor(() => manager.size === 0);
		} finally { vi.useRealTimers(); }
	});

	it("cleans manager/listeners after completion, failure, cancellation, and destroy", async () => {
		const owner = sender();
		const manager = new TransferManager({ runners: { upload: async () => undefined } });
		for (let index = 0; index < 25; index++) {
			manager.startUpload(input(owner, `k${index}`));
			await waitFor(() => manager.size === 0);
		}
		expect(owner.listeners.get("destroyed")?.length ?? 0).toBe(0);
		expect(manager.size).toBe(0);

		let sawSignal = false;
		const destroyedSender = sender();
		const destroyedManager = new TransferManager({ runners: { upload: (_transfer, signal) => new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => { sawSignal = true; reject(new Error("cancelled")); })) } });
		destroyedManager.startUpload(input(destroyedSender));
		destroyedSender.destroyed = true;
		for (const listener of [...(destroyedSender.listeners.get("destroyed") ?? [])]) listener();
		await waitFor(() => destroyedManager.size === 0);
		expect(sawSignal).toBe(true);
		expect(destroyedSender.sent.filter((event) => event.channel === events.transferDone)).toHaveLength(0);
		expect(destroyedSender.listeners.get("destroyed")?.length ?? 0).toBe(0);
	});

	it("removes queued entries on sender destroy without sending", async () => {
		let release!: () => void;
		const manager = new TransferManager({ maxActive: 1, runners: { upload: () => new Promise<void>((resolve) => { release = resolve; }) } });
		const owner = sender();
		manager.startUpload(input(owner, "active"));
		manager.startUpload(input(owner, "waiting"));
		owner.destroyed = true;
		for (const listener of [...(owner.listeners.get("destroyed") ?? [])]) listener();
		expect(manager.queuedCount).toBe(0);
		release();
		await waitFor(() => manager.size === 0);
		expect(owner.sent.filter((event) => event.channel === events.transferDone)).toHaveLength(0);
	});

	it("does not register transfers for a sender already destroyed", () => {
		const upload = vi.fn(() => new Promise<void>(() => undefined));
		const download = vi.fn(() => new Promise<void>(() => undefined));
		const manager = new TransferManager({ runners: { upload, download } });
		const owner = sender();
		owner.destroyed = true;

		const uploadId = manager.startUpload(input(owner, "upload"));
		const downloadId = manager.startDownload({
			client: { send: async () => ({}) } as never,
			sender: owner,
			bucket: "bucket",
			key: "download",
			destPath: "/tmp/download",
		});

		expect(uploadId).toBeTruthy();
		expect(downloadId).toBeTruthy();
		expect(upload).not.toHaveBeenCalled();
		expect(download).not.toHaveBeenCalled();
		expect(manager.size).toBe(0);
		expect(manager.activeCount).toBe(0);
		expect(manager.queuedCount).toBe(0);
		expect(owner.sent).toEqual([]);
		expect(owner.listeners.get("destroyed") ?? []).toHaveLength(0);
	});

	it("reports one failed terminal event for a synchronous runner throw", async () => {
		const manager = new TransferManager({
			runners: {
				upload: () => {
					throw new Error("sync failure");
				},
			},
		});
		const owner = sender();
		const id = manager.startUpload(input(owner));

		await waitFor(() => manager.size === 0);

		const done = owner.sent.filter(
			(event) => event.channel === events.transferDone,
		);
		expect(done).toHaveLength(1);
		expect(done[0]?.payload).toMatchObject({
			transferId: id,
			status: "failed",
			error: { code: "REQUEST_FAILED" },
		});
		expect(manager.size).toBe(0);
		expect(manager.activeCount).toBe(0);
		expect(manager.queuedCount).toBe(0);
	});

	it("catches synchronous runner throws and frees the slot for queued work", async () => {
		const manager = new TransferManager({
			maxActive: 1,
			runners: {
				upload: (transfer) => {
					if (transfer.key === "first") throw new Error("sync failure");
					return Promise.resolve();
				},
			},
		});
		const owner = sender();
		let firstId: string | undefined;

		expect(() => {
			firstId = manager.startUpload(input(owner, "first"));
		}).not.toThrow();
		const secondId = manager.startUpload(input(owner, "second"));
		await waitFor(() => manager.size === 0);

		const done = owner.sent.filter((event) => event.channel === events.transferDone);
		expect(done).toHaveLength(2);
		expect(done[0]?.payload).toMatchObject({
			transferId: firstId,
			status: "failed",
			error: { code: "REQUEST_FAILED" },
		});
		expect(done[1]?.payload).toMatchObject({
			transferId: secondId,
			status: "completed",
		});
		expect(manager.activeCount).toBe(0);
		expect(manager.queuedCount).toBe(0);
		expect(owner.listeners.get("destroyed") ?? []).toHaveLength(0);
	});
});

 describe("default transfer runners", () => {
	it("redacts an upload local path from failed transfer events", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-upload-error-"));
		try {
			const missingDirectory = join(directory, "not-created");
			const localPath = join(missingDirectory, "missing.txt");
			const owner = sender();
			const manager = new TransferManager();
			manager.startUpload({
				client: { send: async () => ({}) } as never,
				sender: owner,
				bucket: "bucket",
				key: "missing.txt",
				localPath,
			});
			await waitFor(() => manager.size === 0);

			const done = owner.sent.find(
				(event) => event.channel === events.transferDone,
			)?.payload as {
				status: string;
				error?: { code: string; message: string };
			};
			expect(done).toMatchObject({
				status: "failed",
				error: { code: "REQUEST_FAILED" },
			});
			expect(done.error?.message).toContain("ENOENT");
			expect(done.error?.message).toContain("[local file]");
			expect(done.error?.message).not.toContain(localPath);
			expect(done.error?.message).not.toContain(missingDirectory);
			assertNoSecrets(done);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("redacts download destination paths from failed transfer events", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-download-error-"));
		try {
			const missingDirectory = join(directory, "not-created");
			const destPath = join(missingDirectory, "download.bin");
			const owner = sender();
			const client = {
				send: async (command: unknown) =>
					command instanceof GetObjectCommand
						? { Body: Readable.from([Buffer.from("payload")]), ContentLength: 7 }
						: {},
			};
			const manager = new TransferManager();
			manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "download.bin",
				destPath,
			});
			await waitFor(() => manager.size === 0);

			const done = owner.sent.find(
				(event) => event.channel === events.transferDone,
			)?.payload as {
				status: string;
				error?: { code: string; message: string };
			};
			expect(done).toMatchObject({
				status: "failed",
				error: { code: "REQUEST_FAILED" },
			});
			expect(done.error?.message).toContain("ENOENT");
			expect(done.error?.message).toContain("[local file]");
			expect(done.error?.message).not.toContain(destPath);
			expect(done.error?.message).not.toContain(`${destPath}.part`);
			expect(done.error?.message).not.toContain(missingDirectory);
			assertNoSecrets(done);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("downloads readable bodies and removes partial files on failures", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-runner-"));
		try {
			const destPath = join(directory, "file");
			const body = Readable.from([Buffer.from("good")]);
			const manager = new TransferManager();
			const owner = sender();
			const client = { send: async (command: unknown) => command instanceof GetObjectCommand ? { Body: body, ContentLength: 4 } : {} };
			manager.startDownload({ client: client as never, sender: owner, bucket: "bucket", key: "key", destPath });
			await waitFor(() => manager.size === 0);
			expect(await readFile(destPath, "utf8")).toBe("good");
		} finally { await rm(directory, { recursive: true, force: true }); }
	});

	it.each(["short", "missing", "stream-error", "abort"])("cleans download temp output on %s", async (mode) => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-runner-"));
		try {
			const destPath = join(directory, "file");
			const owner = sender();
			const body = mode === "missing" ? undefined : mode === "short" ? Readable.from([Buffer.from("x")]) : new Readable({ read() { if (mode === "stream-error") this.destroy(new Error("stream failed")); } });
			const client = { send: async () => ({ Body: body, ContentLength: mode === "short" ? 2 : undefined }) };
			const manager = new TransferManager();
			const id = manager.startDownload({ client: client as never, sender: owner, bucket: "bucket", key: "key", destPath });
			if (mode === "abort") await manager.cancel(id, owner);
			await waitFor(() => manager.size === 0);
			expect(await stat(`${destPath}.${id}.part`).then(() => true, () => false)).toBe(false);
			expect(await stat(destPath + ".part").then(() => true, () => false)).toBe(false);
			expect(owner.sent.filter((event) => event.channel === events.transferDone)[0]?.payload).toMatchObject({ status: mode === "abort" ? "cancelled" : "failed" });
		} finally { await rm(directory, { recursive: true, force: true }); }
	});

	it("writes download to a unique part file per transfer and cleans it on failure", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-unique-part-"));
		try {
			const destPath = join(directory, "file");
			const owner = sender();
			let resolveStream!: () => void;
			const streamStarted = new Promise<void>((resolve) => {
				resolveStream = resolve;
			});
			const body = new Readable({
				read() {
					resolveStream();
				},
			});
			const client = {
				send: async () => ({ Body: body, ContentLength: 10 }),
			};
			const manager = new TransferManager();
			const id = manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "key",
				destPath,
			});
			await streamStarted;
			expect(
				await stat(`${destPath}.${id}.part`).then(
					() => true,
					() => false,
				),
			).toBe(true);
			body.destroy(new Error("fail"));
			await waitFor(() => manager.size === 0);
			expect(
				await stat(`${destPath}.${id}.part`).then(
					() => true,
					() => false,
				),
			).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("isolates part files for concurrent downloads to one destination", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-concurrent-"));
		try {
			const destPath = join(directory, "file");
			const manager = new TransferManager({ maxActive: 2 });
			const owner = sender();
			const firstBody = heldBody("first payload");
			const secondBody = heldBody("second payload");
			const client = {
				send: async (command: unknown) => {
					const key = (command as GetObjectCommand).input.Key;
					if (key === "file-1") {
						return {
							Body: firstBody.body,
							ContentLength: Buffer.byteLength("first payload"),
						};
					}
					return {
						Body: secondBody.body,
						ContentLength: Buffer.byteLength("second payload"),
					};
				},
			};
			const firstId = manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "file-1",
				destPath,
			});
			const secondId = manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "file-2",
				destPath,
			});
			const firstPartPath = `${destPath}.${firstId}.part`;
			const secondPartPath = `${destPath}.${secondId}.part`;

			await Promise.all([firstBody.started, secondBody.started]);
			await waitFor(
				() => existsSync(firstPartPath) && existsSync(secondPartPath),
			);
			expect(firstPartPath).not.toBe(secondPartPath);
			expect(manager.activeCount).toBe(2);
			expect(await stat(firstPartPath)).toBeDefined();
			expect(await stat(secondPartPath)).toBeDefined();

			firstBody.release();
			await waitFor(() => manager.size === 1);
			expect(await readFile(destPath, "utf8")).toBe("first payload");

			secondBody.release();
			await waitFor(() => manager.size === 0);
			expect(await readFile(destPath, "utf8")).toBe("second payload");
			const doneEvents = owner.sent.filter(
				(event) => event.channel === events.transferDone,
			);
			expect(doneEvents).toHaveLength(2);
			expect(doneEvents[0]?.payload).toMatchObject({
				transferId: firstId,
				status: "completed",
			});
			expect(doneEvents[1]?.payload).toMatchObject({
				transferId: secondId,
				status: "completed",
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("preserves both concurrent download destination files", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-concurrent-files-"));
		try {
			const firstDestPath = join(directory, "file-1");
			const secondDestPath = join(directory, "file-2");
			const firstBody = heldBody("first payload");
			const secondBody = heldBody("second payload");
			const owner = sender();
			const manager = new TransferManager({ maxActive: 2 });
			const client = {
				send: async (command: unknown) => {
					const key = (command as GetObjectCommand).input.Key;
					const transfer = key === "file-1" ? firstBody : secondBody;
					const content = key === "file-1" ? "first payload" : "second payload";
					return {
						Body: transfer.body,
						ContentLength: Buffer.byteLength(content),
					};
				},
			};
			const firstId = manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "file-1",
				destPath: firstDestPath,
			});
			const secondId = manager.startDownload({
				client: client as never,
				sender: owner,
				bucket: "bucket",
				key: "file-2",
				destPath: secondDestPath,
			});
			const firstPartPath = `${firstDestPath}.${firstId}.part`;
			const secondPartPath = `${secondDestPath}.${secondId}.part`;

			await Promise.all([firstBody.started, secondBody.started]);
			await waitFor(
				() => existsSync(firstPartPath) && existsSync(secondPartPath),
			);
			expect(firstPartPath).not.toBe(secondPartPath);
			expect(manager.activeCount).toBe(2);

			firstBody.release();
			secondBody.release();
			await waitFor(() => manager.size === 0);
			expect(await readFile(firstDestPath, "utf8")).toBe("first payload");
			expect(await readFile(secondDestPath, "utf8")).toBe("second payload");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("uploads regular and zero-byte files through the stubbed client", async () => {
		const directory = await mkdtemp(join(tmpdir(), "transfer-upload-"));
		try {
			for (const [name, contents, expectedSize] of [
				["small", "payload", 7],
				["empty", "", 0],
			] as const) {
				const localPath = join(directory, name);
				await writeFile(localPath, contents);
				const owner = sender();
				const commands: unknown[] = [];
				const manager = new TransferManager();
				manager.startUpload({
					client: {
						send: async (command: unknown) => {
							commands.push(command);
							return {};
						},
						config: {
							endpoint: async () => new URL("http://localhost"),
							forcePathStyle: true,
						},
					} as never,
					sender: owner,
					bucket: "bucket",
					key: name,
					localPath,
				});
				await waitFor(() => manager.size === 0);
				expect(owner.sent.filter((event) => event.channel === events.transferDone)[0]?.payload).toMatchObject({ status: "completed" });
				const putObjects = commands.filter(
					(command): command is PutObjectCommand =>
						command instanceof PutObjectCommand,
				);
				expect(putObjects).toHaveLength(1);
				expect(putObjects[0]?.input).toMatchObject({
					Bucket: "bucket",
					Key: name,
					ContentLength: expectedSize,
				});
				expect(putObjects[0]?.input.Body).toBeDefined();
			}
		} finally { await rm(directory, { recursive: true, force: true }); }
	});
});
