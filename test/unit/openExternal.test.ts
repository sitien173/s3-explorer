import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register, type IpcMainLike } from "../../src/main/ipc/register";
import { channels } from "../../src/shared/channels";
import {
	cleanupOpenExternal,
	openWithSystemApp,
	sanitizeFileName,
	type OpenExternalDeps,
} from "../../src/main/openExternal";

describe("openExternal", () => {
	let testTempRoot: string;
	const proxyOrigin = "http://127.0.0.1:44444";

	beforeEach(async () => {
		testTempRoot = await mkdtemp(join(tmpdir(), "open-external-test-"));
	});

	afterEach(async () => {
		await rm(testTempRoot, { recursive: true, force: true });
	});

	it("sanitizes filenames correctly", () => {
		expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
		expect(sanitizeFileName("a/b")).toBe("b");
		expect(sanitizeFileName(".hidden")).toBe("hidden");
		expect(sanitizeFileName("")).toBe("download");
		expect(sanitizeFileName("...")).toBe("download");
		expect(sanitizeFileName("\0")).toBe("download");
		expect(sanitizeFileName("a\\b")).toBe("b");
	});

	it("truncates sanitized filenames to 200 UTF-8 bytes and keeps extension", () => {
		const longAscii = `${"a".repeat(250)}.mp4`;
		const sanitizedAscii = sanitizeFileName(longAscii);
		expect(sanitizedAscii.endsWith(".mp4")).toBe(true);
		expect(Buffer.byteLength(sanitizedAscii, "utf-8")).toBeLessThanOrEqual(200);
		expect(Buffer.byteLength(sanitizedAscii, "utf-8")).toBe(200);

		const longUnicode = `${"文".repeat(80)}.pdf`;
		const sanitizedUnicode = sanitizeFileName(longUnicode);
		expect(sanitizedUnicode.endsWith(".pdf")).toBe(true);
		expect(
			Buffer.byteLength(sanitizedUnicode, "utf-8"),
		).toBeLessThanOrEqual(200);
		// Each '文' is 3 bytes; 196 bytes available for base / 3 = 65 chars = 195 bytes + 4 bytes (.pdf) = 199 bytes
		expect(Buffer.byteLength(sanitizedUnicode, "utf-8")).toBe(199);

		const longNoExt = "x".repeat(300);
		const sanitizedNoExt = sanitizeFileName(longNoExt);
		expect(Buffer.byteLength(sanitizedNoExt, "utf-8")).toBe(200);
		expect(sanitizedNoExt).toBe("x".repeat(200));
	});

	it("rejects wrong origin without fetching", async () => {
		const fetchMock = vi.fn();
		const openPathMock = vi.fn();
		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: fetchMock,
			tempRoot: testTempRoot,
			openPath: openPathMock,
		};

		await expect(
			openWithSystemApp(
				{
					url: "http://attacker.example.com/malicious.bin",
					fileName: "test.dat",
				},
				deps,
			),
		).rejects.toMatchObject({
			code: "REQUEST_FAILED",
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(openPathMock).not.toHaveBeenCalled();

		const entries = await readdir(testTempRoot);
		expect(entries).toHaveLength(0);
	});

	it("creates sanitized file for ../../etc/passwd, a/b, .hidden, and empty", async () => {
		const testCases = [
			{ input: "../../etc/passwd", expected: "passwd" },
			{ input: "a/b", expected: "b" },
			{ input: ".hidden", expected: "hidden" },
			{ input: "", expected: "download" },
		];

		for (const { input, expected } of testCases) {
			const openedPaths: string[] = [];
			const deps: OpenExternalDeps = {
				proxyOrigin: () => proxyOrigin,
				fetch: vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					body: Readable.toWeb(
						Readable.from([Buffer.from("sample-data")]),
					),
				}) as unknown as typeof fetch,
				tempRoot: testTempRoot,
				openPath: vi.fn().mockImplementation(async (filePath: string) => {
					openedPaths.push(filePath);
					return "";
				}),
			};

			const result = await openWithSystemApp(
				{
					url: `${proxyOrigin}/o/sample`,
					fileName: input,
				},
				deps,
			);

			expect(result).toEqual({ opened: true });
			expect(openedPaths).toHaveLength(1);
			expect(openedPaths[0]!.endsWith(expected)).toBe(true);
			expect(existsSync(openedPaths[0]!)).toBe(true);
			const content = await readFile(openedPaths[0]!, "utf-8");
			expect(content).toBe("sample-data");
		}
	});

	it("streams response body to file and calls openPath", async () => {
		const chunks = [
			Buffer.from("chunk-1-"),
			Buffer.from("chunk-2-"),
			Buffer.from("chunk-3"),
		];
		let openedFilePath = "";
		const openPathMock = vi
			.fn()
			.mockImplementation(async (filePath: string) => {
				openedFilePath = filePath;
				return "";
			});

		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				body: Readable.toWeb(Readable.from(chunks)),
			}) as unknown as typeof fetch,
			tempRoot: testTempRoot,
			openPath: openPathMock,
		};

		const result = await openWithSystemApp(
			{
				url: `${proxyOrigin}/o/file-handle`,
				fileName: "video.mp4",
			},
			deps,
		);

		expect(result).toEqual({ opened: true });
		expect(deps.fetch).toHaveBeenCalledWith(`${proxyOrigin}/o/file-handle`, {
			redirect: "error",
			signal: expect.any(AbortSignal),
		});
		expect(openPathMock).toHaveBeenCalledWith(openedFilePath);
		const written = await readFile(openedFilePath, "utf-8");
		expect(written).toBe("chunk-1-chunk-2-chunk-3");
	});

	it("rejects non-2xx with status in message, no URL, and leaves no file", async () => {
		const targetUrl = `${proxyOrigin}/o/missing-key`;
		const openPathMock = vi.fn();
		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				body: null,
			}) as unknown as typeof fetch,
			tempRoot: testTempRoot,
			openPath: openPathMock,
		};

		let thrownError: (Error & { code?: string }) | null = null;
		try {
			await openWithSystemApp(
				{ url: targetUrl, fileName: "test.dat" },
				deps,
			);
		} catch (err) {
			thrownError = err as Error & { code?: string };
		}

		expect(thrownError).not.toBeNull();
		expect(thrownError?.code).toBe("REQUEST_FAILED");
		expect(thrownError?.message).toContain("404");
		expect(thrownError?.message).not.toContain(targetUrl);
		expect(openPathMock).not.toHaveBeenCalled();

		const entries = await readdir(testTempRoot);
		expect(entries).toHaveLength(0);
	});

	it("rejects when openPath returns error string and removes file", async () => {
		const openPathMock = vi.fn().mockResolvedValue("Failed to launch viewer");
		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				body: Readable.toWeb(Readable.from([Buffer.from("content")])),
			}) as unknown as typeof fetch,
			tempRoot: testTempRoot,
			openPath: openPathMock,
		};

		let thrownError: (Error & { code?: string }) | null = null;
		try {
			await openWithSystemApp(
				{ url: `${proxyOrigin}/o/sample`, fileName: "doc.pdf" },
				deps,
			);
		} catch (err) {
			thrownError = err as Error & { code?: string };
		}

		expect(thrownError).not.toBeNull();
		expect(thrownError?.code).toBe("REQUEST_FAILED");
		expect(thrownError?.message).toBe("Failed to launch viewer");

		const entries = await readdir(testTempRoot);
		expect(entries).toHaveLength(0);
	});

	it("allows slow body streaming that exceeds 30s once headers resolve", async () => {
		vi.useFakeTimers();
		try {
			let openedPath = "";
			const openPathMock = vi.fn().mockImplementation(async (p: string) => {
				openedPath = p;
				return "";
			});

			let capturedSignal: AbortSignal | undefined;

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(Buffer.from("slow-chunk-1-"));
				},
				async pull(controller) {
					await vi.advanceTimersByTimeAsync(35000);
					if (capturedSignal?.aborted) {
						controller.error(
							new DOMException("aborted", "AbortError"),
						);
						return;
					}
					controller.enqueue(Buffer.from("slow-chunk-2"));
					controller.close();
				},
			});

			const deps: OpenExternalDeps = {
				proxyOrigin: () => proxyOrigin,
				fetch: vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
					capturedSignal = init?.signal ?? undefined;
					return Promise.resolve({
						ok: true,
						status: 200,
						body: stream,
					});
				}) as unknown as typeof fetch,
				tempRoot: testTempRoot,
				openPath: openPathMock,
			};

			const result = await openWithSystemApp(
				{ url: `${proxyOrigin}/o/large-file`, fileName: "large.dat" },
				deps,
			);

			expect(result).toEqual({ opened: true });
			expect(openPathMock).toHaveBeenCalledWith(openedPath);
			const written = await readFile(openedPath, "utf-8");
			expect(written).toBe("slow-chunk-1-slow-chunk-2");
			expect(capturedSignal?.aborted).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("aborts when headers take longer than 30s and leaves no file", async () => {
		vi.useFakeTimers();
		try {
			const openPathMock = vi.fn();
			let abortListener: (() => void) | null = null;
			const fetchMock = vi
				.fn()
				.mockImplementation((_url: string, init?: RequestInit) => {
					return new Promise((_resolve, reject) => {
						if (init?.signal) {
							abortListener = () => {
								const abortErr = new Error("This operation was aborted");
								abortErr.name = "AbortError";
								reject(abortErr);
							};
							init.signal.addEventListener("abort", abortListener);
						}
					});
				});

			const deps: OpenExternalDeps = {
				proxyOrigin: () => proxyOrigin,
				fetch: fetchMock as unknown as typeof fetch,
				tempRoot: testTempRoot,
				openPath: openPathMock,
			};

			const promise = openWithSystemApp(
				{ url: `${proxyOrigin}/o/hung`, fileName: "timeout.dat" },
				deps,
			);

			await vi.waitUntil(() => fetchMock.mock.calls.length > 0);
			await vi.advanceTimersByTimeAsync(31000);

			await expect(promise).rejects.toMatchObject({
				code: "REQUEST_FAILED",
			});
			expect(openPathMock).not.toHaveBeenCalled();

			const entries = await readdir(testTempRoot);
			expect(entries).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("integrates with register and handles IPC channel invocation", async () => {
		const handlers = new Map<
			string,
			(event: unknown, input: unknown) => Promise<unknown>
		>();
		const ipcMain: IpcMainLike = {
			handle: (channel, listener) =>
				handlers.set(
					channel,
					listener as (event: unknown, input: unknown) => Promise<unknown>,
				),
		};

		const openExternalDeps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				body: Readable.toWeb(Readable.from([Buffer.from("file-bytes")])),
			}) as unknown as typeof fetch,
			tempRoot: testTempRoot,
			openPath: vi.fn().mockResolvedValue(""),
		};

		register(ipcMain, {
			store: {
				get: vi.fn(),
				list: vi.fn().mockResolvedValue([]),
				create: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
			} as any,
			clients: {
				get: vi.fn(),
				invalidate: vi.fn(),
				forProfile: vi.fn(),
				listProfiles: vi.fn().mockResolvedValue([]),
			} as any,
			openExternalDeps,
		});

		const handler = handlers.get(channels.filesOpenWithSystemApp);
		expect(handler).toBeDefined();

		const invalidRes = await handler!({ sender: { isDestroyed: () => false } }, {});
		expect(invalidRes).toEqual({
			ok: false,
			error: { code: "INVALID_REQUEST", message: "Invalid request" },
		});

		const successRes = await handler!(
			{ sender: { isDestroyed: () => false } },
			{ url: `${proxyOrigin}/o/file-1`, fileName: "data.txt" },
		);
		expect(successRes).toEqual({
			ok: true,
			data: { opened: true },
		});

		const handlersWithoutDeps = new Map<
			string,
			(event: unknown, input: unknown) => Promise<unknown>
		>();
		const ipcMainWithoutDeps: IpcMainLike = {
			handle: (channel, listener) =>
				handlersWithoutDeps.set(
					channel,
					listener as (event: unknown, input: unknown) => Promise<unknown>,
				),
		};
		register(ipcMainWithoutDeps, {
			store: {
				get: vi.fn(),
				list: vi.fn().mockResolvedValue([]),
				create: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
			} as any,
			clients: {
				get: vi.fn(),
				invalidate: vi.fn(),
				forProfile: vi.fn(),
				listProfiles: vi.fn().mockResolvedValue([]),
			} as any,
		});

		const handlerWithoutDeps = handlersWithoutDeps.get(
			channels.filesOpenWithSystemApp,
		);
		expect(handlerWithoutDeps).toBeDefined();

		const failedRes = await handlerWithoutDeps!(
			{ sender: { isDestroyed: () => false } },
			{ url: `${proxyOrigin}/o/file-1`, fileName: "data.txt" },
		);
		expect(failedRes).toEqual({
			ok: false,
			error: {
				code: "REQUEST_FAILED",
				message: "Open with system app is unavailable",
			},
		});
	});

	it.each([
		"desktop", "sh", "bash", "zsh", "run", "bin", "appimage", "jar",
		"py", "pl", "rb", "exe", "msi", "deb", "rpm", "command",
		"SH", "Py", "EXE",
	])("refuses opening blocked extension .%s", async (ext) => {
		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn(),
			tempRoot: testTempRoot,
			openPath: vi.fn(),
		};
		await expect(
			openWithSystemApp(
				{ url: `${proxyOrigin}/o/file`, fileName: `payload.${ext}` },
				deps,
			),
		).rejects.toMatchObject({
			code: "REQUEST_FAILED",
			message: "This file type cannot be opened",
		});
		expect(deps.fetch).not.toHaveBeenCalled();
		expect(deps.openPath).not.toHaveBeenCalled();
	});

	it("synchronously removes tracked temp directories on cleanup", async () => {
		let openedFilePath = "";
		const deps: OpenExternalDeps = {
			proxyOrigin: () => proxyOrigin,
			fetch: vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				body: Readable.toWeb(Readable.from([Buffer.from("sample")])),
			}) as unknown as typeof fetch,
			tempRoot: testTempRoot,
			openPath: vi.fn().mockImplementation(async (filePath: string) => {
				openedFilePath = filePath;
				return "";
			}),
		};
		await openWithSystemApp(
			{ url: `${proxyOrigin}/o/file-1`, fileName: "document.txt" },
			deps,
		);
		expect(existsSync(openedFilePath)).toBe(true);
		const [tempDir] = await readdir(testTempRoot);
		expect(tempDir).toBeDefined();
		cleanupOpenExternal();
		expect(existsSync(join(testTempRoot, tempDir!))).toBe(false);
		expect(existsSync(openedFilePath)).toBe(false);
	});
});
