import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HandleRegistry } from "../../src/main/stream/handles";
import { ConnectionStore } from "../../src/main/connections/store";
import {
	SecretVault,
	type SecretCipher,
} from "../../src/main/connections/secrets";
import { S3ClientFactory } from "../../src/main/s3/client";
import {
	register,
	type IpcMainLike,
	type SenderLike,
} from "../../src/main/ipc/register";
import { assertNoSecrets } from "./secret-scan";

type Listener = Parameters<IpcMainLike["handle"]>[1];
type IpcResult =
	| {
			ok: true;
			data: { url: string; contentType: string; size: number };
	  }
	| { ok: false; error: { code: string; message: string } };

const openChannel = "stream:open";
const openUrlChannel = "stream:openUrl";
const proxyToken = "a".repeat(64);

const cipher: SecretCipher = {
	isEncryptionAvailable: () => true,
	getSelectedStorageBackend: () => "secure",
	encryptString: (value) => Buffer.from(value),
	decryptString: (value) => value.toString(),
};

function createSender(): SenderLike {
	return {
		send: () => undefined,
		isDestroyed: () => false,
		once: () => undefined,
		removeListener: () => undefined,
	};
}

describe("stream IPC", () => {
	let directory: string;
	let vault: SecretVault;
	let store: ConnectionStore;
	let clients: S3ClientFactory;
	let registry: HandleRegistry;
	let handlers: Map<string, Listener>;
	let describedHandles: string[];
	let connectionId: string;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "stream-ipc-test-"));
		vault = new SecretVault(directory, cipher);
		store = new ConnectionStore(directory, vault);
		clients = new S3ClientFactory(store, vault);
		registry = new HandleRegistry();
		describedHandles = [];
		const connection = await store.create({
			kind: "manual",
			name: "stream-test",
			region: "us-east-1",
			endpoint: "http://store.example.test",
			forcePathStyle: true,
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-key-value",
		});
		connectionId = connection.id;

		const proxy = {
			urlFor: (handle: string) =>
				`http://127.0.0.1:44444/o/${handle}?t=${proxyToken}`,
			describe: async (handle: string) => {
				describedHandles.push(handle);
				return { contentType: "video/mp4", size: 1234 };
			},
		};
		const stream = { registry, proxy };
		const deps = { store, clients, stream };
		handlers = registerHandlers(deps);
	});

	afterEach(async () => {
		clients.invalidate(connectionId);
		await rm(directory, { recursive: true, force: true });
	});

	function registerHandlers(deps: object): Map<string, Listener> {
		const registered = new Map<string, Listener>();
		const ipcMain: IpcMainLike = {
			handle: (channel, listener) => registered.set(channel, listener),
		};
		register(
			ipcMain,
			deps as unknown as Parameters<typeof register>[1],
		);
		return registered;
	}

	async function invoke(channel: string, input: unknown): Promise<IpcResult> {
		const listener = handlers.get(channel);
		expect(listener, `${channel} should be registered`).toBeTypeOf("function");
		if (!listener) throw new Error(`No handler for ${channel}`);
		const result = await listener({ sender: createSender() }, input);
		assertNoSecrets(result);
		return result as IpcResult;
	}

	function handleFrom(result: IpcResult): string {
		if (!result.ok) throw new Error(result.error.message);
		const match = /\/o\/([0-9a-f]{32})\?t=/.exec(result.data.url);
		if (!match?.[1]) throw new Error("Proxy handle is missing");
		return match[1];
	}

	async function createConnection(name: string) {
		return store.create({
			kind: "manual",
			name,
			region: "us-east-1",
			endpoint: "http://store.example.test",
			forcePathStyle: true,
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-key-value",
		});
	}

	it("opens an S3 object through the stream channel", async () => {
		const result = await invoke(openChannel, {
			connectionId,
			bucket: "media-bucket",
			key: "assets/movie.mp4",
		});

		expect(result).toEqual({
			ok: true,
			data: {
				url: expect.stringMatching(
					/^http:\/\/127\.0\.0\.1:44444\/o\/[0-9a-f]{32}\?t=[0-9a-f]{64}$/,
				),
				contentType: "video/mp4",
				size: 1234,
			},
		});
		const handle = handleFrom(result);
		expect(registry.get(handle)).toEqual({
			kind: "s3",
			connectionId,
			bucket: "media-bucket",
			key: "assets/movie.mp4",
		});
		expect(describedHandles).toEqual([handle]);
	});

	it("returns NOT_FOUND for an unknown connection on open", async () => {
		const result = await invoke(openChannel, {
			connectionId: "missing-connection",
			bucket: "media-bucket",
			key: "assets/movie.mp4",
		});
		expect(result).toEqual({
			ok: false,
			error: { code: "NOT_FOUND", message: "Request failed" },
		});
	});

	it("returns a fixed Invalid URL error without echoing the input", async () => {
		const url = "https://user:pass@example.test/private-input-marker";
		const result = await invoke(openUrlChannel, { url });
		expect(result).toEqual({
			ok: false,
			error: { code: "INVALID_REQUEST", message: "Invalid URL" },
		});
		expect(JSON.stringify(result)).not.toContain("private-input-marker");
	});

	it("returns a fixed Unsupported URL error", async () => {
		const result = await invoke(openUrlChannel, {
			url: "ftp://unsupported.example.test/media.mp4",
		});
		expect(result).toEqual({
			ok: false,
			error: { code: "INVALID_REQUEST", message: "Unsupported URL" },
		});
	});

	it("drops empty and undefined endpoint hosts before URL resolution", async () => {
		const emptyHostConnection = await createConnection("empty-host-test");
		await store.update(emptyHostConnection.id, { endpoint: "file:///" });
		await store.create({
			kind: "manual",
			name: "undefined-host-test",
			region: "us-east-1",
			forcePathStyle: true,
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-key-value",
		});
		const result = await invoke(openUrlChannel, {
			url: "https://bucket./assets/movie.mp4",
			connectionId: emptyHostConnection.id,
		});
		expect(result).toEqual({
			ok: false,
			error: { code: "INVALID_REQUEST", message: "Unsupported URL" },
		});
	});

	it("keeps a presigned URL out of its response and stores it as pass-through", async () => {
		const url =
			"https://signed.example.test/assets/movie.mp4?X-Amz-Signature=fixture-signature&X-Amz-Credential=AKIAFIXTUREFIXTURE00%2Fscope";
		const result = await invoke(openUrlChannel, { url });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(JSON.stringify(result)).not.toContain(url);
		expect(JSON.stringify(result)).not.toContain("X-Amz-Signature");
		expect(JSON.stringify(result)).not.toContain("fixture-signature");
		expect(JSON.stringify(result)).not.toContain("AKIAFIXTUREFIXTURE00");
		const handle = handleFrom(result);
		expect(registry.get(handle)).toEqual({ kind: "passthrough", url });
	});

	it("opens an anonymous unsigned URL as pass-through", async () => {
		const url = "http://store.example.test/public-media/assets/movie.mp4";
		const result = await invoke(openUrlChannel, { url, anonymous: true });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(registry.get(handleFrom(result))).toEqual({
			kind: "passthrough",
			url,
		});
	});

	it("uses an explicit connection for a signed unsigned-object URL", async () => {
		const url = "http://store.example.test/media-bucket/assets/movie.mp4";
		const result = await invoke(openUrlChannel, { url, connectionId });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(registry.get(handleFrom(result))).toEqual({
			kind: "s3",
			connectionId,
			bucket: "media-bucket",
			key: "assets/movie.mp4",
		});
	});

	it("defaults to the first connection pinned for the bucket", async () => {
		const later = await createConnection("later-pinned-test");
		await store.update(connectionId, { pinnedBuckets: ["media-bucket"] });
		await store.update(later.id, { extraBuckets: ["media-bucket"] });

		const result = await invoke(openUrlChannel, {
			url: "http://store.example.test/media-bucket/assets/movie.mp4",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(registry.get(handleFrom(result))).toMatchObject({
			kind: "s3",
			connectionId,
		});
	});

	it("defaults to a connection with the bucket in extraBuckets", async () => {
		const later = await createConnection("extra-bucket-test");
		await store.update(later.id, { extraBuckets: ["extra-media"] });

		const result = await invoke(openUrlChannel, {
			url: "http://store.example.test/extra-media/assets/movie.mp4",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(registry.get(handleFrom(result))).toMatchObject({
			kind: "s3",
			connectionId: later.id,
		});
	});

	it("requires a connection or anonymous access for unsigned objects", async () => {
		const result = await invoke(openUrlChannel, {
			url: "http://store.example.test/unassigned/assets/movie.mp4",
		});
		expect(result).toEqual({
			ok: false,
			error: {
				code: "INVALID_REQUEST",
				message: "Choose a connection or anonymous access",
			},
		});
	});

	it("returns NOT_FOUND for an unknown connection in openUrl", async () => {
		const result = await invoke(openUrlChannel, {
			url: "http://store.example.test/media-bucket/assets/movie.mp4",
			connectionId: "missing-connection",
		});
		expect(result).toEqual({
			ok: false,
			error: { code: "NOT_FOUND", message: "Request failed" },
		});
	});

	it("rejects extra request keys and connectionId with anonymous access", async () => {
		const extraOpen = await invoke(openChannel, {
			connectionId,
			bucket: "media-bucket",
			key: "assets/movie.mp4",
			extra: true,
		});
		const extraUrl = await invoke(openUrlChannel, {
			url: "http://store.example.test/media-bucket/assets/movie.mp4",
			extra: true,
		});
		const conflicting = await invoke(openUrlChannel, {
			url: "http://store.example.test/media-bucket/assets/movie.mp4",
			connectionId,
			anonymous: true,
		});
		for (const result of [extraOpen, extraUrl, conflicting]) {
			expect(result).toEqual({
				ok: false,
				error: { code: "INVALID_REQUEST", message: "Invalid request" },
			});
		}
	});

	it("reports a missing stream dependency with a fixed error", async () => {
		const missingStreamHandlers = registerHandlers({ store, clients });
		const previous = handlers;
		handlers = missingStreamHandlers;
		try {
			const result = await invoke(openChannel, {
				connectionId,
				bucket: "media-bucket",
				key: "assets/movie.mp4",
			});
			expect(result).toEqual({
				ok: false,
				error: {
					code: "REQUEST_FAILED",
					message: "Stream proxy unavailable",
				},
			});
		} finally {
			handlers = previous;
		}
	});
});
