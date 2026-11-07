import { BrowserWindow, nativeTheme, shell, type BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";

export const CSP = [
	"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';",
	"img-src 'self' data: http://127.0.0.1:*;",
	"media-src 'self' http://127.0.0.1:*;",
	"connect-src 'self' http://127.0.0.1:*;",
	"frame-src 'self' http://127.0.0.1:*;",
	"object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
].join(" ");

export const TOOLBAR_HEIGHT = 44;

export const PDF_VIEWER_ORIGIN = "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai";

export const SANDBOX_CSP = "sandbox; default-src 'none'";

export interface ResponseCspDetails {
	url?: string;
	resourceType?: string;
	responseHeaders?: Record<string, string[] | string | undefined>;
}

export function buildCsp({ dev, proxyOrigin }: { dev: boolean; proxyOrigin?: string }): string {
	let policy = CSP;
	if (dev) {
		policy = policy
			.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
			.replace(
				"connect-src 'self' http://127.0.0.1:*",
				"connect-src 'self' http://127.0.0.1:* " + "http://localhost:5173 ws://localhost:5173",
			);
	}
	if (proxyOrigin !== undefined) {
		policy = policy.replaceAll("http://127.0.0.1:*", proxyOrigin);
	}
	return policy;
}

export function toExternalHttpsUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && parsed.hostname !== "" ? parsed.href : null;
	} catch {
		return null;
	}
}

export function isPdfViewerUrl(url: string | undefined): boolean {
	if (typeof url !== "string") {
		return false;
	}
	try {
		const parsed = new URL(url);
		return (
			parsed.origin === PDF_VIEWER_ORIGIN ||
			(parsed.protocol === "chrome-extension:" && parsed.host === "mhjfbmdgcfjbbpaeojofohoefgiehjai")
		);
	} catch {
		return false;
	}
}

export function allowFrameNavigation(url: string | undefined, isMainFrame: boolean, proxyOrigin?: string): boolean {
	if (isMainFrame || typeof url !== "string") {
		return false;
	}
	if (isPdfViewerUrl(url)) {
		return true;
	}
	if (!proxyOrigin) {
		return false;
	}
	try {
		return new URL(url).origin === proxyOrigin;
	} catch {
		return false;
	}
}

function findHeaderValue(
	headers: Record<string, string[] | string | undefined> | undefined,
	name: string,
): string | undefined {
	if (!headers) {
		return undefined;
	}
	const target = name.toLowerCase();
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === target) {
			const val = headers[key];
			if (Array.isArray(val)) {
				return val[0];
			}
			if (typeof val === "string") {
				return val;
			}
			return undefined;
		}
	}
	return undefined;
}

export function responseCspFor(
	details: ResponseCspDetails,
	proxyOrigin: string | undefined,
	appPolicy: string,
): string | undefined {
	if (isPdfViewerUrl(details.url)) {
		return undefined;
	}
	let isProxySubframe = false;
	if (proxyOrigin && details.resourceType === "subFrame" && details.url) {
		try {
			isProxySubframe = new URL(details.url).origin === proxyOrigin;
		} catch {
			isProxySubframe = false;
		}
	}
	if (!isProxySubframe) {
		return appPolicy;
	}
	const rawType = findHeaderValue(details.responseHeaders, "content-type");
	const mediaType = rawType ? rawType.split(";")[0]?.trim().toLowerCase() : undefined;
	if (mediaType === "application/pdf") {
		return undefined;
	}
	return SANDBOX_CSP;
}

function getThemeColors(): { backgroundColor: string; symbolColor: string } {
	const isDark = nativeTheme.shouldUseDarkColors;
	return {
		backgroundColor: isDark ? "#1c1c1e" : "#ffffff",
		symbolColor: isDark ? "#f5f5f7" : "#1d1d1f",
	};
}

export function buildWindowOptions(): BrowserWindowConstructorOptions {
	const { backgroundColor, symbolColor } = getThemeColors();
	const options: BrowserWindowConstructorOptions = {
		width: 1200,
		height: 800,
		backgroundColor,
		titleBarStyle: "hidden",
		webPreferences: {
			preload: join(__dirname, "../preload/index.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	};
	if (process.platform !== "darwin") {
		options.titleBarOverlay = {
			color: backgroundColor,
			symbolColor,
			height: TOOLBAR_HEIGHT,
		};
	}
	return options;
}

export function createWindow(options: { proxyOrigin?: string } = {}): BrowserWindow {
	const window = new BrowserWindow(buildWindowOptions());
	const onThemeUpdated = (): void => {
		const { backgroundColor, symbolColor } = getThemeColors();
		window.setBackgroundColor(backgroundColor);
		if (process.platform !== "darwin") {
			window.setTitleBarOverlay({
				color: backgroundColor,
				symbolColor,
				height: TOOLBAR_HEIGHT,
			});
		}
	};
	nativeTheme.on("updated", onThemeUpdated);
	window.on("closed", () => {
		nativeTheme.removeListener("updated", onThemeUpdated);
	});
	window.webContents.on("will-navigate", (event) => event.preventDefault());
	window.webContents.on("will-frame-navigate", (event) => {
		if (!allowFrameNavigation(event.url, event.isMainFrame, options.proxyOrigin)) {
			event.preventDefault();
		}
	});
	window.webContents.on("will-redirect", (event) => event.preventDefault());
	window.webContents.on("will-attach-webview", (event) => event.preventDefault());
	window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
	window.webContents.session.setPermissionCheckHandler(() => false);
	window.webContents.setWindowOpenHandler(({ url }) => {
		const externalUrl = toExternalHttpsUrl(url);
		if (externalUrl) {
			void shell.openExternal(externalUrl).catch(() => undefined);
		}
		return { action: "deny" };
	});
	window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		const appPolicy = buildCsp({
			dev: Boolean(process.env.ELECTRON_RENDERER_URL),
			proxyOrigin: options.proxyOrigin,
		});
		const csp = responseCspFor(details, options.proxyOrigin, appPolicy);
		if (csp === undefined) {
			callback({ responseHeaders: details.responseHeaders });
			return;
		}
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [csp],
			},
		});
	});
	if (process.env.ELECTRON_RENDERER_URL) {
		void window.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void window.loadFile(join(__dirname, "../renderer/index.html"));
	}
	return window;
}
