import { createConnection } from "node:net";
import {
	createServer,
	request as httpRequest,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HandleTarget } from "../../src/main/stream/handles";
import { HandleRegistry } from "../../src/main/stream/handles";
import { createStreamProxy, type StreamProxy } from "../../src/main/stream/proxy";

const commonHeaders = {
	"access-control-allow-origin": "null",
	vary: "Origin",
	"access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
	"x-content-type-options": "nosniff",
	"cache-control": "no-store",
};

const proxies: StreamProxy[] = [];
const upstreamServers: Server[] = [];

afterEach(async () => {
	for (const proxy of proxies.splice(0)) {
		await proxy.stop();
	}
	for (const server of upstreamServers.splice(0)) {
		server.closeAllConnections();
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	}
});

type S3Call = {
	name: string;
	input: Record<string, unknown>;
	signal?: AbortSignal;
};
type S3Script = (call: S3Call) => unknown | Promise<unknown>;
type HarnessOptions = {
	target?: HandleTarget;
	connectionExists?: boolean;
	script?: S3Script;
};
type Harness = {
	proxy: StreamProxy;
	registry: HandleRegistry;
	origin: string;
	handle: string;
	url: string;
	calls: S3Call[];
};

const defaultScript: S3Script = (call) => {
	if (call.name === "HeadObjectCommand") {
		return { ContentType: "video/mp4", ContentLength: 4 };
	}
	return {
		Body: Readable.from([Buffer.from("data")]),
		ContentType: "video/mp4",
		ContentLength: 4,
	};
};

async function makeHarness(options: HarnessOptions = {}): Promise<Harness> {
	const registry = new HandleRegistry();
	const calls: S3Call[] = [];
	const connection = {
		id: "connection-1",
		name: "Test connection",
		kind: "manual" as const,
		region: "us-east-1",
		forcePathStyle: true,
		pinnedBuckets: [],
		extraBuckets: [],
		sessionOnly: true,
		hasSecret: true,
	};
	const store = {
		get: vi.fn(async (id: string) =>
			options.connectionExists === false || id !== connection.id ? undefined : connection,
		),
	};
	const send = vi.fn(
		async (
			command: {
				constructor: { name: string };
				input: Record<string, unknown>;
			},
			config?: { abortSignal?: AbortSignal },
		) => {
			const call: S3Call = {
				name: command.constructor.name,
				input: command.input,
				signal: config?.abortSignal,
			};
			calls.push(call);
			return (await (options.script ?? defaultScript)(call)) as never;
		},
	);
	const clients = {
		get: vi.fn(async () => ({ send }) as never),
	};
	const proxy = createStreamProxy({
		registry,
		store: store as never,
		clients: clients as never,
		appOrigin: "null",
	});
	proxies.push(proxy);
	const { origin } = await proxy.start();
	const target =
		options.target ??
		({
			kind: "s3",
			connectionId: connection.id,
			bucket: "media",
			key: "movie.mp4",
		} satisfies HandleTarget);
	const handle = registry.create(target);
	return { proxy, registry, origin, handle, url: proxy.urlFor(handle), calls };
}

async function startUpstream(
	handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ origin: string; server: Server }> {
	const server = createServer((request, response) => {
		void handler(request, response);
	});
	upstreamServers.push(server);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Upstream did not bind an IP address");
	}
	return { origin: `http://127.0.0.1:${address.port}`, server };
}

async function startGzippedUpstream(): Promise<{
	origin: string;
	receivedAcceptEncoding: string[];
	uncompressed: string;
}> {
	const receivedAcceptEncoding: string[] = [];
	const uncompressed = "uncompressed text payload that is always gzipped";
	const compressed = gzipSync(Buffer.from(uncompressed));
	const upstream = await startUpstream((request, response) => {
		receivedAcceptEncoding.push(request.headers["accept-encoding"] ?? "");
		const range = request.headers.range;
		response.statusCode = range ? 206 : 200;
		response.setHeader("Content-Type", "text/plain");
		response.setHeader("Content-Encoding", "gzip");
		response.setHeader("Content-Length", String(compressed.length));
		if (range) {
			const end = /^bytes=0-(\d+)$/.exec(range)?.[1] ?? "0";
			response.setHeader("Content-Range", `bytes 0-${end}/${compressed.length}`);
		}
		response.end(compressed);
	});
	return { origin: upstream.origin, receivedAcceptEncoding, uncompressed };
}

function assertIdentityEncoding(values: string[]): void {
	expect(values).toHaveLength(1);
	expect(values[0]).toMatch(/^identity(, identity)?$/);
}

function assertCommonHeaders(response: Response): void {
	for (const [name, value] of Object.entries(commonHeaders)) {
		expect(response.headers.get(name)).toBe(value);
	}
}

function rawRequest(
	url: string,
	options: { method?: string; headers?: Record<string, string> } = {},
): { request: ReturnType<typeof httpRequest>; response: Promise<IncomingMessage> } {
	const parsed = new URL(url);
	let resolveResponse!: (response: IncomingMessage) => void;
	let rejectResponse!: (error: Error) => void;
	const response = new Promise<IncomingMessage>((resolve, reject) => {
		resolveResponse = resolve;
		rejectResponse = reject;
	});
	const request = httpRequest(
		{
			hostname: parsed.hostname,
			port: Number(parsed.port),
			path: `${parsed.pathname}${parsed.search}`,
			method: options.method ?? "GET",
			headers: options.headers,
		},
		resolveResponse,
	);
	request.once("error", rejectResponse);
	request.end();
	return { request, response };
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error("Timed out waiting for proxy stream state");
		}
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
}

function getTokenAndHandle(url: string): { handle: string; token: string } {
	const parsed = new URL(url);
	const handle = parsed.pathname.split("/").at(-1) ?? "";
	const token = parsed.searchParams.get("t") ?? "";
	return { handle, token };
}

describe("stream proxy routing and S3 responses", () => {
	it("uses one indistinguishable 403 response for all route and method failures", async () => {
		const harness = await makeHarness();
		const { handle, token } = getTokenAndHandle(harness.url);
		const unknownHandle = handle === "f".repeat(32) ? "e".repeat(32) : "f".repeat(32);
		const cases = [
			{
				name: "missing token",
				url: `${harness.origin}/o/${handle}`,
				method: "GET",
			},
			{
				name: "wrong token of equal length",
				url: `${harness.origin}/o/${handle}?t=${"a".repeat(64)}`,
				method: "GET",
			},
			{
				name: "wrong token of different length",
				url: `${harness.origin}/o/${handle}?t=wrong`,
				method: "GET",
			},
			{
				name: "unknown handle",
				url: `${harness.origin}/o/${unknownHandle}?t=${token}`,
				method: "GET",
			},
			{
				name: "malformed handle",
				url: `${harness.origin}/o/not-a-handle?t=${token}`,
				method: "GET",
			},
			{
				name: "wrong path",
				url: `${harness.origin}/wrong/${handle}?t=${token}`,
				method: "GET",
			},
			...(["POST", "PUT", "DELETE", "OPTIONS"] as const).map((method) => ({
				name: method,
				url: harness.url,
				method,
			})),
		];
		const bodies: string[] = [];
		for (const item of cases) {
			const response = await fetch(item.url, { method: item.method ?? "GET" });
			expect(response.status, item.name).toBe(403);
			assertCommonHeaders(response);
			const body = await response.text();
			expect(body, item.name).toBe("Forbidden");
			bodies.push(body);
		}
		expect(new Set(bodies).size).toBe(1);
		expect(harness.calls).toEqual([]);
	});

	it("streams a full S3 GET with the exact success headers", async () => {
		const harness = await makeHarness();
		const response = await fetch(harness.url);
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-length")).toBe("4");
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(response.headers.get("content-range")).toBeNull();
		expect(await response.text()).toBe("data");
		expect(harness.calls[0]).toMatchObject({
			name: "GetObjectCommand",
			input: { Bucket: "media", Key: "movie.mp4" },
		});
		expect(harness.calls[0]?.signal).toBeInstanceOf(AbortSignal);
	});

	it("streams a ranged S3 GET as 206 and normalizes the SDK range", async () => {
		const harness = await makeHarness({
			script: (call) =>
				call.name === "HeadObjectCommand"
					? { ContentLength: 10 }
					: {
							Body: Readable.from([Buffer.from("bcd")]),
							ContentType: "video/mp4",
							ContentLength: 3,
							ContentRange: "bytes 1-3/10",
						},
		});
		const response = await fetch(harness.url, {
			headers: { Range: "Bytes=001-003" },
		});
		expect(response.status).toBe(206);
		assertCommonHeaders(response);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-length")).toBe("3");
		expect(response.headers.get("content-range")).toBe("bytes 1-3/10");
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(await response.text()).toBe("bcd");
		expect(harness.calls[0]?.input.Range).toBe("bytes=1-3");
	});

	it("answers S3 HEAD without a body and ignores the client's Range", async () => {
		const harness = await makeHarness();
		const response = await fetch(harness.url, {
			method: "HEAD",
			headers: { Range: "bytes=1-2" },
		});
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-length")).toBe("4");
		expect(response.headers.get("accept-ranges")).toBe("bytes");
		expect(await response.text()).toBe("");
		expect(harness.calls).toHaveLength(1);
		expect(harness.calls[0]).toMatchObject({
			name: "HeadObjectCommand",
			input: { Bucket: "media", Key: "movie.mp4" },
		});
		expect(harness.calls[0]?.signal).toBeInstanceOf(AbortSignal);
	});

	it("delivers full body on S3 GET when ContentLength is missing", async () => {
		const harness = await makeHarness({
			script: (call) =>
				call.name === "HeadObjectCommand"
					? { ContentType: "video/mp4" }
					: {
							Body: Readable.from([Buffer.from("chunked body content")]),
							ContentType: "video/mp4",
						},
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(response.headers.get("content-length")).toBeNull();
		expect(await response.text()).toBe("chunked body content");
	});

	it("omits Content-Length on S3 HEAD when ContentLength is missing", async () => {
		const harness = await makeHarness({
			script: () => ({ ContentType: "video/mp4" }),
		});
		const response = await fetch(harness.url, { method: "HEAD" });
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(response.headers.get("content-length")).toBeNull();
	});

	it.each([
		["adds a size when the follow-up HEAD succeeds", true],
		["omits a size when the follow-up HEAD fails", false],
	])("returns S3 416 and %s", async (_name, headSucceeds) => {
		const harness = await makeHarness({
			script: (call) => {
				if (call.name === "GetObjectCommand") {
					throw Object.assign(new Error("private range error"), {
						$metadata: { httpStatusCode: 416 },
					});
				}
				if (headSucceeds) return { ContentLength: 12 };
				throw new Error("private head error");
			},
		});
		const response = await fetch(harness.url, {
			headers: { Range: "bytes=12-" },
		});
		expect(response.status).toBe(416);
		assertCommonHeaders(response);
		expect(response.headers.get("content-range")).toBe(headSucceeds ? "bytes */12" : null);
		expect(await response.text()).toBe("Range not satisfiable");
		expect(harness.calls.map((call) => call.name)).toEqual(["GetObjectCommand", "HeadObjectCommand"]);
	});

	it.each([
		{ name: "metadata 403", metadata: 403, status: 403, body: "Forbidden" },
		{ name: "metadata 404", metadata: 404, status: 404, body: "Not found" },
		{ name: "metadata 500", metadata: 500, status: 500, body: "Upstream error" },
		{ name: "metadata 599", metadata: 599, status: 599, body: "Upstream error" },
		{ name: "mapped AccessDenied", errorName: "AccessDenied", status: 403, body: "Forbidden" },
		{ name: "mapped NoSuchKey", errorName: "NoSuchKey", status: 404, body: "Not found" },
		{
			name: "unmapped error",
			message: "AKIAFIXTUREFIXTURE00 https://private.example/object",
			status: 502,
			body: "Upstream error",
		},
		{ name: "unselected metadata status", metadata: 401, status: 502, body: "Upstream error" },
	])("maps S3 $name to a fixed response", async (testCase) => {
		const error = Object.assign(new Error(testCase.message ?? "upstream detail"), {
			...(testCase.errorName ? { name: testCase.errorName } : {}),
			...(testCase.metadata ? { $metadata: { httpStatusCode: testCase.metadata } } : {}),
		});
		const harness = await makeHarness({
			script: () => {
				throw error;
			},
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(testCase.status);
		assertCommonHeaders(response);
		const body = await response.text();
		expect(body).toBe(testCase.body);
		expect(body).not.toContain("AKIAFIXTUREFIXTURE00");
		expect(body).not.toContain("https://private.example/object");
	});

	it("returns 404 when an S3 target's connection is missing", async () => {
		const harness = await makeHarness({ connectionExists: false });
		const response = await fetch(harness.url);
		expect(response.status).toBe(404);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("Not found");
		expect(harness.calls).toEqual([]);
	});

	it("returns 502 when an S3 success has a non-Readable body", async () => {
		const harness = await makeHarness({
			script: () => ({ ContentType: "video/mp4", ContentLength: 4, Body: "data" }),
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(502);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("Upstream error");
	});
});

describe("stream proxy cancellation and streaming", () => {
	it("aborts the SDK signal and destroys its body on a real client destroy", async () => {
		let body: Readable | undefined;
		let sent = false;
		const harness = await makeHarness({
			script: () => {
				body = new Readable({
					read() {
						if (sent) return;
						sent = true;
						this.push(Buffer.from("first chunk"));
					},
				});
				return { Body: body, ContentLength: 100, ContentType: "video/mp4" };
			},
		});
		const { request, response: pendingResponse } = rawRequest(harness.url);
		const response = await pendingResponse;
		expect(response.statusCode).toBe(200);
		await new Promise<void>((resolve, reject) => {
			response.once("data", () => {
				request.destroy();
				resolve();
			});
			response.once("error", reject);
		});
		await waitFor(() => Boolean(harness.calls[0]?.signal?.aborted && body?.destroyed));
		expect(harness.calls[0]?.signal?.aborted).toBe(true);
		expect(body?.destroyed).toBe(true);
	}, 10_000);

	it("destroys the client socket when an upstream body errors mid-stream", async () => {
		let sent = false;
		const harness = await makeHarness({
			script: () => ({
				Body: new Readable({
					read() {
						if (sent) return;
						sent = true;
						this.push(Buffer.from("prefix"));
						setImmediate(() => this.destroy(new Error("private stream failure")));
					},
				}),
				ContentLength: 100,
				ContentType: "video/mp4",
			}),
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(200);
		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		await reader?.read();
		await expect(reader?.read()).rejects.toThrow();
	});

	it("respects backpressure for a lazy 100 MiB body", async () => {
		const total = 100 * 1024 * 1024;
		let bytesPulled = 0;
		let body: Readable | undefined;
		const harness = await makeHarness({
			script: () => {
				body = new Readable({
					read() {
						if (bytesPulled >= total) {
							this.push(null);
							return;
						}
						const length = Math.min(64 * 1024, total - bytesPulled);
						bytesPulled += length;
						this.push(Buffer.alloc(length));
					},
				});
				return {
					Body: body,
					ContentLength: total,
					ContentType: "application/octet-stream",
				};
			},
		});
		const { request, response: pendingResponse } = rawRequest(harness.url);
		const response = await pendingResponse;
		expect(response.statusCode).toBe(200);
		let clientBytes = 0;
		await new Promise<void>((resolve, reject) => {
			response.on("data", (chunk: Buffer) => {
				clientBytes += chunk.length;
				if (clientBytes >= 1024 * 1024) {
					request.destroy();
					resolve();
				}
			});
			response.once("error", reject);
		});
		await waitFor(() => body?.destroyed === true);
		expect(clientBytes).toBeGreaterThanOrEqual(1024 * 1024);
		expect(bytesPulled).toBeLessThan(16 * 1024 * 1024);
	});

	it("aborts upstream on client destroy during pass-through", async () => {
		let upstreamClosed = false;
		const upstream = await startUpstream((request, response) => {
			request.on("close", () => {
				upstreamClosed = true;
			});
			request.socket.on("close", () => {
				upstreamClosed = true;
			});
			response.statusCode = 200;
			response.setHeader("Content-Type", "text/plain");
			response.setHeader("Transfer-Encoding", "chunked");
			response.write("initial chunk\n");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/stream` },
		});
		const { request, response: pendingResponse } = rawRequest(harness.url);
		const response = await pendingResponse;
		expect(response.statusCode).toBe(200);
		await new Promise<void>((resolve, reject) => {
			response.once("data", () => {
				request.destroy();
				resolve();
			});
			response.once("error", reject);
		});
		await waitFor(() => upstreamClosed);
		expect(upstreamClosed).toBe(true);
	});
});

describe("stream proxy pass-through", () => {
	it("forwards only Range, If-Range, and Accept to the upstream", async () => {
		let received: IncomingMessage["headers"] | undefined;
		const upstream = await startUpstream((request, response) => {
			received = request.headers;
			response.statusCode = 206;
			response.setHeader("Content-Type", "video/mp4");
			response.setHeader("Content-Length", "2");
			response.setHeader("Content-Range", "bytes 1-2/4");
			response.setHeader("Accept-Ranges", "bytes");
			response.setHeader("Set-Cookie", "upstream=private");
			response.setHeader("Location", "http://private.example/redirect");
			response.setHeader("Content-Disposition", "attachment; filename=secret");
			response.end("bc");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, {
			headers: {
				Range: "bytes=1-2",
				"If-Range": '"entity-tag"',
				Accept: "video/*",
				"Accept-Encoding": "gzip, deflate, br",
				Authorization: "Bearer client-secret",
				Cookie: "session=client-secret",
				"X-Private-Header": "must-not-forward",
			},
		});
		expect(response.status).toBe(206);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("bc");
		expect(received?.range).toBe("bytes=1-2");
		expect(received?.["if-range"]).toBe('"entity-tag"');
		expect(received?.accept).toBe("video/*");
		expect(received?.["accept-encoding"]).toMatch(/^identity(, identity)?$/);
		expect(received?.authorization).toBeUndefined();
		expect(received?.cookie).toBeUndefined();
		expect(received?.["x-private-header"]).toBeUndefined();
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("content-disposition")).toBeNull();
	});

	it("delivers uncompressed bytes from an unconditionally gzipped upstream", async () => {
		const upstream = await startGzippedUpstream();
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-length")).toBeNull();
		expect(await response.text()).toBe(upstream.uncompressed);
		assertIdentityEncoding(upstream.receivedAcceptEncoding);
	});

	it("does not relay encoded Content-Range or Content-Length", async () => {
		const upstream = await startGzippedUpstream();
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, {
			headers: { Range: "bytes=0-3" },
		});
		expect(response.status).toBe(502);
		expect(response.headers.get("content-range")).toBeNull();
		expect(response.headers.get("content-length")).toBe("14");
		expect(await response.text()).toBe("Upstream error");
		assertIdentityEncoding(upstream.receivedAcceptEncoding);
	});

	it("cancels the encoded upstream 206 body before returning 502", async () => {
		let upstreamClosed = false;
		let upstreamEnded = true;
		const compressed = gzipSync(Buffer.from("encoded partial response"));
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 206;
			response.setHeader("Content-Encoding", "gzip");
			response.setHeader("Content-Range", "bytes 0-3/80");
			response.setHeader("Content-Length", String(compressed.length));
			response.on("close", () => {
				upstreamClosed = true;
				upstreamEnded = response.writableEnded;
			});
			response.write(compressed.subarray(0, 8));
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, {
			headers: { Range: "bytes=0-3" },
		});
		expect(response.status).toBe(502);
		expect(await response.text()).toBe("Upstream error");
		await waitFor(() => upstreamClosed);
		expect(upstreamEnded).toBe(false);
	});

	it("returns 502 for encoded pass-through HEAD", async () => {
		const upstream = await startGzippedUpstream();
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, { method: "HEAD" });
		expect(response.status).toBe(502);
		expect(await response.text()).toBe("");
		assertIdentityEncoding(upstream.receivedAcceptEncoding);
	});

	it("rejects describe when pass-through metadata is encoded", async () => {
		const upstream = await startGzippedUpstream();
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "REQUEST_FAILED",
			message: "Request failed",
		});
		assertIdentityEncoding(upstream.receivedAcceptEncoding);
	});

	it("relays size and range headers for identity-encoded responses", async () => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 206;
			response.setHeader("Content-Encoding", " identity ");
			response.setHeader("Content-Length", "2");
			response.setHeader("Content-Range", "bytes 1-2/4");
			response.end("bc");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, {
			headers: { Range: "bytes=1-2" },
		});
		expect(response.status).toBe(206);
		expect(response.headers.get("content-length")).toBe("2");
		expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
		expect(await response.text()).toBe("bc");
	});

	it.each([1, 2, 3])("follows %i redirect hop(s), including relative Locations", async (hops) => {
		const upstream = await startUpstream((request, response) => {
			const index = Number(request.url?.slice("/hop/".length));
			if (index < hops) {
				response.statusCode = 302;
				response.setHeader("Location", `/hop/${index + 1}`);
				response.end("discarded");
				return;
			}
			response.statusCode = 206;
			response.setHeader("Content-Length", "4");
			response.setHeader("Content-Range", "bytes 0-3/10");
			response.end("done");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/hop/0` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(206);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("done");
	});

	it("rejects a fourth redirect", async () => {
		const upstream = await startUpstream((_request, response) => {
			const index = Number(new URL(_request.url ?? "/", "http://upstream").pathname.slice(5));
			if (index === 4) {
				response.statusCode = 200;
				response.setHeader("Content-Length", "4");
				response.end("done");
				return;
			}
			response.statusCode = 302;
			response.setHeader("Location", `/hop/${index + 1}`);
			response.end("discarded");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/hop/0` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(502);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("Upstream error");
	});

	it.each(["ftp://x/y", "file:///etc/passwd"])("rejects redirect target %s", async (location) => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 302;
			response.setHeader("Location", location);
			response.end("discarded");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/start` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(502);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("Upstream error");
	});

	it("returns 502 for a redirect without Location", async () => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 301;
			response.end("discarded");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/start` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(502);
		assertCommonHeaders(response);
		expect(await response.text()).toBe("Upstream error");
	});

	it("omits Content-Range for a gzip-encoded pass-through 416", async () => {
		const compressed = gzipSync(Buffer.from("range error"));
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 416;
			response.setHeader("Content-Encoding", "gzip");
			response.setHeader("Content-Range", "bytes */10");
			response.setHeader("Content-Length", String(compressed.length));
			response.end(compressed);
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(416);
		expect(response.headers.get("content-range")).toBeNull();
		expect(await response.text()).toBe("Range not satisfiable");
	});

	it("keeps Content-Range for an identity pass-through 416", async () => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 416;
			response.setHeader("Content-Encoding", "identity");
			response.setHeader("Content-Range", "bytes */10");
			response.end();
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(416);
		expect(response.headers.get("content-range")).toBe("bytes */10");
		expect(await response.text()).toBe("Range not satisfiable");
	});

	it.each([
		{ upstream: 200, expected: 200, body: "body" },
		{ upstream: 206, expected: 206, body: "body" },
		{ upstream: 416, expected: 416, body: "Range not satisfiable" },
		{ upstream: 401, expected: 403, body: "Forbidden" },
		{ upstream: 403, expected: 403, body: "Forbidden" },
		{ upstream: 404, expected: 404, body: "Not found" },
		{ upstream: 500, expected: 500, body: "Upstream error" },
		{ upstream: 599, expected: 599, body: "Upstream error" },
		{ upstream: 300, expected: 502, body: "Upstream error" },
	])("maps pass-through status $upstream to $expected", async (testCase) => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = testCase.upstream;
			if (testCase.upstream === 200 || testCase.upstream === 206) {
				response.setHeader("Content-Range", "bytes 0-3/10");
			}
			if (testCase.upstream === 416) {
				response.setHeader("Content-Range", "bytes */10");
			}
			response.setHeader("Content-Type", "video/mp4");
			response.setHeader("Content-Length", "4");
			response.setHeader("Accept-Ranges", "bytes");
			response.end(testCase.upstream === 200 || testCase.upstream === 206 ? "body" : "bad!");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(testCase.expected);
		assertCommonHeaders(response);
		expect(await response.text()).toBe(testCase.body);
		if (testCase.upstream === 200 || testCase.upstream === 206) {
			expect(response.headers.get("content-type")).toBe("video/mp4");
			expect(response.headers.get("content-length")).toBe("4");
			expect(response.headers.get("accept-ranges")).toBe("bytes");
		}
		if (testCase.upstream === 200 || testCase.upstream === 206) {
			expect(response.headers.get("content-range")).toBe("bytes 0-3/10");
		}
		if (testCase.upstream === 416) {
			expect(response.headers.get("content-range")).toBe("bytes */10");
		}
	});

	it("cancels the upstream body after a pass-through HEAD probe", async () => {
		let upstreamClosed = false;
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 206;
			response.setHeader("Content-Range", "bytes 0-0/123");
			response.setHeader("Content-Length", "1");
			response.flushHeaders();
			response.write("x");
			response.on("close", () => {
				upstreamClosed = true;
			});
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, { method: "HEAD" });
		expect(response.status).toBe(200);
		await waitFor(() => upstreamClosed);
		expect(upstreamClosed).toBe(true);
	});

	it("uses the pass-through content type default and omits absent headers", async () => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 200;
			response.setHeader("Content-Length", "1");
			response.end("x");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url);
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(response.headers.get("content-type")).toBe("application/octet-stream");
		expect(response.headers.get("content-length")).toBe("1");
		expect(response.headers.get("content-range")).toBeNull();
		expect(response.headers.get("accept-ranges")).toBeNull();
		expect(await response.text()).toBe("x");
	});

	it.each([
		{ status: 206, headers: { "Content-Range": "bytes 0-0/123", "Content-Length": "1" }, size: "123" },
		{ status: 200, headers: { "Content-Length": "23" }, size: "23" },
		{ status: 416, headers: { "Content-Range": "bytes */0" }, size: "0" },
	])("serves pass-through HEAD via a ranged GET with upstream status $status", async (testCase) => {
		let receivedMethod = "";
		let receivedRange: string | undefined;
		const upstream = await startUpstream((request, response) => {
			receivedMethod = request.method ?? "";
			receivedRange = request.headers.range;
			response.statusCode = testCase.status;
			response.setHeader("Content-Type", "video/mp4");
			for (const [name, value] of Object.entries(testCase.headers)) {
				response.setHeader(name, value);
			}
			response.end("x");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		const response = await fetch(harness.url, { method: "HEAD" });
		expect(response.status).toBe(200);
		assertCommonHeaders(response);
		expect(receivedMethod).toBe("GET");
		expect(receivedRange).toBe("bytes=0-0");
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("content-length")).toBe(testCase.size);
		expect(response.headers.get("accept-ranges")).toBeNull();
		expect(await response.text()).toBe("");
	});
});

describe("stream proxy describe and lifecycle", () => {
	it("describes an S3 target with HeadObject and returns its size", async () => {
		const harness = await makeHarness();
		await expect(harness.proxy.describe(harness.handle)).resolves.toEqual({
			contentType: "video/mp4",
			size: 4,
		});
		expect(harness.calls[0]).toMatchObject({
			name: "HeadObjectCommand",
			input: { Bucket: "media", Key: "movie.mp4" },
		});
		expect(harness.calls[0]?.signal).toBeUndefined();
	});

	it("rejects describe when S3 ContentLength is missing", async () => {
		const harness = await makeHarness({
			script: () => ({ ContentType: "video/mp4" }),
		});
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "REQUEST_FAILED",
			message: "Request failed",
		});
	});

	it("passes a describe AbortSignal to HeadObject", async () => {
		const harness = await makeHarness();
		const controller = new AbortController();
		await harness.proxy.describe(harness.handle, controller.signal);
		expect(harness.calls[0]?.signal).toBe(controller.signal);
	});

	it("returns a coded NOT_FOUND when describe cannot find an S3 connection", async () => {
		const harness = await makeHarness({ connectionExists: false });
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Connection not found",
		});
	});

	it("maps S3 describe SDK errors through mapS3Error", async () => {
		const harness = await makeHarness({
			script: () => {
				throw Object.assign(new Error("private message"), { name: "AccessDenied" });
			},
		});
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "ACCESS_DENIED",
			message: "Access denied",
		});
	});

	it("returns fixed coded errors for pass-through describe statuses", async () => {
		const cases = [
			{ status: 401, code: "ACCESS_DENIED", message: "Access denied" },
			{ status: 403, code: "ACCESS_DENIED", message: "Access denied" },
			{ status: 404, code: "NOT_FOUND", message: "Not found" },
			{ status: 410, code: "NOT_FOUND", message: "Not found" },
			{ status: 500, code: "REQUEST_FAILED", message: "Request failed" },
		];
		for (const testCase of cases) {
			const upstream = await startUpstream((_request, response) => {
				response.statusCode = testCase.status;
				response.setHeader("Content-Length", "9");
				response.end("upstream");
			});
			const harness = await makeHarness({
				target: { kind: "passthrough", url: `${upstream.origin}/object` },
			});
			await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
				code: testCase.code,
				message: testCase.message,
			});
		}
	});

	it("describes a pass-through object through a ranged GET and cancels its body", async () => {
		let receivedMethod = "";
		let receivedRange: string | undefined;
		const upstream = await startUpstream((request, response) => {
			receivedMethod = request.method ?? "";
			receivedRange = request.headers.range;
			response.statusCode = 206;
			response.setHeader("Content-Type", "audio/mpeg");
			response.setHeader("Content-Range", "bytes 0-0/321");
			response.setHeader("Content-Length", "1");
			response.end("x");
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		await expect(harness.proxy.describe(harness.handle)).resolves.toEqual({
			contentType: "audio/mpeg",
			size: 321,
		});
		expect(receivedMethod).toBe("GET");
		expect(receivedRange).toBe("bytes=0-0");
	});

	it.each([
		{ status: 200, headers: { "Content-Length": "20" }, size: 20 },
		{ status: 416, headers: { "Content-Range": "bytes */0" }, size: 0 },
	])("describes pass-through status $status from its size headers", async (testCase) => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = testCase.status;
			for (const [name, value] of Object.entries(testCase.headers)) {
				response.setHeader(name, value);
			}
			response.end();
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		await expect(harness.proxy.describe(harness.handle)).resolves.toEqual({
			contentType: "application/octet-stream",
			size: testCase.size,
		});
	});

	it("returns a coded REQUEST_FAILED when pass-through describe cannot fetch", async () => {
		const harness = await makeHarness({
			target: {
				kind: "passthrough",
				url: "http://127.0.0.1:19099/unreachable",
			},
		});
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "REQUEST_FAILED",
			message: "Request failed",
		});
	});

	it("returns a coded REQUEST_FAILED when pass-through describe has no size", async () => {
		const upstream = await startUpstream((_request, response) => {
			response.statusCode = 200;
			response.write("x");
			response.end();
		});
		const harness = await makeHarness({
			target: { kind: "passthrough", url: `${upstream.origin}/object` },
		});
		await expect(harness.proxy.describe(harness.handle)).rejects.toMatchObject({
			code: "REQUEST_FAILED",
			message: "Request failed",
		});
	});

	it("returns coded NOT_FOUND for an unknown describe handle", async () => {
		const harness = await makeHarness();
		await expect(harness.proxy.describe("0".repeat(32))).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "Not found",
		});
	});

	it("formats urlFor, is idempotent on start and stop, and binds only loopback", async () => {
		const registry = new HandleRegistry();
		const proxy = createStreamProxy({
			registry,
			store: { get: async () => undefined } as never,
			clients: { get: async () => undefined } as never,
			appOrigin: "null",
		});
		proxies.push(proxy);
		expect(() => proxy.urlFor("f".repeat(32))).toThrow();
		const first = await proxy.start();
		const second = await proxy.start();
		expect(second).toEqual(first);
		const handle = registry.create({
			kind: "s3",
			connectionId: "connection-1",
			bucket: "media",
			key: "clip.mp4",
		});
		const url = proxy.urlFor(handle);
		expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/o\/[0-9a-f]{32}\?t=[0-9a-f]{64}$/);
		const address = new URL(first.origin);
		const refused = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
			const socket = createConnection({
				host: "127.0.0.2",
				port: Number(address.port),
			});
			socket.once("connect", () => {
				socket.destroy();
				reject(new Error("Proxy accepted a non-127.0.0.1 connection"));
			});
			socket.once("error", (error: NodeJS.ErrnoException) => resolve(error));
		});
		expect(refused.code).toBe("ECONNREFUSED");
		await proxy.stop();
		await proxy.stop();
		expect(() => proxy.urlFor(handle)).toThrow();
	});

	it("leaves nothing listening when stopped during start", async () => {
		const registry = new HandleRegistry();
		const proxy = createStreamProxy({
			registry,
			store: { get: async () => undefined } as never,
			clients: { get: async () => undefined } as never,
			appOrigin: "null",
		});
		proxies.push(proxy);
		const startPromise = proxy.start();
		const stopPromise = proxy.stop();
		const [{ origin }] = await Promise.all([startPromise, stopPromise]);
		const url = new URL(origin);
		const refused = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
			const socket = createConnection({
				host: "127.0.0.1",
				port: Number(url.port),
			});
			socket.once("connect", () => {
				socket.destroy();
				reject(new Error("Server still listening after stop in start"));
			});
			socket.once("error", (error: NodeJS.ErrnoException) => {
				resolve(error);
			});
		});
		expect(refused.code).toBe("ECONNREFUSED");
	});

	describe("proxy CSP and nosniff headers", () => {
		it.each([
			["S3 HTML", "text/html", true],
			["S3 SVG", "image/svg+xml", true],
			["S3 PDF exact", "application/pdf", false],
			["S3 PDF parameters", "APPLICATION/PDF; charset=binary", false],
		])("sets CSP correctly for %s", async (_name, contentType, expectCsp) => {
			const harness = await makeHarness({
				script: () => ({
					Body: Readable.from([Buffer.from("payload")]),
					ContentType: contentType,
					ContentLength: 7,
				}),
			});
			const response = await fetch(harness.url);
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
			if (expectCsp) {
				expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
			} else {
				expect(response.headers.get("content-security-policy")).toBeNull();
			}
		});

		it.each([
			["pass-through HTML", "text/html", true],
			["pass-through SVG", "image/svg+xml", true],
			["pass-through PDF exact", "application/pdf", false],
			["pass-through PDF parameters", "application/pdf; charset=binary", false],
		])("sets CSP correctly for %s", async (_name, contentType, expectCsp) => {
			const upstream = await startUpstream((_request, response) => {
				response.statusCode = 200;
				response.setHeader("Content-Type", contentType);
				response.setHeader("Content-Length", "7");
				response.end("payload");
			});
			const harness = await makeHarness({
				target: { kind: "passthrough", url: `${upstream.origin}/object` },
			});
			const response = await fetch(harness.url);
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
			if (expectCsp) {
				expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
			} else {
				expect(response.headers.get("content-security-policy")).toBeNull();
			}
		});
	});
});
