import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Api } from "../shared/ipc";
import { channels, events } from "../shared/channels";

const connections: Api["connections"] = {
	list: (input = {}) => ipcRenderer.invoke(channels.list, input),
	create: (input) => ipcRenderer.invoke(channels.create, input),
	update: (input) => ipcRenderer.invoke(channels.update, input),
	delete: (input) => ipcRenderer.invoke(channels.delete, input),
	testConnection: (input) => ipcRenderer.invoke(channels.testConnection, input),
	ssoLogin: (input) => ipcRenderer.invoke(channels.ssoLogin, input),
	listProfiles: (input = {}) => ipcRenderer.invoke(channels.listProfiles, input),
};

const buckets: Api["buckets"] = {
	list: (input) => ipcRenderer.invoke(channels.bucketsList, input),
	pin: (input) => ipcRenderer.invoke(channels.bucketsPin, input),
	unpin: (input) => ipcRenderer.invoke(channels.bucketsUnpin, input),
	add: (input) => ipcRenderer.invoke(channels.bucketsAdd, input),
	create: (input) => ipcRenderer.invoke(channels.bucketsCreate, input),
	delete: (input) => ipcRenderer.invoke(channels.bucketsDelete, input),
};

const objects: Api["objects"] = {
	list: (input) => ipcRenderer.invoke(channels.objectsList, input),
};

function subscribe<T>(eventChannel: string, listener: (payload: T) => void): () => void {
	const wrapper = (_event: unknown, payload: T) => {
		listener(payload);
	};
	ipcRenderer.on(eventChannel, wrapper);
	return () => {
		ipcRenderer.removeListener(eventChannel, wrapper);
	};
}

const search: Api["search"] = {
	start: (input) => ipcRenderer.invoke(channels.searchStart, input),
	cancel: (input) => ipcRenderer.invoke(channels.searchCancel, input),
	onBatch: (listener) => subscribe(events.searchBatch, listener),
	onProgress: (listener) => subscribe(events.searchProgress, listener),
	onDone: (listener) => subscribe(events.searchDone, listener),
};

const ops: Api["ops"] = {
	createFolder: (input) => ipcRenderer.invoke(channels.opsCreateFolder, input),
	delete: (input) => ipcRenderer.invoke(channels.opsDelete, input),
	deletePrefix: (input) => ipcRenderer.invoke(channels.opsDeletePrefix, input),
	countPrefix: (input) => ipcRenderer.invoke(channels.opsCountPrefix, input),
	rename: (input) => ipcRenderer.invoke(channels.opsRename, input),
	renamePrefix: (input) => ipcRenderer.invoke(channels.opsRenamePrefix, input),
	onProgress: (listener) => subscribe(events.opsProgress, listener),
};

const transfers: Api["transfers"] = {
	upload: (input) => ipcRenderer.invoke(channels.transfersUpload, input),
	uploadPaths: (input) => ipcRenderer.invoke(channels.transfersUploadPaths, input),
	download: (input) => ipcRenderer.invoke(channels.transfersDownload, input),
	cancel: (input) => ipcRenderer.invoke(channels.transfersCancel, input),
	onProgress: (listener) => subscribe(events.transferProgress, listener),
	onDone: (listener) => subscribe(events.transferDone, listener),
	pathsForFiles: (files) =>
		files.map((file) => webUtils.getPathForFile(file as File)).filter((path) => path.length > 0),
};

const stream: Api["stream"] = {
	open: (input) => ipcRenderer.invoke(channels.streamOpen, input),
	openUrl: (input) => ipcRenderer.invoke(channels.streamOpenUrl, input),
};

const files: Api["files"] = {
	openWithSystemApp: (input) => ipcRenderer.invoke(channels.filesOpenWithSystemApp, input),
};

const api: Api = Object.freeze({
	connections: Object.freeze(connections),
	buckets: Object.freeze(buckets),
	objects: Object.freeze(objects),
	search: Object.freeze(search),
	ops: Object.freeze(ops),
	transfers: Object.freeze(transfers),
	stream: Object.freeze(stream),
	files: Object.freeze(files),
});

contextBridge.exposeInMainWorld("api", api);
