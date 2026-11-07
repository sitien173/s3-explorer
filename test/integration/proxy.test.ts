import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStreamProxy, type StreamProxy } from "../../src/main/stream/proxy";
import { HandleRegistry, MAX_HANDLES } from "../../src/main/stream/handles";
import { channels } from "../../src/shared/channels";
import { assertNoSecrets } from "../unit/secret-scan";
import {
	createIntegrationSender,
	createTestBucket,
	emptyAndDeleteBucket,
	setupHarness,
	waitFor,
	type IntegrationHarness,
} from "./helpers";
import { register, type SenderLike } from "../../src/main/ipc/register";
import type { S3ClientFactory } from "../../src/main/s3/client";

type IpcHandler = (event: { sender: SenderLike }, input: unknown) => unknown;
type IpcSuccess<T> = { ok: true; data: T };
type IpcFailure = { ok: false; error: { code: string; message: string } };
type StreamDescription = { url: string; contentType: string; size: number };
type SendOptions = { abortSignal?: AbortSignal };
type SendHook = (command: unknown, options: SendOptions | undefined, next: () => Promise<unknown>) => Promise<unknown>;
type CountingState = { upstreamBytes: number; abortSignal?: AbortSignal };

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(moduleDir, "../.tmp/media");
const fixtureScript = resolve(moduleDir, "../fixtures/make-media.sh");
const fixtureKeys = ["media/faststart.mp4", "media/tailmoov.mp4"] as const;
const bucket = `integ-proxy-${Date.now()}-${randomBytes(4).toString("hex")}`;
const largeKey = "media/random-large.bin";
const largeBytes = 200 * 1024 * 1024;
const seekOffset = 100_000_000;
const clientReadSize = 4 * 1024 * 1024;
const upstreamByteLimit = 15_728_640;

let harness!: IntegrationHarness;
let bucketCreated = false;
let registry!: HandleRegistry;
let proxy!: StreamProxy;
let _proxyOrigin = "";
let wrapClient = (client: S3Client): S3Client => client;
const handlers = new Map<string, IpcHandler>();
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

function commandInput(command: unknown): Record<string, unknown> {
	return (command as { input: Record<string, unknown> }).input;
}

async function invoke(channel: string, input: unknown): Promise<unknown> {
	const handler = handlers.get(channel);
	if (!handler) throw new Error(`Missing IPC handler for ${channel}`);
	const response = await handler({ sender: createIntegrationSender() }, input);
	assertNoSecrets(response);
	return response;
}

function success<T>(response: unknown): T {
	const result = response as IpcSuccess<T> | IpcFailure;
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error(result.error.message);
	return result.data;
}

function failure(response: unknown): IpcFailure["error"] {
	const result = response as IpcFailure | IpcSuccess<unknown>;
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("Expected an IPC failure");
	return result.error;
}

async function openS3(key: string): Promise<StreamDescription> {
	return success<StreamDescription>(
		await invoke(channels.streamOpen, {
			connectionId: harness.connection.id,
			bucket,
			key,
		}),
	);
}

async function uploadRandomLargeObject(): Promise<void> {
	async function* randomChunks(): AsyncGenerator<Buffer> {
		const chunkSize = 1024 * 1024;
		for (let remaining = largeBytes; remaining > 0; remaining -= chunkSize) {
			yield randomBytes(Math.min(chunkSize, remaining));
		}
	}
	const upload = new Upload({
		client: harness.s3Client,
		params: {
			Bucket: bucket,
			Key: largeKey,
			Body: Readable.from(randomChunks()),
			ContentType: "application/octet-stream",
		},
		partSize: 8 * 1024 * 1024,
		queueSize: 2,
		leavePartsOnError: false,
	});
	await upload.done();
}

async function requestAndDestroyAfterBytes(url: string): Promise<{ status: number; bytesRead: number }> {
	return new Promise((resolvePromise, rejectPromise) => {
		let status = 0;
		let bytesRead = 0;
		let settled = false;
		const request = httpRequest(new URL(url), {
			headers: { Range: `bytes=${seekOffset}-` },
		});
		const reject = (error: Error) => {
			if (settled) return;
			settled = true;
			rejectPromise(error);
		};
		request.on("response", (response) => {
			status = response.statusCode ?? 0;
			response.on("data", (chunk: Buffer) => {
				bytesRead += chunk.length;
				if (bytesRead >= clientReadSize && !settled) {
					settled = true;
					response.destroy();
					request.destroy();
					resolvePromise({ status, bytesRead });
				}
			});
			response.on("end", () => reject(new Error(`Response ended after only ${bytesRead} bytes`)));
			response.on("error", (error: Error) => reject(error));
		});
		request.on("error", (error: Error) => reject(error));
		request.end();
	});
}

beforeAll(async () => {
	try {
		execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
	} catch {
		throw new Error("ffmpeg is required to generate integration media fixtures");
	}
	execFileSync(fixtureScript, [fixtureDir], { stdio: "inherit" });
	if (!existsSync(fixtureDir)) {
		throw new Error(`Media fixture directory was not created: ${fixtureDir}`);
	}

	harness = await setupHarness({ clients });
	await createTestBucket(harness.s3Client, bucket);
	bucketCreated = true;
	registry = new HandleRegistry();
	proxy = createStreamProxy({
		registry,
		store: harness.store,
		clients,
		appOrigin: "null",
	});
	_proxyOrigin = (await proxy.start()).origin;
	register(
		{
			handle: (channel, listener) => handlers.set(channel, listener),
		},
		{
			store: harness.store,
			clients,
			stream: { registry, proxy },
		},
	);

	for (const key of fixtureKeys) {
		const body = await readFile(resolve(fixtureDir, key.split("/").at(-1)!));
		await harness.s3Client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: body,
				ContentType: "video/mp4",
			}),
		);
	}
}, 300_000);

afterAll(async () => {
	wrapClient = (client) => client;
	try {
		if (bucketCreated) {
			await emptyAndDeleteBucket(harness.s3Client, bucket);
		}
	} finally {
		try {
			if (proxy) await proxy.stop();
		} finally {
			if (harness) await harness.cleanup();
		}
	}
}, 180_000);

describe("RustFS media stream proxy integration", () => {
	it("serves fixture videos with exact ranges, hashes, HEAD, and 416", async () => {
		for (const key of fixtureKeys) {
			const filename = key.split("/").at(-1)!;
			const fixture = await readFile(resolve(fixtureDir, filename));
			const description = await openS3(key);
			expect(description.size).toBe(fixture.length);
			expect(description.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/o\/[0-9a-f]{32}\?t=[0-9a-f]{64}$/);

			const prefixResponse = await fetch(description.url, {
				headers: { Range: "bytes=0-1023" },
			});
			expect(prefixResponse.status).toBe(206);
			expect(prefixResponse.headers.get("content-range")).toBe(`bytes 0-1023/${fixture.length}`);
			expect(Buffer.from(await prefixResponse.arrayBuffer())).toEqual(fixture.subarray(0, 1024));

			const suffixResponse = await fetch(description.url, {
				headers: { Range: "bytes=-1024" },
			});
			expect(suffixResponse.status).toBe(206);
			expect(suffixResponse.headers.get("content-range")).toBe(
				`bytes ${fixture.length - 1024}-${fixture.length - 1}/${fixture.length}`,
			);
			expect(Buffer.from(await suffixResponse.arrayBuffer())).toEqual(fixture.subarray(fixture.length - 1024));

			const openEndedResponse = await fetch(description.url, {
				headers: { Range: "bytes=1024-" },
			});
			expect(openEndedResponse.status).toBe(206);
			expect(openEndedResponse.headers.get("content-range")).toBe(`bytes 1024-${fixture.length - 1}/${fixture.length}`);
			expect(Buffer.from(await openEndedResponse.arrayBuffer())).toEqual(fixture.subarray(1024));

			const fullResponse = await fetch(description.url);
			expect(fullResponse.status).toBe(200);
			const fullBytes = Buffer.from(await fullResponse.arrayBuffer());
			expect(createHash("sha256").update(fullBytes).digest("hex")).toBe(
				createHash("sha256").update(fixture).digest("hex"),
			);

			const headResponse = await fetch(description.url, { method: "HEAD" });
			expect(headResponse.status).toBe(200);
			expect(headResponse.headers.get("content-length")).toBe(String(fixture.length));
			expect(headResponse.headers.get("accept-ranges")).toBe("bytes");

			const rangeEnd = await fetch(description.url, {
				headers: { Range: `bytes=${fixture.length}-` },
			});
			expect(rangeEnd.status).toBe(416);
			expect(rangeEnd.headers.get("content-range")).toBe(`bytes */${fixture.length}`);
		}
	});

	it("returns the same fixed 403 for bad tokens, unknown handles, and methods", async () => {
		const opened = await openS3(fixtureKeys[0]);
		const authorized = new URL(opened.url);
		const validToken = authorized.searchParams.get("t");
		expect(validToken).toMatch(/^[0-9a-f]{64}$/);
		const missingToken = new URL(opened.url);
		missingToken.searchParams.delete("t");
		const wrongToken = new URL(opened.url);
		wrongToken.searchParams.set("t", validToken === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64));
		const unknownHandle = new URL(opened.url);
		unknownHandle.pathname = `/o/${"f".repeat(32)}`;
		const attempts: { url: string; method?: string }[] = [
			{ url: missingToken.toString() },
			{ url: wrongToken.toString() },
			{ url: unknownHandle.toString() },
			{ url: opened.url, method: "POST" },
		];
		const responses = await Promise.all(attempts.map(({ url, method }) => fetch(url, method ? { method } : undefined)));
		const bodies = await Promise.all(responses.map((response) => response.text()));
		for (const response of responses) {
			expect(response.status).toBe(403);
			expect(response.headers.get("access-control-allow-origin")).toBe("null");
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		}
		expect(bodies).toEqual(["Forbidden", "Forbidden", "Forbidden", "Forbidden"]);
	});

	it("returns 403 when a handle is evicted by LRU after filling past capacity", async () => {
		const opened = await openS3(fixtureKeys[0]);
		const validResponse = await fetch(opened.url, {
			headers: { Range: "bytes=0-15" },
		});
		expect(validResponse.status).toBe(206);

		for (let index = 0; index < MAX_HANDLES; index += 1) {
			registry.create({
				kind: "s3",
				connectionId: harness.connection.id,
				bucket,
				key: `lru-eviction-key-${index}`,
			});
		}

		const evictedResponse = await fetch(opened.url);
		expect(evictedResponse.status).toBe(403);
		expect(evictedResponse.headers.get("access-control-allow-origin")).toBe("null");
		expect(evictedResponse.headers.get("x-content-type-options")).toBe("nosniff");
		expect(await evictedResponse.text()).toBe("Forbidden");
	});

	it("aborts the upstream stream after a client destroys a mid-file response", async () => {
		await uploadRandomLargeObject();
		const state: CountingState = { upstreamBytes: 0 };
		wrapClient = (client) =>
			wrapSend(client, async (command, options, next) => {
				if (command instanceof GetObjectCommand && commandInput(command).Key === largeKey) {
					state.abortSignal = options?.abortSignal;
					const result = (await next()) as { Body?: unknown };
					if (result.Body instanceof Readable) {
						result.Body.on("data", (chunk: Buffer) => {
							state.upstreamBytes += chunk.length;
						});
					}
					return result;
				}
				return next();
			});
		try {
			const opened = await openS3(largeKey);
			const client = await requestAndDestroyAfterBytes(opened.url);
			expect(client.status).toBe(206);
			expect(client.bytesRead).toBeGreaterThanOrEqual(clientReadSize);
			await waitFor(() => state.abortSignal?.aborted === true, 15_000);
			expect(state.upstreamBytes).toBeLessThan(upstreamByteLimit);
		} finally {
			wrapClient = (client) => client;
		}
	}, 180_000);

	it("serves presigned pass-through and resolves configured RustFS URLs", async () => {
		const key = "media/presigned-sample.bin";
		const body = randomBytes(8192);
		await harness.s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
		const signedUrl = await getSignedUrl(harness.s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
			expiresIn: 300,
		});
		const openedPresigned = success<StreamDescription>(await invoke(channels.streamOpenUrl, { url: signedUrl }));
		const presignedRange = await fetch(openedPresigned.url, {
			headers: { Range: "bytes=128-255" },
		});
		expect(presignedRange.status).toBe(206);
		expect(Buffer.from(await presignedRange.arrayBuffer())).toEqual(body.subarray(128, 256));
		const presignedHead = await fetch(openedPresigned.url, { method: "HEAD" });
		expect(presignedHead.status).toBe(200);
		expect(presignedHead.headers.get("content-length")).toBe(String(body.length));

		const objectUrl = `http://127.0.0.1:19000/${bucket}/${key}`;
		const withConnection = success<StreamDescription>(
			await invoke(channels.streamOpenUrl, {
				url: objectUrl,
				connectionId: harness.connection.id,
			}),
		);
		expect(withConnection.size).toBe(body.length);
		const anonymous = await invoke(channels.streamOpenUrl, {
			url: objectUrl,
			anonymous: true,
		});
		expect(failure(anonymous)).toEqual({
			code: "ACCESS_DENIED",
			message: "Access denied",
		});

		await harness.store.update(harness.connection.id, {
			pinnedBuckets: [bucket],
		});
		const pinnedDefault = success<StreamDescription>(await invoke(channels.streamOpenUrl, { url: objectUrl }));
		expect(pinnedDefault.size).toBe(body.length);
	});
});
