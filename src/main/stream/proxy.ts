import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	GetObjectCommand,
	HeadObjectCommand,
	type GetObjectCommandOutput,
	type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { mapS3Error } from "../ipc/browse";
import type { ConnectionStore, ConnectionView } from "../connections/store";
import type { S3ClientFactory } from "../s3/client";
import type { HandleRegistry, HandleTarget } from "./handles";
import { formatRange, parseRange } from "./range";

type StreamDescription = { contentType: string; size: number };
type Client = Awaited<ReturnType<S3ClientFactory["get"]>>;
type ProxyBody = Readable | undefined;

type PassHeadResult = {
	status: number;
	contentType: string;
	acceptRanges?: string;
	size?: number;
};

const commonHeaders = {
	"Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
	"X-Content-Type-Options": "nosniff",
	"Cache-Control": "no-store",
};
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const allowedPassThroughStatuses = new Set([200, 206]);

export type StreamProxyOptions = {
	registry: HandleRegistry;
	store: Pick<ConnectionStore, "get">;
	clients: Pick<S3ClientFactory, "get">;
	appOrigin: string;
};

export type StreamProxy = {
	start(): Promise<{ origin: string }>;
	stop(): Promise<void>;
	urlFor(handle: string): string;
	describe(handle: string, signal?: AbortSignal): Promise<StreamDescription>;
};

function codedError(code: string, message: string): Error & { code: string } {
	return Object.assign(new Error(message), { code });
}

function isPdfContentType(contentType: string | undefined): boolean {
	if (!contentType) return false;
	const mime = contentType.split(";")[0]?.trim().toLowerCase();
	return mime === "application/pdf";
}

function applyCspHeader(response: ServerResponse, contentType: string | undefined): void {
	if (isPdfContentType(contentType)) {
		response.removeHeader("Content-Security-Policy");
	} else {
		response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
	}
}

function setCommonHeaders(response: ServerResponse, appOrigin: string): void {
	response.setHeader("Access-Control-Allow-Origin", appOrigin);
	response.setHeader("Vary", "Origin");
	for (const [name, value] of Object.entries(commonHeaders)) {
		response.setHeader(name, value);
	}
	applyCspHeader(response, undefined);
}

function sendFixed(response: ServerResponse, method: string, status: number, body: string): void {
	response.statusCode = status;
	if (method === "HEAD") {
		response.end();
		return;
	}
	response.end(body);
}

function tokenMatches(actual: string | null, expected: string): boolean {
	if (actual === null) return false;
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	if (actualBytes.length !== expectedBytes.length) return false;
	return timingSafeEqual(actualBytes, expectedBytes);
}

function requestHeader(request: IncomingMessage, name: string): string | undefined {
	const value = request.headers[name];
	return typeof value === "string" ? value : undefined;
}

function passThroughHeaders(request: IncomingMessage, forcedRange?: string): Record<string, string> {
	const headers: Record<string, string> = {
		"Accept-Encoding": "identity",
	};
	if (forcedRange !== undefined) {
		headers.Range = forcedRange;
	} else {
		const spec = parseRange(requestHeader(request, "range"));
		if (spec) {
			headers.Range = formatRange(spec);
		}
	}
	const ifRange = requestHeader(request, "if-range");
	const accept = requestHeader(request, "accept");
	if (ifRange !== undefined) {
		headers["If-Range"] = ifRange;
	}
	if (accept !== undefined) {
		headers.Accept = accept;
	}
	return headers;
}

function errorHttpStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
	const status = metadata?.httpStatusCode;
	return typeof status === "number" ? status : undefined;
}

function s3ErrorStatus(error: unknown, connection: ConnectionView): number {
	const status = errorHttpStatus(error);
	if (status === 403 || status === 404 || status === 416 || (status !== undefined && status >= 500 && status <= 599)) {
		return status;
	}
	const mapped = mapS3Error(error, connection);
	if (mapped.code === "ACCESS_DENIED" || mapped.code === "SSO_LOGIN_REQUIRED") {
		return 403;
	}
	if (mapped.code === "NOT_FOUND") return 404;
	return 502;
}

function passThroughError(status: number): { status: number; body: string } {
	if (status === 401 || status === 403) {
		return { status: 403, body: "Forbidden" };
	}
	if (status === 404) return { status: 404, body: "Not found" };
	if (status === 416) {
		return { status: 416, body: "Range not satisfiable" };
	}
	if (status >= 500 && status <= 599) {
		return { status, body: "Upstream error" };
	}
	return { status: 502, body: "Upstream error" };
}

function s3ErrorBody(status: number): string {
	if (status === 403) return "Forbidden";
	if (status === 404) return "Not found";
	if (status === 416) return "Range not satisfiable";
	return "Upstream error";
}

function setS3Headers(
	response: ServerResponse,
	contentType: string | undefined,
	contentLength: number | undefined,
): void {
	const resolved = contentType ?? "application/octet-stream";
	response.setHeader("Content-Type", resolved);
	applyCspHeader(response, resolved);
	if (typeof contentLength === "number") {
		response.setHeader("Content-Length", String(contentLength));
	}
	response.setHeader("Accept-Ranges", "bytes");
}

function parseTotalContentRange(value: string | null): number | undefined {
	if (value === null) return undefined;
	const match = /^bytes 0-0\/(\d+)$/.exec(value);
	if (!match?.[1]) return undefined;
	const size = Number(match[1]);
	return Number.isSafeInteger(size) ? size : undefined;
}

function parseUnsatisfiedContentRange(value: string | null): number | undefined {
	if (value === null) return undefined;
	const match = /^bytes \*\/(\d+)$/.exec(value);
	if (!match?.[1]) return undefined;
	const size = Number(match[1]);
	return Number.isSafeInteger(size) ? size : undefined;
}

function parseContentLength(value: string | null): number | undefined {
	if (value === null || !/^\d+$/.test(value)) return undefined;
	const size = Number(value);
	return Number.isSafeInteger(size) ? size : undefined;
}

function isEncodedContent(headers: Headers): boolean {
	const encoding = headers.get("content-encoding");
	return encoding !== null && encoding.trim().toLowerCase() !== "identity";
}

function parsePassThroughSize(status: number, headers: Headers): number | undefined {
	if (isEncodedContent(headers)) {
		return undefined;
	}
	if (status === 206) {
		return parseTotalContentRange(headers.get("content-range"));
	}
	if (status === 200) {
		return parseContentLength(headers.get("content-length"));
	}
	if (status === 416) {
		return parseUnsatisfiedContentRange(headers.get("content-range"));
	}
	return undefined;
}

async function cancelFetchBody(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// A body can already be closed while a redirect or HEAD is discarded.
	}
}

async function fetchWithRedirects(
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<Response> {
	let current: URL;
	try {
		current = new URL(url);
	} catch {
		throw new Error("Invalid upstream URL");
	}
	if (current.protocol !== "http:" && current.protocol !== "https:") {
		throw new Error("Unsupported upstream protocol");
	}

	let redirects = 0;
	while (true) {
		const response = await fetch(current, {
			method: "GET",
			headers,
			redirect: "manual",
			signal,
		});
		if (!redirectStatuses.has(response.status)) return response;

		const location = response.headers.get("location");
		if (!location || redirects >= 3) {
			await cancelFetchBody(response);
			throw new Error("Invalid upstream redirect");
		}

		let next: URL;
		try {
			next = new URL(location, current);
		} catch {
			await cancelFetchBody(response);
			throw new Error("Invalid upstream redirect");
		}
		await cancelFetchBody(response);
		if (next.protocol !== "http:" && next.protocol !== "https:") {
			throw new Error("Unsupported upstream redirect");
		}
		current = next;
		redirects++;
	}
}

function responseHeader(response: Response, name: string): string | undefined {
	return response.headers.get(name) ?? undefined;
}

function readableFromFetch(response: Response): Readable | undefined {
	if (!response.body) return undefined;
	return Readable.from(response.body, { objectMode: false });
}

async function describePassThrough(url: string, signal?: AbortSignal): Promise<StreamDescription> {
	const requestSignal = signal ?? new AbortController().signal;
	let response: Response;
	try {
		response = await fetchWithRedirects(
			url,
			{
				Range: "bytes=0-0",
				"Accept-Encoding": "identity",
			},
			requestSignal,
		);
	} catch {
		throw codedError("REQUEST_FAILED", "Request failed");
	}
	const status = response.status;
	const contentType = response.headers.get("content-type") ?? "application/octet-stream";
	const size = parsePassThroughSize(status, response.headers);
	await cancelFetchBody(response);

	if (status === 401 || status === 403) {
		throw codedError("ACCESS_DENIED", "Access denied");
	}
	if (status === 404 || status === 410) {
		throw codedError("NOT_FOUND", "Not found");
	}
	if ((status !== 200 && status !== 206 && status !== 416) || size === undefined) {
		throw codedError("REQUEST_FAILED", "Request failed");
	}
	return { contentType, size };
}

async function describeS3(
	target: Extract<HandleTarget, { kind: "s3" }>,
	signal: AbortSignal | undefined,
	options: StreamProxyOptions,
): Promise<StreamDescription> {
	const connection = await options.store.get(target.connectionId);
	if (!connection) {
		throw codedError("NOT_FOUND", "Connection not found");
	}
	let output: HeadObjectCommandOutput;
	try {
		const client = await options.clients.get(connection);
		output = await client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: target.key }), {
			abortSignal: signal,
		});
	} catch (error) {
		const mapped = mapS3Error(error, connection);
		throw Object.assign(new Error(mapped.message), mapped);
	}
	if (typeof output.ContentLength !== "number") {
		throw codedError("REQUEST_FAILED", "Request failed");
	}
	return {
		contentType: output.ContentType ?? "application/octet-stream",
		size: output.ContentLength,
	};
}

async function sendS3Failure(
	response: ServerResponse,
	method: string,
	error: unknown,
	connection: ConnectionView,
	client: Client | undefined,
	bucket: string,
	key: string,
	signal: AbortSignal,
): Promise<void> {
	const status = s3ErrorStatus(error, connection);
	if (status === 416 && client) {
		try {
			const output = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
			if (typeof output.ContentLength === "number") {
				response.setHeader("Content-Range", `bytes */${output.ContentLength}`);
			}
		} catch {
			// A failed size lookup does not change the fixed 416 response.
		}
	}
	sendFixed(response, method, status, s3ErrorBody(status));
}

async function serveS3Head(
	request: IncomingMessage,
	response: ServerResponse,
	target: Extract<HandleTarget, { kind: "s3" }>,
	signal: AbortSignal,
	options: StreamProxyOptions,
): Promise<void> {
	const connection = await options.store.get(target.connectionId);
	if (!connection) {
		sendFixed(response, request.method ?? "GET", 404, "Not found");
		return;
	}

	let client: Client | undefined;
	try {
		client = await options.clients.get(connection);
		const output = await client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: target.key }), {
			abortSignal: signal,
		});
		setS3Headers(response, output.ContentType, output.ContentLength);
		response.statusCode = 200;
		response.end();
	} catch (error) {
		await sendS3Failure(
			response,
			request.method ?? "GET",
			error,
			connection,
			client,
			target.bucket,
			target.key,
			signal,
		);
	}
}

async function serveS3Get(
	request: IncomingMessage,
	response: ServerResponse,
	target: Extract<HandleTarget, { kind: "s3" }>,
	signal: AbortSignal,
	setBody: (body: ProxyBody) => void,
	options: StreamProxyOptions,
): Promise<void> {
	const connection = await options.store.get(target.connectionId);
	if (!connection) {
		sendFixed(response, request.method ?? "GET", 404, "Not found");
		return;
	}

	const range = parseRange(requestHeader(request, "range"));
	let client: Client | undefined;
	let output: GetObjectCommandOutput;
	try {
		client = await options.clients.get(connection);
		output = await client.send(
			new GetObjectCommand({
				Bucket: target.bucket,
				Key: target.key,
				...(range ? { Range: formatRange(range) } : {}),
			}),
			{ abortSignal: signal },
		);
	} catch (error) {
		await sendS3Failure(
			response,
			request.method ?? "GET",
			error,
			connection,
			client,
			target.bucket,
			target.key,
			signal,
		);
		return;
	}

	const body = output.Body;
	if (!(body instanceof Readable)) {
		sendFixed(response, request.method ?? "GET", 502, "Upstream error");
		return;
	}
	setBody(body);
	setS3Headers(response, output.ContentType, output.ContentLength);
	if (range && output.ContentRange) {
		response.statusCode = 206;
		response.setHeader("Content-Range", output.ContentRange);
	} else {
		response.statusCode = 200;
	}
	response.flushHeaders();
	try {
		await pipeline(body, response);
	} catch {
		if (!response.destroyed) response.destroy();
	}
}

async function passThroughHeadResult(
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<PassHeadResult> {
	const response = await fetchWithRedirects(url, headers, signal);
	const acceptRanges = response.headers.get("accept-ranges");
	const result: PassHeadResult = {
		status: response.status,
		contentType: response.headers.get("content-type") ?? "application/octet-stream",
		...(acceptRanges !== null ? { acceptRanges } : {}),
		size: parsePassThroughSize(response.status, response.headers),
	};
	await cancelFetchBody(response);
	return result;
}

function setPassThroughHeaders(response: ServerResponse, upstream: Response): void {
	const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
	response.setHeader("Content-Type", contentType);
	applyCspHeader(response, contentType);
	if (!isEncodedContent(upstream.headers)) {
		const contentLength = responseHeader(upstream, "content-length");
		if (contentLength !== undefined) {
			response.setHeader("Content-Length", contentLength);
		}
		const contentRange = responseHeader(upstream, "content-range");
		if (contentRange !== undefined) {
			response.setHeader("Content-Range", contentRange);
		}
	}
	const acceptRanges = responseHeader(upstream, "accept-ranges");
	if (acceptRanges !== undefined) {
		response.setHeader("Accept-Ranges", acceptRanges);
	}
}

async function servePassThroughHead(
	request: IncomingMessage,
	response: ServerResponse,
	url: string,
	signal: AbortSignal,
): Promise<void> {
	let result: PassHeadResult;
	try {
		result = await passThroughHeadResult(url, passThroughHeaders(request, "bytes=0-0"), signal);
	} catch {
		sendFixed(response, request.method ?? "HEAD", 502, "Upstream error");
		return;
	}

	if (result.status === 401 || result.status === 403 || result.status === 404) {
		const mapped = passThroughError(result.status);
		sendFixed(response, request.method ?? "HEAD", mapped.status, mapped.body);
		return;
	}
	if (result.status === 416 && result.size === undefined) {
		sendFixed(response, request.method ?? "HEAD", 502, "Upstream error");
		return;
	}
	if ((result.status !== 200 && result.status !== 206 && result.status !== 416) || result.size === undefined) {
		const mapped = passThroughError(result.status);
		sendFixed(response, request.method ?? "HEAD", mapped.status, mapped.body);
		return;
	}

	response.statusCode = 200;
	response.setHeader("Content-Type", result.contentType);
	applyCspHeader(response, result.contentType);
	response.setHeader("Content-Length", String(result.size));
	if (result.acceptRanges !== undefined) {
		response.setHeader("Accept-Ranges", result.acceptRanges);
	}
	response.end();
}

async function servePassThroughGet(
	request: IncomingMessage,
	response: ServerResponse,
	url: string,
	signal: AbortSignal,
	setBody: (body: ProxyBody) => void,
): Promise<void> {
	let upstream: Response;
	try {
		upstream = await fetchWithRedirects(url, passThroughHeaders(request), signal);
	} catch {
		sendFixed(response, request.method ?? "GET", 502, "Upstream error");
		return;
	}

	if (!allowedPassThroughStatuses.has(upstream.status)) {
		const mapped = passThroughError(upstream.status);
		if (upstream.status === 416 && !isEncodedContent(upstream.headers)) {
			const contentRange = responseHeader(upstream, "content-range");
			if (contentRange !== undefined) {
				response.setHeader("Content-Range", contentRange);
			}
		}
		await cancelFetchBody(upstream);
		sendFixed(response, request.method ?? "GET", mapped.status, mapped.body);
		return;
	}

	if (upstream.status === 206 && isEncodedContent(upstream.headers)) {
		await cancelFetchBody(upstream);
		sendFixed(response, request.method ?? "GET", 502, "Upstream error");
		return;
	}

	setPassThroughHeaders(response, upstream);
	response.statusCode = upstream.status;
	const body = readableFromFetch(upstream);
	if (!body) {
		response.end();
		return;
	}
	setBody(body);
	response.flushHeaders();
	try {
		await pipeline(body, response);
	} catch {
		if (!response.destroyed) response.destroy();
	}
}

async function servePassThrough(
	request: IncomingMessage,
	response: ServerResponse,
	target: Extract<HandleTarget, { kind: "passthrough" }>,
	signal: AbortSignal,
	setBody: (body: ProxyBody) => void,
): Promise<void> {
	if (request.method === "HEAD") {
		await servePassThroughHead(request, response, target.url, signal);
		return;
	}
	await servePassThroughGet(request, response, target.url, signal, setBody);
}

async function routeRequest(
	request: IncomingMessage,
	response: ServerResponse,
	options: StreamProxyOptions,
	origin: () => string,
	expectedToken: string,
): Promise<void> {
	setCommonHeaders(response, options.appOrigin);
	let parsed: URL;
	try {
		parsed = new URL(request.url ?? "/", origin());
	} catch {
		sendFixed(response, request.method ?? "GET", 403, "Forbidden");
		return;
	}
	const match = /^\/o\/([0-9a-f]{32})$/.exec(parsed.pathname);
	const handle = match?.[1];
	const token = parsed.searchParams.get("t");
	if ((request.method !== "GET" && request.method !== "HEAD") || !handle || !tokenMatches(token, expectedToken)) {
		sendFixed(response, request.method ?? "GET", 403, "Forbidden");
		return;
	}
	const target = options.registry.get(handle);
	if (!target) {
		sendFixed(response, request.method ?? "GET", 403, "Forbidden");
		return;
	}

	const controller = new AbortController();
	let upstreamBody: ProxyBody;
	const setBody = (body: ProxyBody) => {
		upstreamBody = body;
		if (controller.signal.aborted) body?.destroy();
	};
	response.on("close", () => {
		if (!response.writableFinished) {
			controller.abort();
			upstreamBody?.destroy();
		}
	});

	try {
		if (target.kind === "s3") {
			if (request.method === "HEAD") {
				await serveS3Head(request, response, target, controller.signal, options);
			} else {
				await serveS3Get(request, response, target, controller.signal, setBody, options);
			}
		} else {
			await servePassThrough(request, response, target, controller.signal, setBody);
		}
	} catch {
		upstreamBody?.destroy();
		if (response.headersSent) {
			response.destroy();
		} else if (!controller.signal.aborted && !response.destroyed) {
			sendFixed(response, request.method ?? "GET", 502, "Upstream error");
		}
	}
}

export function createStreamProxy(options: StreamProxyOptions): StreamProxy {
	const proxyToken = randomBytes(32).toString("hex");
	let server: Server | undefined;
	let origin: string | undefined;
	let starting: Promise<{ origin: string }> | undefined;

	return {
		start() {
			if (origin) {
				return Promise.resolve({ origin });
			}
			if (starting) {
				return starting;
			}
			const listeningServer = createServer((request, response) => {
				void routeRequest(request, response, options, () => origin ?? "http://127.0.0.1", proxyToken).catch(() => {
					if (response.headersSent) {
						response.destroy();
					} else if (!response.destroyed) {
						setCommonHeaders(response, options.appOrigin);
						sendFixed(response, request.method ?? "GET", 502, "Upstream error");
					}
				});
			});
			server = listeningServer;
			starting = new Promise<{ origin: string }>((resolve, reject) => {
				listeningServer.once("error", reject);
				listeningServer.listen(0, "127.0.0.1", () => {
					const address = listeningServer.address();
					if (!address || typeof address === "string") {
						reject(new Error("Proxy did not bind an IP address"));
						return;
					}
					origin = `http://127.0.0.1:${address.port}`;
					resolve({ origin });
				});
			}).catch((error: unknown) => {
				starting = undefined;
				server = undefined;
				throw error;
			});
			return starting;
		},
		async stop() {
			if (starting) {
				try {
					await starting;
				} catch {
					// Ignore rejection when closing.
				}
			}
			const listeningServer = server;
			if (!listeningServer?.listening) {
				server = undefined;
				origin = undefined;
				starting = undefined;
				return;
			}
			listeningServer.closeAllConnections();
			await new Promise<void>((resolve, reject) => {
				listeningServer.close((error) => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});
			server = undefined;
			origin = undefined;
			starting = undefined;
		},
		urlFor(handle) {
			if (!origin) throw new Error("Proxy is not started");
			return `${origin}/o/${handle}?t=${proxyToken}`;
		},
		async describe(handle, signal) {
			const target = options.registry.get(handle);
			if (!target) throw codedError("NOT_FOUND", "Not found");
			if (target.kind === "passthrough") {
				return describePassThrough(target.url, signal);
			}
			return describeS3(target, signal, options);
		},
	};
}
