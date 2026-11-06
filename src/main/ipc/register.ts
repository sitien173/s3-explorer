import { channels } from "../../shared/channels";
import {
	envelopeSchema,
	responseSchemas,
	schemas,
	type AnyChannel,
	type RequestByChannel,
	type ResponseByChannel,
} from "../../shared/ipc";
import { browseHandlers, toErrorCode } from "./browse";
import { connectionHandlers, type IpcDeps } from "./connections";
import { opsHandlers, type DialogLike } from "./ops";
import { streamHandlers, type StreamIpcDeps } from "./stream";
import { openWithSystemApp, type OpenExternalDeps } from "../openExternal";
import type { TransferManager } from "../s3/transfers";

export interface SenderLike {
	send(channel: string, payload: unknown): void;
	isDestroyed(): boolean;
	once(event: "destroyed", listener: () => void): unknown;
	removeListener(event: "destroyed", listener: () => void): unknown;
}

export interface IpcMainLike {
	handle(
		channel: string,
		listener: (event: { sender: SenderLike }, input: unknown) => unknown,
	): void;
}

type ChannelHandler<Key extends AnyChannel> = (
	request: RequestByChannel[Key],
	context: { sender: SenderLike },
) => Promise<ResponseByChannel[Key]>;

export function register(
	ipcMain: IpcMainLike,
	deps: IpcDeps & {
		maxSearchMatches?: number;
		dialog?: DialogLike;
		maxActiveTransfers?: number;
		stream?: StreamIpcDeps["stream"];
		openExternalDeps?: OpenExternalDeps;
	},
): void {
	const handlers = connectionHandlers(deps);
	const browse = browseHandlers(deps);
	const ops = opsHandlers(deps);
	const stream = streamHandlers(deps);

	function registerChannel<Key extends AnyChannel>(
		channel: Key,
		handler: ChannelHandler<Key>,
	): void {
		ipcMain.handle(channel, async (event, input) => {
			try {
				const request = schemas[channel].safeParse(input ?? {});
				if (!request.success) {
					return {
						ok: false,
						error: { code: "INVALID_REQUEST", message: "Invalid request" },
					};
				}
				// Zod's union-indexed map loses the correlation between channel and parsed request.
				const parsedRequest = request.data as RequestByChannel[Key];
				const data = await handler(parsedRequest, { sender: event.sender });
				const response = responseSchemas[channel].parse(data);
				return envelopeSchema(responseSchemas[channel]).parse({
					ok: true,
					data: response,
				});
			} catch (error) {
				const errorCode =
					error &&
					typeof error === "object" &&
					"code" in error
						? error.code
						: undefined;
				const profile =
					error &&
					typeof error === "object" &&
					"profile" in error &&
					typeof error.profile === "string"
						? error.profile
						: undefined;
				const message = error instanceof Error ? error.message : undefined;
				const code = toErrorCode(errorCode) ?? "REQUEST_FAILED";
				return envelopeSchema(responseSchemas[channel]).parse({
					ok: false,
					error: {
						code,
						message:
							code === "REQUEST_FAILED"
								? (message ?? "Request failed").replace(
										/(AKIA|ASIA)[A-Z0-9]{16}/g,
										"[redacted]",
									)
								: code === "ACCESS_DENIED"
									? "Access denied"
									: code === "INVALID_REQUEST"
										? (message ?? "Invalid request")
										: code === "CONFLICT"
											? "Destination exists"
											: code === "TOO_LARGE"
												? "Too large to rename"
												: code === "BUCKET_EXISTS"
													? "Bucket name is taken"
													: code === "BUCKET_NOT_EMPTY"
														? "Bucket is not empty"
														: "Request failed",
						...(code === "SSO_LOGIN_REQUIRED" && profile ? { profile } : {}),
					},
				});
			}
		});
	}

	registerChannel(channels.list, handlers[channels.list]);
	registerChannel(channels.create, handlers[channels.create]);
	registerChannel(channels.update, handlers[channels.update]);
	registerChannel(channels.delete, handlers[channels.delete]);
	registerChannel(channels.testConnection, handlers[channels.testConnection]);
	registerChannel(channels.ssoLogin, handlers[channels.ssoLogin]);
	registerChannel(channels.listProfiles, handlers[channels.listProfiles]);

	registerChannel(channels.bucketsList, browse[channels.bucketsList]);
	registerChannel(channels.bucketsPin, browse[channels.bucketsPin]);
	registerChannel(channels.bucketsUnpin, browse[channels.bucketsUnpin]);
	registerChannel(channels.bucketsAdd, browse[channels.bucketsAdd]);
	registerChannel(channels.bucketsCreate, browse[channels.bucketsCreate]);
	registerChannel(channels.bucketsDelete, browse[channels.bucketsDelete]);
	registerChannel(channels.objectsList, browse[channels.objectsList]);
	registerChannel(channels.searchStart, browse[channels.searchStart]);
	registerChannel(channels.searchCancel, browse[channels.searchCancel]);

	registerChannel(channels.opsCreateFolder, ops[channels.opsCreateFolder]);
	registerChannel(channels.opsDelete, ops[channels.opsDelete]);
	registerChannel(channels.opsDeletePrefix, ops[channels.opsDeletePrefix]);
	registerChannel(channels.opsCountPrefix, ops[channels.opsCountPrefix]);
	registerChannel(channels.opsRename, ops[channels.opsRename]);
	registerChannel(channels.opsRenamePrefix, ops[channels.opsRenamePrefix]);
	registerChannel(channels.transfersUpload, ops[channels.transfersUpload]);
	registerChannel(
		channels.transfersUploadPaths,
		ops[channels.transfersUploadPaths],
	);
	registerChannel(
		channels.transfersDownload,
		ops[channels.transfersDownload],
	);
	registerChannel(channels.transfersCancel, ops[channels.transfersCancel]);

	registerChannel(channels.streamOpen, stream[channels.streamOpen]);
	registerChannel(channels.streamOpenUrl, stream[channels.streamOpenUrl]);

	registerChannel(channels.filesOpenWithSystemApp, async (request) => {
		if (
			!deps.openExternalDeps ||
			!deps.openExternalDeps.proxyOrigin ||
			!deps.openExternalDeps.fetch ||
			!deps.openExternalDeps.tempRoot ||
			!deps.openExternalDeps.openPath
		) {
			const error = new Error("Open with system app is unavailable");
			Object.assign(error, { code: "REQUEST_FAILED" });
			throw error;
		}
		return openWithSystemApp(request, deps.openExternalDeps);
	});
}
