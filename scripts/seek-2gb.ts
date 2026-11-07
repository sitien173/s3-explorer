import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import { request as httpRequest, type ClientRequest } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	ListBucketsCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ConnectionView } from "../src/main/connections/store";
import { HandleRegistry } from "../src/main/stream/handles";
import { createStreamProxy } from "../src/main/stream/proxy";

const minimumFileBytes = 2_147_483_648;
const maximumUpstreamBytes = 15_728_640;
const requestedClientBytes = 4 * 1024 * 1024;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mediaPath = resolve(repositoryRoot, "test/.tmp/media/large.mp4");
const rustFsComposeArgs = ["compose", "-f", "test/rustfs/compose.yaml"] as const;

type Observation = {
	upstreamBytes: number;
	abortSignal?: AbortSignal;
};

type SeekMetrics = {
	ttfbMs: number;
	clientBytes: number;
	upstreamBytes: number;
	fileBytes: number;
	offset: number;
};

let interruptedBy: NodeJS.Signals | undefined;
let activeUpload: Upload | undefined;
let activeRequest: ClientRequest | undefined;
let operationAbort: AbortController | undefined;

function onSignal(signal: NodeJS.Signals): void {
	interruptedBy = signal;
	operationAbort?.abort(new Error(`Interrupted by ${signal}`));
	activeRequest?.destroy();
	if (activeUpload) {
		void activeUpload.abort().catch(() => undefined);
	}
}

function ensureLargeFixture(): number {
	try {
		statSync(mediaPath);
	} catch {
		console.log("Generating test/.tmp/media/large.mp4 with make-media.sh --large");
		execFileSync("bash", ["test/fixtures/make-media.sh", "--large"], {
			cwd: repositoryRoot,
			stdio: "inherit",
		});
	}
	const fileBytes = statSync(mediaPath).size;
	if (fileBytes < minimumFileBytes) {
		throw new Error(`large.mp4 is ${fileBytes} bytes; expected at least ${minimumFileBytes}`);
	}
	return fileBytes;
}

function createRustFsClient(): S3Client {
	return new S3Client({
		endpoint: "http://127.0.0.1:19000",
		region: "us-east-1",
		forcePathStyle: true,
		maxAttempts: 1,
		credentials: {
			accessKeyId: "rustfsadmin",
			secretAccessKey: "rustfsadmin",
		},
	});
}

async function rustFsResponds(client: S3Client): Promise<boolean> {
	try {
		await client.send(new ListBucketsCommand({}), operationAbort ? { abortSignal: operationAbort.signal } : undefined);
		return true;
	} catch {
		return false;
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function ensureRustFs(client: S3Client, markStarted: () => void): Promise<boolean> {
	if (await rustFsResponds(client)) {
		console.log("RustFS is already responding; leaving it running on exit");
		return false;
	}
	if (interruptedBy) throw new Error(`Interrupted by ${interruptedBy}`);

	console.log("RustFS did not answer ListBuckets; starting the compose service");
	markStarted();
	execFileSync("docker", [...rustFsComposeArgs, "up", "-d"], {
		cwd: repositoryRoot,
		stdio: "inherit",
	});
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (interruptedBy) throw new Error(`Interrupted by ${interruptedBy}`);
		if (await rustFsResponds(client)) {
			console.log("RustFS is ready");
			return true;
		}
		await delay(Math.min(500, Math.max(0, deadline - Date.now())));
	}
	throw new Error("RustFS did not answer ListBuckets within 60 seconds");
}

function abortSignalFrom(value: unknown): AbortSignal | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const signal = (value as { abortSignal?: unknown }).abortSignal;
	return signal instanceof AbortSignal ? signal : undefined;
}

function createCountingClient(client: S3Client, observation: Observation): S3Client {
	return new Proxy(client, {
		get(target, property, receiver) {
			if (property !== "send") return Reflect.get(target, property, receiver);

			const send = target.send.bind(target) as unknown as (...args: unknown[]) => Promise<unknown>;
			return async (...args: unknown[]): Promise<unknown> => {
				if (!(args[0] instanceof GetObjectCommand)) {
					return send(...args);
				}
				observation.abortSignal = abortSignalFrom(args[1]);
				const output = await send(...args);
				if (
					typeof output !== "object" ||
					output === null ||
					!("Body" in output) ||
					!(output.Body instanceof Readable)
				) {
					return output;
				}

				const source = output.Body;
				const tappedBody = new Transform({
					transform(chunk, encoding, callback) {
						if (Buffer.isBuffer(chunk)) {
							observation.upstreamBytes += chunk.byteLength;
						} else if (typeof chunk === "string") {
							observation.upstreamBytes += Buffer.byteLength(chunk, encoding);
						} else if (chunk instanceof Uint8Array) {
							observation.upstreamBytes += chunk.byteLength;
						}
						callback(null, chunk);
					},
				});
				void pipeline(source, tappedBody).catch(() => undefined);
				return { ...output, Body: tappedBody };
			};
		},
	});
}

async function waitForUpstreamAbort(observation: Observation, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (observation.abortSignal?.aborted) return true;
		await delay(Math.min(25, Math.max(0, deadline - Date.now())));
	}
	return observation.abortSignal?.aborted ?? false;
}

function seekAndDestroy(url: string, offset: number): Promise<{ ttfbMs: number; clientBytes: number }> {
	return new Promise((resolveResult, rejectResult) => {
		const startedAt = performance.now();
		let ttfbMs: number | undefined;
		let clientBytes = 0;
		let deliberatelyDestroyed = false;
		let settled = false;
		let req: ClientRequest | undefined;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(deadlineTimer);
			activeRequest = undefined;
			if (error) rejectResult(error);
			else if (ttfbMs === undefined) {
				rejectResult(new Error("Seek returned no body byte"));
			} else {
				resolveResult({ ttfbMs, clientBytes });
			}
		};

		const deadlineTimer = setTimeout(() => {
			const error = new Error("Timed out waiting for 4 MiB from the seek");
			req?.destroy(error);
			finish(error);
		}, 60_000);

		req = httpRequest(
			url,
			{
				method: "GET",
				headers: { Range: `bytes=${offset}-` },
			},
			(response) => {
				if (response.statusCode !== 206) {
					const error = new Error(`Expected HTTP 206 for seek, received ${response.statusCode ?? "no status"}`);
					response.destroy();
					req?.destroy(error);
					finish(error);
					return;
				}
				response.on("data", (chunk: Buffer | string) => {
					if (ttfbMs === undefined) ttfbMs = performance.now() - startedAt;
					clientBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
					if (clientBytes >= requestedClientBytes && !settled) {
						deliberatelyDestroyed = true;
						req?.destroy();
						finish();
					}
				});
				response.on("end", () => {
					if (clientBytes < requestedClientBytes) {
						finish(new Error(`Seek ended after ${clientBytes} client bytes`));
					} else {
						finish();
					}
				});
				response.on("error", (error) => {
					if (!deliberatelyDestroyed) finish(error);
				});
				response.on("close", () => {
					if (!settled && !deliberatelyDestroyed) {
						finish(new Error("Seek response closed before 4 MiB arrived"));
					}
				});
			},
		);
		activeRequest = req;
		req.on("error", (error) => {
			if (!deliberatelyDestroyed) finish(error);
		});
		req.end();
	});
}

async function main(): Promise<void> {
	ensureLargeFixture();
	const operationController = new AbortController();
	operationAbort = operationController;
	const rustFsClient = createRustFsClient();
	const observation: Observation = { upstreamBytes: 0 };
	let startedRustFs = false;
	let bucketCreated = false;
	let bucketName: string | undefined;
	let proxy: ReturnType<typeof createStreamProxy> | undefined;
	let cleanupFailed = false;

	try {
		await ensureRustFs(rustFsClient, () => {
			startedRustFs = true;
		});
		if (interruptedBy) throw new Error(`Interrupted by ${interruptedBy}`);

		const bucket = `seek2gb-${Date.now()}-${randomBytes(4).toString("hex")}`;
		bucketName = bucket;
		bucketCreated = true;
		const key = "large.mp4";
		await rustFsClient.send(new CreateBucketCommand({ Bucket: bucket }), { abortSignal: operationController.signal });

		const upload = new Upload({
			client: rustFsClient,
			params: {
				Bucket: bucket,
				Key: key,
				Body: createReadStream(mediaPath),
			},
			partSize: 8 * 1024 * 1024,
			queueSize: 2,
		});
		activeUpload = upload;
		await upload.done();
		activeUpload = undefined;

		const fileBytes = statSync(mediaPath).size;
		const offset = Math.floor(fileBytes / 2);
		const connection: ConnectionView = {
			id: `seek2gb-${randomBytes(8).toString("hex")}`,
			name: "seek-check",
			kind: "manual",
			region: "us-east-1",
			endpoint: "http://127.0.0.1:19000",
			forcePathStyle: true,
			pinnedBuckets: [],
			extraBuckets: [],
			sessionOnly: false,
			hasSecret: true,
		};
		const registry = new HandleRegistry();
		const handle = registry.create({
			kind: "s3",
			connectionId: connection.id,
			bucket,
			key,
		});
		const countingClient = createCountingClient(rustFsClient, observation);
		proxy = createStreamProxy({
			registry,
			store: {
				async get(id) {
					return id === connection.id ? connection : undefined;
				},
			},
			clients: {
				async get() {
					return countingClient;
				},
			},
			appOrigin: "null",
		});
		await proxy.start();
		const proxyUrl = proxy.urlFor(handle);
		const readResult = await seekAndDestroy(proxyUrl, offset);
		const upstreamAborted = await waitForUpstreamAbort(observation, 15_000);
		const metrics: SeekMetrics = {
			ttfbMs: readResult.ttfbMs,
			clientBytes: readResult.clientBytes,
			upstreamBytes: observation.upstreamBytes,
			fileBytes,
			offset,
		};
		console.log(
			`ttfbMs=${metrics.ttfbMs.toFixed(2)} clientBytes=${metrics.clientBytes} upstreamBytes=${metrics.upstreamBytes} fileBytes=${metrics.fileBytes} offset=${metrics.offset} upstreamAborted=${upstreamAborted}`,
		);

		const failures: string[] = [];
		if (metrics.clientBytes < requestedClientBytes) {
			failures.push(`clientBytes below ${requestedClientBytes}`);
		}
		if (metrics.ttfbMs > 2_000) failures.push("ttfbMs above 2000");
		if (metrics.upstreamBytes > maximumUpstreamBytes) {
			failures.push(`upstreamBytes above ${maximumUpstreamBytes}`);
		}
		if (!upstreamAborted) failures.push("upstream abort signal was not aborted");
		if (failures.length > 0) {
			throw new Error(`Seek threshold failure: ${failures.join(", ")}`);
		}
	} finally {
		if (proxy) {
			try {
				await proxy.stop();
			} catch (error) {
				cleanupFailed = true;
				console.error(`Failed to stop stream proxy: ${String(error)}`);
			}
		}
		if (bucketCreated && bucketName) {
			try {
				await rustFsClient.send(new DeleteObjectCommand({ Bucket: bucketName, Key: "large.mp4" }));
			} catch (error) {
				cleanupFailed = true;
				console.error(`Failed to delete seek object: ${String(error)}`);
			}
			try {
				await rustFsClient.send(new DeleteBucketCommand({ Bucket: bucketName }));
			} catch (error) {
				cleanupFailed = true;
				console.error(`Failed to delete seek bucket: ${String(error)}`);
			}
		}
		activeRequest?.destroy();
		activeRequest = undefined;
		activeUpload = undefined;
		operationAbort = undefined;
		rustFsClient.destroy();
		if (startedRustFs) {
			try {
				execFileSync("docker", [...rustFsComposeArgs, "down", "-v"], {
					cwd: repositoryRoot,
					stdio: "inherit",
				});
			} catch (error) {
				cleanupFailed = true;
				console.error(`Failed to stop RustFS: ${String(error)}`);
			}
		}
		if (cleanupFailed) process.exitCode = 1;
	}
}

process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
void main()
	.catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`seek:2gb failed: ${message}`);
		process.exitCode = interruptedBy === "SIGINT" ? 130 : interruptedBy === "SIGTERM" ? 143 : 1;
	})
	.finally(() => {
		process.removeListener("SIGINT", onSignal);
		process.removeListener("SIGTERM", onSignal);
	});
