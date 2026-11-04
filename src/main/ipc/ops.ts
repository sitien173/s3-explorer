import { stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { channels, events } from "../../shared/channels";
import {
	opsProgressPayloadSchema,
	type RequestByChannel,
	type ResponseByChannel,
} from "../../shared/ipc";
import {
	createFolder,
	countPrefix,
	deleteKeys,
	deletePrefix,
	renameObject,
	renamePrefix,
} from "../s3/ops";
import { TransferManager } from "../s3/transfers";
import type { SenderLike } from "./register";
import type { IpcDeps } from "./connections";

export interface OpenDialogOptions {
	properties: ("openFile" | "multiSelections")[];
}
export interface SaveDialogOptions {
	defaultPath?: string;
}
export interface DialogLike {
	showOpenDialog(
		options: OpenDialogOptions,
	): Promise<{ canceled: boolean; filePaths: string[] }>;
	showSaveDialog(
		options: SaveDialogOptions,
	): Promise<{ canceled: boolean; filePath?: string }>;
}

type OpsChannel =
	| typeof channels.opsCreateFolder
	| typeof channels.opsDelete
	| typeof channels.opsDeletePrefix
	| typeof channels.opsCountPrefix
	| typeof channels.opsRename
	| typeof channels.opsRenamePrefix
	| typeof channels.transfersUpload
	| typeof channels.transfersUploadPaths
	| typeof channels.transfersDownload
	| typeof channels.transfersCancel;
type HandlerMap = {
	[Key in OpsChannel]: (
		request: RequestByChannel[Key],
		context: { sender: SenderLike },
	) => Promise<ResponseByChannel[Key]>;
};
type OpsDeps = IpcDeps & {
	dialog?: DialogLike;
	maxActiveTransfers?: number;
	transfers?: TransferManager;
};

function codedError(code: string, message: string): Error & { code: string } {
	return Object.assign(new Error(message), { code });
}

export function opsHandlers(deps: OpsDeps): HandlerMap {
	function progress(
		sender: SenderLike,
		opId: string,
		done: number,
		total: number,
	): void {
		if (sender.isDestroyed()) return;
		const payload = opsProgressPayloadSchema.parse({ opId, done, total });
		sender.send(events.opsProgress, payload);
	}

	async function getClient(connectionId: string) {
		const connection = await deps.store.get(connectionId);
		if (!connection) throw codedError("NOT_FOUND", "Connection not found");
		return deps.clients.get(connection);
	}

	const transfers =
		deps.transfers ??
		new TransferManager({ maxActive: deps.maxActiveTransfers });

	function requireDialog(): DialogLike {
		if (!deps.dialog) throw codedError("REQUEST_FAILED", "Dialog unavailable");
		return deps.dialog;
	}

	async function isRegularFile(path: string): Promise<boolean> {
		if (!isAbsolute(path)) return false;
		try {
			return (await stat(path)).isFile();
		} catch {
			return false;
		}
	}

	async function startUploads(
		client: Awaited<ReturnType<typeof getClient>>,
		sender: SenderLike,
		bucket: string,
		prefix: string,
		paths: string[],
	): Promise<{ transferIds: string[]; rejectedCount: number }> {
		const transferIds: string[] = [];
		let rejectedCount = 0;
		for (const localPath of paths) {
			if (!(await isRegularFile(localPath))) {
				rejectedCount++;
				continue;
			}
			transferIds.push(
				transfers.startUpload({
					client,
					sender,
					bucket,
					key: `${prefix}${basename(localPath)}`,
					localPath,
				}),
			);
		}
		return { transferIds, rejectedCount };
	}

	return {
		[channels.opsCreateFolder]: async (request) => {
			const client = await getClient(request.connectionId);
			const key = `${request.parent}${request.name}/`;
			return createFolder(client, request.bucket, key);
		},
		[channels.opsDelete]: async (request, { sender }) => {
			const client = await getClient(request.connectionId);
			return deleteKeys(client, request.bucket, request.keys, (done, total) =>
				progress(sender, request.opId, done, total),
			);
		},
		[channels.opsDeletePrefix]: async (request, { sender }) => {
			const client = await getClient(request.connectionId);
			return deletePrefix(
				client,
				request.bucket,
				request.prefix,
				(done, total) => progress(sender, request.opId, done, total),
			);
		},
		[channels.opsCountPrefix]: async (request) => {
			const client = await getClient(request.connectionId);
			return {
				count: await countPrefix(client, request.bucket, request.prefix),
			};
		},
		[channels.opsRename]: async (request) => {
			const client = await getClient(request.connectionId);
			return renameObject(
				client,
				request.bucket,
				request.fromKey,
				request.toKey,
			);
		},
		[channels.opsRenamePrefix]: async (request, { sender }) => {
			const client = await getClient(request.connectionId);
			return renamePrefix(
				client,
				request.bucket,
				request.fromPrefix,
				request.toPrefix,
				(done, total) => progress(sender, request.opId, done, total),
			);
		},
		[channels.transfersUpload]: async (request, { sender }) => {
			const dialog = requireDialog();
			const client = await getClient(request.connectionId);
			const chosen = await dialog.showOpenDialog({
				properties: ["openFile", "multiSelections"],
			});
			if (chosen.canceled || chosen.filePaths.length === 0) {
				return { transferIds: [] };
			}
			const { transferIds } = await startUploads(
				client,
				sender,
				request.bucket,
				request.prefix,
				chosen.filePaths,
			);
			return { transferIds };
		},
		[channels.transfersUploadPaths]: async (request, { sender }) => {
			const client = await getClient(request.connectionId);
			return startUploads(
				client,
				sender,
				request.bucket,
				request.prefix,
				request.paths,
			);
		},
		[channels.transfersDownload]: async (request, { sender }) => {
			const dialog = requireDialog();
			const client = await getClient(request.connectionId);
			const chosen = await dialog.showSaveDialog({
				defaultPath: request.key.split("/").pop() ?? request.key,
			});
			if (chosen.canceled || !chosen.filePath) return { transferId: null };
			const transferId = transfers.startDownload({
				client,
				sender,
				bucket: request.bucket,
				key: request.key,
				destPath: chosen.filePath,
			});
			return { transferId };
		},
		// The request carries no connection, and ownership is the sender.
		[channels.transfersCancel]: async (request, { sender }) => ({
			cancelled: await transfers.cancel(request.transferId, sender),
		}),
	};
}
