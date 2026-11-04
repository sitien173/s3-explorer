import { app, BrowserWindow, dialog, safeStorage, ipcMain, shell } from "electron";
import { SecretVault } from "./connections/secrets";
import { ConnectionStore } from "./connections/store";
import { S3ClientFactory } from "./s3/client";
import { HandleRegistry } from "./stream/handles";
import { createStreamProxy } from "./stream/proxy";
import { cleanupOpenExternal } from "./openExternal";
import { register } from "./ipc/register";
import { createWindow } from "./window";

void app.whenReady().then(async () => {
	try {
		const directory = app.getPath("userData");
		const vault = new SecretVault(directory, safeStorage);
		const store = new ConnectionStore(directory, vault);
		const clients = new S3ClientFactory(store, vault);
		const registry = new HandleRegistry();
		const rendererUrl = process.env.ELECTRON_RENDERER_URL;
		const appOrigin = rendererUrl ? new URL(rendererUrl).origin : "null";
		const proxy = createStreamProxy({
			registry,
			store,
			clients,
			appOrigin,
		});
		const { origin } = await proxy.start();

		register(ipcMain, {
			store,
			clients,
			dialog,
			stream: { registry, proxy },
			openExternalDeps: {
				proxyOrigin: () => origin,
				fetch,
				tempRoot: app.getPath("temp"),
				openPath: (path: string) => shell.openPath(path),
			},
		});
		const window = createWindow({ proxyOrigin: origin });
		if (process.argv.includes("--smoke")) {
			window.webContents.once("did-finish-load", () => app.exit(0));
		}
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow({ proxyOrigin: origin });
			}
		});
		app.on("before-quit", () => {
			void proxy.stop();
			cleanupOpenExternal();
		});
	} catch {
		dialog.showErrorBox(
			"S3 Media Explorer",
			"S3 Media Explorer could not start.",
		);
		app.quit();
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
