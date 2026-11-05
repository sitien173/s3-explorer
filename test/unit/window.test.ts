import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
	const eventHandlers = new Map<
		string,
		(event: {
			preventDefault: ReturnType<typeof vi.fn>;
			url?: string;
			isMainFrame?: boolean;
		}) => void
	>();
	const session = {
		setPermissionRequestHandler: vi.fn(),
		setPermissionCheckHandler: vi.fn(),
		webRequest: { onHeadersReceived: vi.fn() },
	};
	const windowOpen = {
		handler: undefined as
			| ((details: { url: string }) => { action: "deny" })
			| undefined,
	};
	const webContents = {
		on: vi.fn(
			(
				event: string,
				handler: (event: {
					preventDefault: ReturnType<typeof vi.fn>;
					url?: string;
					isMainFrame?: boolean;
				}) => void,
			) => eventHandlers.set(event, handler),
		),
		setWindowOpenHandler: vi.fn(
			(handler: (details: { url: string }) => { action: "deny" }) => {
				windowOpen.handler = handler;
			},
		),
		session,
	};
	const window = { webContents, loadURL: vi.fn(), loadFile: vi.fn() };
	return {
		eventHandlers,
		session,
		windowOpen,
		webContents,
		window,
		BrowserWindow: vi.fn(function BrowserWindowMock() {
			return window;
		}),
		openExternal: vi.fn(() => Promise.resolve()),
	};
});

vi.mock("electron", () => ({
	BrowserWindow: electronMocks.BrowserWindow,
	shell: { openExternal: electronMocks.openExternal },
}));

import {
	allowFrameNavigation,
	buildCsp,
	buildWindowOptions,
	createWindow,
	CSP,
	isPdfViewerUrl,
	PDF_VIEWER_ORIGIN,
	responseCspFor,
	SANDBOX_CSP,
	toExternalHttpsUrl,
} from "../../src/main/window";

describe("secure BrowserWindow defaults", () => {
	it("enables sandbox and context isolation and disables Node integration", () => {
		const webPreferences = buildWindowOptions().webPreferences!;
		expect(webPreferences.sandbox).toBe(true);
		expect(webPreferences.contextIsolation).toBe(true);
		expect(webPreferences.nodeIntegration).toBe(false);
	});

	it("keeps the renderer meta CSP identical to the production CSP", () => {
		const html = readFileSync(
			new URL("../../src/renderer/index.html", import.meta.url),
			"utf8",
		);
		const match = html.match(
			/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/,
		);
		expect(match?.[1]).toBe(CSP);
		expect(CSP).toContain("style-src 'self' 'unsafe-inline'");
		expect(CSP).toContain("script-src 'self'");
		expect(CSP).not.toContain("script-src 'self' 'unsafe-inline'");
	});

	it("keeps development CSP limited to Vite requirements", () => {
		const devCsp = buildCsp({ dev: true });
		expect(devCsp).toContain("style-src 'self' 'unsafe-inline'");
		expect(devCsp).toContain("ws://localhost:5173");
		expect(devCsp).not.toContain("unsafe-eval");
		expect(devCsp).not.toContain("script-src 'self' 'unsafe-inline'");
		expect(buildCsp({ dev: false })).toBe(CSP);
	});

	it("allows the local proxy for images, media, connections, and frames", () => {
		expect(CSP).toContain("img-src 'self' data: http://127.0.0.1:*");
		expect(CSP).toContain("media-src 'self' http://127.0.0.1:*");
		expect(CSP).toContain("connect-src 'self' http://127.0.0.1:*");
		expect(CSP).toContain("frame-src 'self' http://127.0.0.1:*");
	});

	it("replaces proxy wildcards with the exact origin in production CSP", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		const cspOptions = { dev: false, proxyOrigin };
		const policy = buildCsp(cspOptions);
		expect(policy).toContain(proxyOrigin);
		expect(policy).not.toContain("http://127.0.0.1:*");
	});

	it("replaces proxy wildcards while retaining the development sources", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		const cspOptions = { dev: true, proxyOrigin };
		const policy = buildCsp(cspOptions);
		expect(policy).toContain(proxyOrigin);
		expect(policy).not.toContain("http://127.0.0.1:*");
		expect(policy).toContain("ws://localhost:5173");
		expect(policy).toContain("style-src 'self' 'unsafe-inline'");
	});

	it("uses a production-safe default CSP", () => {
		expect(CSP).toContain("default-src 'self'");
		expect(CSP).toContain("script-src 'self'");
		expect(CSP).toContain("style-src 'self' 'unsafe-inline'");
		expect(CSP).not.toContain("unsafe-eval");
	});
});

describe("allowFrameNavigation", () => {
	const proxyOrigin = "http://127.0.0.1:43210";
	const proxyUrl = "http://127.0.0.1:43210/document.pdf";

	it("denies main-frame navigation", () => {
		expect(allowFrameNavigation(proxyUrl, true, proxyOrigin)).toBe(false);
	});

	it("allows proxy subframe navigation", () => {
		expect(allowFrameNavigation(proxyUrl, false, proxyOrigin)).toBe(true);
	});

	it("denies another port", () => {
		expect(
			allowFrameNavigation(
				"http://127.0.0.1:9999/document.pdf",
				false,
				proxyOrigin,
			),
		).toBe(false);
	});

	it("denies about:blank", () => {
		expect(
			allowFrameNavigation("about:blank", false, proxyOrigin),
		).toBe(false);
	});

	it("denies undefined proxyOrigin", () => {
		expect(allowFrameNavigation(proxyUrl, false, undefined)).toBe(false);
	});

	it("denies data, file, and malformed URLs", () => {
		expect(
			allowFrameNavigation("data:text/html,test", false, proxyOrigin),
		).toBe(false);
		expect(
			allowFrameNavigation("file:///etc/passwd", false, proxyOrigin),
		).toBe(false);
		expect(
			allowFrameNavigation("not-a-valid-url", false, proxyOrigin),
		).toBe(false);
		expect(
			allowFrameNavigation(undefined, false, proxyOrigin),
		).toBe(false);
	});

	it("verifies Node URL origin behavior for chrome-extension URLs", () => {
		const parsed = new URL(`${PDF_VIEWER_ORIGIN}/uuid`);
		expect(parsed.origin).toBe("null");
		expect(parsed.protocol).toBe("chrome-extension:");
		expect(parsed.host).toBe("mhjfbmdgcfjbbpaeojofohoefgiehjai");
		expect(isPdfViewerUrl(`${PDF_VIEWER_ORIGIN}/uuid`)).toBe(true);
	});

	it("allows subframe navigation to the PDF viewer", () => {
		expect(
			allowFrameNavigation(
				`${PDF_VIEWER_ORIGIN}/uuid`,
				false,
				proxyOrigin,
			),
		).toBe(true);
		expect(
			allowFrameNavigation(
				`${PDF_VIEWER_ORIGIN}/uuid`,
				false,
				undefined,
			),
		).toBe(true);
	});

	it("denies main-frame navigation to the PDF viewer", () => {
		expect(
			allowFrameNavigation(
				`${PDF_VIEWER_ORIGIN}/uuid`,
				true,
				proxyOrigin,
			),
		).toBe(false);
	});

	it("denies navigation to another chrome-extension id", () => {
		expect(
			allowFrameNavigation(
				"chrome-extension://abcdefghijklmno/uuid",
				false,
				proxyOrigin,
			),
		).toBe(false);
	});
});

describe("responseCspFor", () => {
	const proxyOrigin = "http://127.0.0.1:43210";
	const proxyUrl = "http://127.0.0.1:43210/document.pdf";
	const appPolicy = buildCsp({ dev: false, proxyOrigin });

	it("does not add CSP for PDF subframe", () => {
		const csp = responseCspFor(
			{
				url: proxyUrl,
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["application/pdf"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("treats application/pdf; charset=binary as PDF", () => {
		const csp = responseCspFor(
			{
				url: proxyUrl,
				resourceType: "subFrame",
				responseHeaders: {
					"content-type": ["application/pdf; charset=binary"],
				},
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("sets sandbox policy for text/html subframe", () => {
		const csp = responseCspFor(
			{
				url: "http://127.0.0.1:43210/document.html",
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["text/html"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(SANDBOX_CSP);
		expect(csp).toBe("sandbox; default-src 'none'");
	});

	it("finds Content-Type in mixed case", () => {
		const csp = responseCspFor(
			{
				url: proxyUrl,
				resourceType: "subFrame",
				responseHeaders: { "CoNtEnT-TyPe": ["application/pdf"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("keeps app CSP on a proxy media response", () => {
		const csp = responseCspFor(
			{
				url: "http://127.0.0.1:43210/song.mp3",
				resourceType: "media",
				responseHeaders: { "content-type": ["audio/mpeg"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(appPolicy);
	});

	it("keeps app CSP on the renderer document", () => {
		const csp = responseCspFor(
			{
				url: "http://localhost:5173/index.html",
				resourceType: "mainFrame",
				responseHeaders: { "content-type": ["text/html"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(appPolicy);
	});

	it("sets sandbox policy when proxy subframe has no Content-Type", () => {
		const csp = responseCspFor(
			{
				url: proxyUrl,
				resourceType: "subFrame",
				responseHeaders: {},
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(SANDBOX_CSP);
	});

	it("keeps app CSP when proxyOrigin is undefined", () => {
		const csp = responseCspFor(
			{
				url: proxyUrl,
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["application/pdf"] },
			},
			undefined,
			appPolicy,
		);
		expect(csp).toBe(appPolicy);
	});

	it("keeps app CSP when subframe origin does not match proxyOrigin", () => {
		const csp = responseCspFor(
			{
				url: "http://127.0.0.1:9999/document.pdf",
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["application/pdf"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(appPolicy);
	});

	it("returns undefined CSP for PDF viewer subFrame responses", () => {
		const csp = responseCspFor(
			{
				url: `${PDF_VIEWER_ORIGIN}/index.html`,
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["text/html"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("returns undefined CSP for PDF viewer script responses", () => {
		const csp = responseCspFor(
			{
				url: `${PDF_VIEWER_ORIGIN}/viewer.js`,
				resourceType: "script",
				responseHeaders: {
					"content-type": ["application/javascript"],
				},
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("returns undefined CSP for PDF viewer stylesheet responses", () => {
		const csp = responseCspFor(
			{
				url: `${PDF_VIEWER_ORIGIN}/viewer.css`,
				resourceType: "stylesheet",
				responseHeaders: { "content-type": ["text/css"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBeUndefined();
	});

	it("applies app CSP to another chrome-extension id", () => {
		const csp = responseCspFor(
			{
				url: "chrome-extension://abcdefghijklmno/index.html",
				resourceType: "subFrame",
				responseHeaders: { "content-type": ["text/html"] },
			},
			proxyOrigin,
			appPolicy,
		);
		expect(csp).toBe(appPolicy);
	});
});

describe("window runtime security controls", () => {
	let previousRendererUrl: string | undefined;

	beforeEach(() => {
		previousRendererUrl = process.env.ELECTRON_RENDERER_URL;
		delete process.env.ELECTRON_RENDERER_URL;
		electronMocks.eventHandlers.clear();
		electronMocks.windowOpen.handler = undefined;
		vi.clearAllMocks();
		electronMocks.openExternal.mockResolvedValue(undefined);
	});

	afterEach(() => {
		if (previousRendererUrl === undefined) {
			delete process.env.ELECTRON_RENDERER_URL;
		} else {
			process.env.ELECTRON_RENDERER_URL = previousRendererUrl;
		}
	});

	it("blocks navigation, redirects, and webview attachment", () => {
		createWindow();
		const events = [
			"will-navigate",
			"will-frame-navigate",
			"will-redirect",
			"will-attach-webview",
		];
		for (const eventName of events) {
			const preventDefault = vi.fn();
			electronMocks.eventHandlers.get(eventName)?.({ preventDefault });
			expect(
				preventDefault,
				`${eventName} should be blocked`,
			).toHaveBeenCalledOnce();
		}
	});

	it("allows proxy subframe frame navigation and blocks other navigations", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		createWindow({ proxyOrigin });
		const handler = electronMocks.eventHandlers.get("will-frame-navigate");
		expect(handler).toBeDefined();

		const allowedPreventDefault = vi.fn();
		handler?.({
			preventDefault: allowedPreventDefault,
			url: `${proxyOrigin}/doc.pdf`,
			isMainFrame: false,
		});
		expect(allowedPreventDefault).not.toHaveBeenCalled();

		const mainFramePreventDefault = vi.fn();
		handler?.({
			preventDefault: mainFramePreventDefault,
			url: `${proxyOrigin}/doc.pdf`,
			isMainFrame: true,
		});
		expect(mainFramePreventDefault).toHaveBeenCalledOnce();

		const otherPortPreventDefault = vi.fn();
		handler?.({
			preventDefault: otherPortPreventDefault,
			url: "http://127.0.0.1:9999/doc.pdf",
			isMainFrame: false,
		});
		expect(otherPortPreventDefault).toHaveBeenCalledOnce();

		const aboutBlankPreventDefault = vi.fn();
		handler?.({
			preventDefault: aboutBlankPreventDefault,
			url: "about:blank",
			isMainFrame: false,
		});
		expect(aboutBlankPreventDefault).toHaveBeenCalledOnce();

		const viewerSubframePreventDefault = vi.fn();
		handler?.({
			preventDefault: viewerSubframePreventDefault,
			url: `${PDF_VIEWER_ORIGIN}/uuid`,
			isMainFrame: false,
		});
		expect(viewerSubframePreventDefault).not.toHaveBeenCalled();

		const viewerMainFramePreventDefault = vi.fn();
		handler?.({
			preventDefault: viewerMainFramePreventDefault,
			url: `${PDF_VIEWER_ORIGIN}/uuid`,
			isMainFrame: true,
		});
		expect(viewerMainFramePreventDefault).toHaveBeenCalledOnce();
	});

	it("passes PDF subframe response headers through without app CSP", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		createWindow({ proxyOrigin });
		const onHeaders =
			electronMocks.session.webRequest.onHeadersReceived.mock.calls[0]?.[0];
		const callback = vi.fn();
		const originalHeaders = {
			"content-type": ["application/pdf"],
			"x-custom": ["preserved"],
		};
		onHeaders?.(
			{
				url: `${proxyOrigin}/doc.pdf`,
				resourceType: "subFrame",
				responseHeaders: originalHeaders,
			},
			callback,
		);
		expect(callback).toHaveBeenCalledWith({
			responseHeaders: originalHeaders,
		});
		expect(
			callback.mock.calls[0]?.[0].responseHeaders[
				"Content-Security-Policy"
			],
		).toBeUndefined();
	});

	it("applies sandbox CSP to non-PDF subframe responses", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		createWindow({ proxyOrigin });
		const onHeaders =
			electronMocks.session.webRequest.onHeadersReceived.mock.calls[0]?.[0];
		const callback = vi.fn();
		onHeaders?.(
			{
				url: `${proxyOrigin}/page.html`,
				resourceType: "subFrame",
				responseHeaders: {
					"content-type": ["text/html"],
				},
			},
			callback,
		);
		expect(
			callback.mock.calls[0]?.[0].responseHeaders[
				"Content-Security-Policy"
			],
		).toEqual([SANDBOX_CSP]);
	});

	it("passes PDF viewer responses through without app CSP", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		createWindow({ proxyOrigin });
		const onHeaders =
			electronMocks.session.webRequest.onHeadersReceived.mock.calls[0]?.[0];
		const callback = vi.fn();
		const viewerHeaders = {
			"content-type": ["application/javascript"],
			"x-extension": ["viewer"],
		};
		onHeaders?.(
			{
				url: `${PDF_VIEWER_ORIGIN}/viewer.js`,
				resourceType: "script",
				responseHeaders: viewerHeaders,
			},
			callback,
		);
		expect(callback).toHaveBeenCalledWith({
			responseHeaders: viewerHeaders,
		});
		expect(
			callback.mock.calls[0]?.[0].responseHeaders[
				"Content-Security-Policy"
			],
		).toBeUndefined();
	});

	it("denies every new window and opens normalized HTTPS URLs only", () => {
		createWindow();
		const handler = electronMocks.windowOpen.handler!;
		const allowed = [
			["https://example.com/a?b=1", "https://example.com/a?b=1"],
			["HTTPS://Example.com/a", "https://example.com/a"],
		];
		for (const [url, normalized] of allowed) {
			expect(handler({ url })).toEqual({ action: "deny" });
			expect(electronMocks.openExternal).toHaveBeenLastCalledWith(
				normalized,
			);
		}
		const rejected = [
			"http://example.com",
			"file:///etc/passwd",
			"javascript:alert(1)",
			"data:text/html,x",
			"ftp://example.com",
			"not a url",
			"https://",
			"",
		];
		for (const url of rejected) {
			expect(handler({ url })).toEqual({ action: "deny" });
		}
		expect(electronMocks.openExternal).toHaveBeenCalledTimes(2);
	});

	it.each([
		["https://example.com/a?b=1", "https://example.com/a?b=1"],
		["HTTPS://Example.com/a", "https://example.com/a"],
		["http://example.com", null],
		["file:///etc/passwd", null],
		["javascript:alert(1)", null],
		["data:text/html,x", null],
		["ftp://example.com", null],
		["not a url", null],
		["https://", null],
		["", null],
	])("normalizes external URL %j", (url, expected) => {
		expect(toExternalHttpsUrl(url)).toBe(expected);
	});

	it("handles a rejected external-open promise without an unhandled rejection", async () => {
		createWindow();
		electronMocks.openExternal.mockRejectedValueOnce(
			new Error("external handler failed"),
		);
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			electronMocks.windowOpen.handler!({
				url: "https://example.com/a",
			});
			await new Promise((resolve) => setImmediate(resolve));
			expect(electronMocks.openExternal).toHaveBeenCalledWith(
				"https://example.com/a",
			);
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});

	it("denies all permission requests and checks", () => {
		createWindow();
		const requestHandler =
			electronMocks.session.setPermissionRequestHandler.mock.calls[0]?.[0];
		const callback = vi.fn();
		requestHandler?.({}, "fullscreen", callback);
		expect(callback).toHaveBeenCalledWith(false);
		const checkHandler =
			electronMocks.session.setPermissionCheckHandler.mock.calls[0]?.[0];
		expect(checkHandler?.({}, "fullscreen")).toBe(false);
	});

	it.each([false, true])(
		"sets %s CSP in response headers when dev URL presence is %s",
		(dev) => {
			if (dev) {
				process.env.ELECTRON_RENDERER_URL = "http://localhost:5173";
			}
			createWindow();
			const onHeaders =
				electronMocks.session.webRequest.onHeadersReceived.mock.calls[0]?.[0];
			const callback = vi.fn();
			onHeaders?.(
				{ responseHeaders: { "X-Test": ["preserved"] } },
				callback,
			);
			expect(
				callback.mock.calls[0]?.[0].responseHeaders[
					"Content-Security-Policy"
				],
			).toEqual([buildCsp({ dev })]);
		},
	);

	it("sets an exact proxy origin in the enforced response header", () => {
		const proxyOrigin = "http://127.0.0.1:43210";
		const createWindowWithOptions = createWindow as (options?: {
			proxyOrigin?: string;
		}) => unknown;
		createWindowWithOptions({ proxyOrigin });
		const onHeaders =
			electronMocks.session.webRequest.onHeadersReceived.mock.calls[0]?.[0];
		const callback = vi.fn();
		onHeaders?.({ responseHeaders: {} }, callback);
		const policy =
			callback.mock.calls[0]?.[0].responseHeaders[
				"Content-Security-Policy"
			]?.[0];
		expect(policy).toContain(proxyOrigin);
		expect(policy).not.toContain("http://127.0.0.1:*");
	});
});
