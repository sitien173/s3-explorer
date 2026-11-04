import type { IpcDeps } from "./connections";
import type { SenderLike } from "./register";
import {
	searchBatchPayloadSchema,
	searchProgressPayloadSchema,
	searchDonePayloadSchema,
	type IpcError,
	type RequestByChannel,
	type ResponseByChannel,
} from "../../shared/ipc";
import { channels, events } from "../../shared/channels";
import { mapSsoError } from "../sso";
import { listBuckets } from "../s3/buckets";
import { listObjects } from "../s3/list";
import { runSearch, MAX_SEARCH_MATCHES } from "../s3/search";

export { MAX_SEARCH_MATCHES };

const errorCodes = [
	"INVALID_REQUEST",
	"NOT_FOUND",
	"SSO_LOGIN_REQUIRED",
	"CLI_MISSING",
	"SSO_LOGIN_FAILED",
	"REQUEST_FAILED",
	"ACCESS_DENIED",
	"CONFLICT",
	"TOO_LARGE",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export function toErrorCode(code: unknown): ErrorCode | undefined {
	if (typeof code !== "string") return undefined;
	return errorCodes.find((candidate) => candidate === code);
}

function codedError(code: string, message: string) {
	return Object.assign(new Error(message), { code });
}

export function mapS3Error(
	error: unknown,
	connection?: { kind?: string; profile?: string },
): IpcError {
	if (connection?.kind === "profile") {
		const sso = mapSsoError(error, connection.profile ?? "");
		if (sso) {
			return {
				code: "SSO_LOGIN_REQUIRED",
				message: "Request failed",
				profile: sso.profile,
			};
		}
	}
	const candidate = error as { name?: string; message?: string } | undefined;
	const name = candidate?.name;
	if (name === "AccessDenied") {
		return {
			code: "ACCESS_DENIED",
			message: "Access denied",
		};
	}
	if (name === "NoSuchBucket" || name === "NoSuchKey" || name === "NotFound") {
		return {
			code: "NOT_FOUND",
			message: "Request failed",
		};
	}
	const message =
		candidate?.message ??
		(error instanceof Error ? error.message : String(error));
	return {
		code: "REQUEST_FAILED",
		message: `${name ?? "Error"}: ${message}`.replace(
			/(AKIA|ASIA)[A-Z0-9]{16}/g,
			"[redacted]",
		),
	};
}

export function throwMappedError(
	error: unknown,
	connection?: { kind?: string; profile?: string },
): never {
	const mapped = mapS3Error(error, connection);
	throw Object.assign(new Error(mapped.message), mapped);
}

interface ActiveSearchJob {
	sender: SenderLike;
	controller: AbortController;
	cleanup: () => void;
}

export class SearchJobRegistry {
	private readonly jobs = new Map<string, ActiveSearchJob>();

	get size(): number {
		return this.jobs.size;
	}

	has(jobId: string): boolean {
		return this.jobs.has(jobId);
	}

	get(jobId: string): ActiveSearchJob | undefined {
		return this.jobs.get(jobId);
	}

	set(jobId: string, job: ActiveSearchJob): void {
		this.jobs.set(jobId, job);
	}

	delete(jobId: string): boolean {
		return this.jobs.delete(jobId);
	}
}

export type BrowseHandlers = {
	[Key in
		| typeof channels.bucketsList
		| typeof channels.bucketsPin
		| typeof channels.bucketsUnpin
		| typeof channels.bucketsAdd
		| typeof channels.objectsList
		| typeof channels.searchStart
		| typeof channels.searchCancel]: (
		input: RequestByChannel[Key],
		context: { sender: SenderLike },
	) => Promise<ResponseByChannel[Key]>;
} & {
	jobRegistry: SearchJobRegistry;
	getRegistrySize: () => number;
};

export function browseHandlers(
	deps: IpcDeps & { maxSearchMatches?: number; jobRegistry?: SearchJobRegistry },
): BrowseHandlers {
	const registry = deps.jobRegistry ?? new SearchJobRegistry();

	const handlers = {
		[channels.bucketsList]: async (input: RequestByChannel[typeof channels.bucketsList]) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			const client = await deps.clients.get(connection);
			try {
				return await listBuckets(client, {
					pinned: connection.pinnedBuckets,
					extras: connection.extraBuckets,
				});
			} catch (error) {
				throwMappedError(error, connection);
			}
		},
		[channels.bucketsPin]: async (input: RequestByChannel[typeof channels.bucketsPin]) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			const pinnedBuckets = connection.pinnedBuckets.includes(input.bucket)
				? connection.pinnedBuckets
				: [...connection.pinnedBuckets, input.bucket];
			const updated = await deps.store.update(input.connectionId, {
				pinnedBuckets,
			});
			return updated!;
		},
		[channels.bucketsUnpin]: async (input: RequestByChannel[typeof channels.bucketsUnpin]) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			const pinnedBuckets = connection.pinnedBuckets.filter(
				(b) => b !== input.bucket,
			);
			const updated = await deps.store.update(input.connectionId, {
				pinnedBuckets,
			});
			return updated!;
		},
		[channels.bucketsAdd]: async (input: RequestByChannel[typeof channels.bucketsAdd]) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			const extraBuckets = connection.extraBuckets.includes(input.bucket)
				? connection.extraBuckets
				: [...connection.extraBuckets, input.bucket];
			const updated = await deps.store.update(input.connectionId, {
				extraBuckets,
			});
			return updated!;
		},
		[channels.objectsList]: async (input: RequestByChannel[typeof channels.objectsList]) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");
			const client = await deps.clients.get(connection);
			try {
				return await listObjects(client, {
					bucket: input.bucket,
					prefix: input.prefix,
					token: input.token,
				});
			} catch (error) {
				throwMappedError(error, connection);
			}
		},
		[channels.searchStart]: async (
			input: RequestByChannel[typeof channels.searchStart],
			context: { sender: SenderLike },
		) => {
			const connection = await deps.store.get(input.connectionId);
			if (!connection) throw codedError("NOT_FOUND", "Connection not found");

			const client = await deps.clients.get(connection);
			const sender = context.sender;

			if (sender.isDestroyed()) {
				return { jobId: input.jobId };
			}

			if (registry.has(input.jobId)) {
				throw codedError("INVALID_REQUEST", "Job already exists");
			}

			const controller = new AbortController();
			let cleanedUp = false;

			const cleanup = () => {
				if (cleanedUp) return;
				cleanedUp = true;
				registry.delete(input.jobId);
				sender.removeListener("destroyed", onDestroy);
			};

			const onDestroy = () => {
				controller.abort();
				cleanup();
			};

			sender.once("destroyed", onDestroy);
			registry.set(input.jobId, { sender, controller, cleanup });

			void runSearch(
				client,
				{
					bucket: input.bucket,
					prefix: input.prefix,
					query: input.query,
					signal: controller.signal,
					cap: deps.maxSearchMatches ?? MAX_SEARCH_MATCHES,
				},
				{
					onBatch: (matches) => {
						if (sender.isDestroyed()) return;
						const payload = searchBatchPayloadSchema.parse({
							jobId: input.jobId,
							matches,
						});
						sender.send(events.searchBatch, payload);
					},
					onProgress: (progress) => {
						if (sender.isDestroyed()) return;
						const payload = searchProgressPayloadSchema.parse({
							jobId: input.jobId,
							...progress,
						});
						sender.send(events.searchProgress, payload);
					},
				},
			).then(
				(result) => {
					cleanup();
					if (sender.isDestroyed()) return;
					const payload = searchDonePayloadSchema.parse({
						jobId: input.jobId,
						truncated: result.truncated,
						cancelled: result.cancelled,
					});
					sender.send(events.searchDone, payload);
				},
				(error) => {
					cleanup();
					if (sender.isDestroyed()) return;
					const mapped = mapS3Error(error, connection);
					const payload = searchDonePayloadSchema.parse({
						jobId: input.jobId,
						truncated: false,
						cancelled: false,
						error: mapped,
					});
					sender.send(events.searchDone, payload);
				},
			);

			return { jobId: input.jobId };
		},
		[channels.searchCancel]: async (
			input: RequestByChannel[typeof channels.searchCancel],
			context: { sender: SenderLike },
		) => {
			const job = registry.get(input.jobId);
			if (!job || job.sender !== context.sender) {
				return { cancelled: false };
			}
			job.controller.abort();
			return { cancelled: true };
		},
		jobRegistry: registry,
		getRegistrySize: () => registry.size,
	};

	return handlers;
}
