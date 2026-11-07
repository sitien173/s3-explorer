import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat, rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { SenderLike } from "../ipc/register";
import { events } from "../../shared/channels";
import { transferDonePayloadSchema, transferProgressPayloadSchema, type IpcError } from "../../shared/ipc";
import { mapS3Error } from "../ipc/browse";

type CommonInput = {
	client: S3Client;
	sender: SenderLike;
	bucket: string;
	key: string;
};

export type UploadInput = CommonInput & { localPath: string };
export type DownloadInput = CommonInput & { destPath: string; id?: string };
type Progress = (loaded: number, total: number) => void;

// Runner rule: a runner that resolves has finished its work, so the outcome
// is "completed" even if cancel was requested. A runner that observes the
// abort signal must reject. A rejection after a cancel request is "cancelled".
export type Runners = {
	upload: (input: UploadInput, signal: AbortSignal, onProgress: Progress) => Promise<void>;
	download: (input: DownloadInput, signal: AbortSignal, onProgress: Progress) => Promise<void>;
};

type EntryState = {
	id: string;
	controller: AbortController;
	state: "queued" | "running";
	cancelled: boolean;
	destroyed: boolean;
	onDestroy: () => void;
	lastProgressAt: number;
};

type Entry =
	| (EntryState & { kind: "upload"; input: UploadInput })
	| (EntryState & { kind: "download"; input: DownloadInput });

type EntryInput = { kind: "upload"; input: UploadInput } | { kind: "download"; input: DownloadInput };

function errorFromSignal(signal: AbortSignal): Error {
	return signal.reason instanceof Error ? signal.reason : new Error("Aborted");
}

async function uploadRunner(input: UploadInput, signal: AbortSignal, onProgress: Progress): Promise<void> {
	const file = await stat(input.localPath);
	if (signal.aborted) throw errorFromSignal(signal);
	const body = createReadStream(input.localPath);
	let upload: Upload | undefined;
	let abort: (() => void) | undefined;
	let progressListener: ((progress: { loaded?: number; total?: number }) => void) | undefined;
	try {
		upload = new Upload({
			client: input.client,
			params: {
				Bucket: input.bucket,
				Key: input.key,
				Body: body,
				ContentLength: file.size,
			},
			partSize: 8 * 1024 * 1024,
		});
		progressListener = (progress: { loaded?: number; total?: number }) => {
			onProgress(progress.loaded ?? 0, progress.total ?? file.size);
		};
		upload.on("httpUploadProgress", progressListener);
		abort = () => {
			void upload?.abort();
		};
		signal.addEventListener("abort", abort, { once: true });
		await upload.done();
	} catch (error) {
		if (signal.aborted) throw errorFromSignal(signal);
		throw error;
	} finally {
		if (abort) signal.removeEventListener("abort", abort);
		if (upload && progressListener) {
			upload.removeListener("httpUploadProgress", progressListener);
		}
		body.destroy();
	}
}

async function downloadRunner(input: DownloadInput, signal: AbortSignal, onProgress: Progress): Promise<void> {
	const partPath = input.id ? `${input.destPath}.${input.id}.part` : `${input.destPath}.part`;
	try {
		const response = await input.client.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.key }), {
			abortSignal: signal,
		});
		const body: unknown = response.Body;
		if (!(body instanceof Readable)) throw new Error("Download body is not readable");

		let loaded = 0;
		const counter = new Transform({
			transform(chunk: Buffer | string, _encoding, callback) {
				loaded += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
				onProgress(loaded, response.ContentLength ?? 0);
				callback(null, chunk);
			},
		});
		await pipeline(body, counter, createWriteStream(partPath), { signal });
		if (signal.aborted) throw errorFromSignal(signal);
		if (typeof response.ContentLength === "number" && loaded !== response.ContentLength) {
			throw new Error("Incomplete download");
		}
		await rename(partPath, input.destPath);
	} catch (error) {
		await rm(partPath, { force: true });
		throw error;
	}
}

const defaultRunners: Runners = {
	upload: uploadRunner,
	download: downloadRunner,
};

export class TransferManager {
	private readonly entries = new Map<string, Entry>();
	private queue: Entry[] = [];
	private active = 0;
	private readonly runners: Runners;
	private readonly maxActive: number;

	constructor(options: { maxActive?: number; runners?: Partial<Runners> } = {}) {
		this.maxActive = options.maxActive ?? 3;
		this.runners = { ...defaultRunners, ...options.runners };
	}

	get activeCount(): number {
		return this.active;
	}

	get queuedCount(): number {
		return this.queue.length;
	}

	get size(): number {
		return this.entries.size;
	}

	startUpload(input: UploadInput): string {
		return this.start({ kind: "upload", input });
	}

	startDownload(input: DownloadInput): string {
		return this.start({ kind: "download", input });
	}

	private start(entryInput: EntryInput): string {
		const id = randomUUID();
		if (entryInput.input.sender.isDestroyed()) return id;

		const entry: Entry =
			entryInput.kind === "upload"
				? {
						...entryInput,
						id,
						controller: new AbortController(),
						state: "queued",
						cancelled: false,
						destroyed: false,
						onDestroy: () => undefined,
						lastProgressAt: Number.NEGATIVE_INFINITY,
					}
				: {
						...entryInput,
						input: { ...entryInput.input, id },
						id,
						controller: new AbortController(),
						state: "queued",
						cancelled: false,
						destroyed: false,
						onDestroy: () => undefined,
						lastProgressAt: Number.NEGATIVE_INFINITY,
					};
		entry.onDestroy = () => {
			entry.destroyed = true;
			void this.cancelEntry(entry);
		};
		this.entries.set(entry.id, entry);
		entry.input.sender.once("destroyed", entry.onDestroy);
		this.emitProgress(entry, 0, 0, true);
		this.queue.push(entry);
		this.pump();
		return entry.id;
	}

	private emitProgress(entry: Entry, loaded: number, total: number, initial = false): void {
		const now = Date.now();
		if (!initial && now - entry.lastProgressAt < 100) return;
		entry.lastProgressAt = now;
		if (entry.input.sender.isDestroyed()) return;
		const payload = transferProgressPayloadSchema.parse({
			transferId: entry.id,
			kind: entry.kind,
			bucket: entry.input.bucket,
			key: entry.input.key,
			loaded,
			total,
		});
		entry.input.sender.send(events.transferProgress, payload);
	}

	private pump(): void {
		while (this.active < this.maxActive && this.queue.length > 0) {
			const entry = this.queue.shift();
			if (!entry || !this.entries.has(entry.id)) continue;
			entry.state = "running";
			this.active++;
			const onProgress = (loaded: number, total: number) => {
				this.emitProgress(entry, loaded, total);
			};
			let task: Promise<void>;
			try {
				task =
					entry.kind === "upload"
						? this.runners.upload(entry.input, entry.controller.signal, onProgress)
						: this.runners.download(entry.input, entry.controller.signal, onProgress);
			} catch (error) {
				task = Promise.reject(error);
			}
			void task.then(
				() => this.finish(entry, "completed"),
				(error: unknown) => this.finish(entry, entry.cancelled ? "cancelled" : "failed", error),
			);
		}
	}

	async cancel(id: string, sender: SenderLike): Promise<boolean> {
		const entry = this.entries.get(id);
		if (!entry || entry.input.sender !== sender) return false;
		await this.cancelEntry(entry);
		return true;
	}

	private async cancelEntry(entry: Entry): Promise<void> {
		if (!this.entries.has(entry.id)) return;
		entry.cancelled = true;
		entry.controller.abort();
		if (entry.state === "queued") {
			this.queue = this.queue.filter((queued) => queued !== entry);
			this.finish(entry, "cancelled");
		}
	}

	private finish(entry: Entry, status: "completed" | "cancelled" | "failed", error?: unknown): void {
		if (!this.entries.delete(entry.id)) return;
		if (entry.state === "running") this.active--;
		entry.input.sender.removeListener("destroyed", entry.onDestroy);
		if (!entry.destroyed && !entry.input.sender.isDestroyed()) {
			let safeError: IpcError | undefined;
			if (status === "failed" && error !== undefined) {
				const mappedError = mapS3Error(error);
				const localPaths =
					entry.kind === "upload"
						? [entry.input.localPath]
						: [`${entry.input.destPath}.${entry.id}.part`, `${entry.input.destPath}.part`, entry.input.destPath];
				localPaths.sort((left, right) => right.length - left.length);
				safeError = {
					...mappedError,
					message: localPaths.reduce((message, path) => message.split(path).join("[local file]"), mappedError.message),
				};
			}
			const payload = transferDonePayloadSchema.parse({
				transferId: entry.id,
				status,
				...(safeError ? { error: safeError } : {}),
			});
			entry.input.sender.send(events.transferDone, payload);
		}
		this.pump();
	}
}
