import { createWriteStream, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface OpenExternalDeps {
	proxyOrigin(): string;
	fetch: typeof fetch;
	tempRoot: string;
	openPath(path: string): Promise<string>;
}

function codedError(code: string, message: string): Error & { code: string } {
	return Object.assign(new Error(message), { code });
}

const blockedExtensions = new Set([
	"desktop",
	"sh",
	"bash",
	"zsh",
	"run",
	"bin",
	"appimage",
	"jar",
	"py",
	"pl",
	"rb",
	"exe",
	"msi",
	"deb",
	"rpm",
	"command",
]);

const activeTempDirs = new Set<string>();

export function cleanupOpenExternal(): void {
	const dirs = Array.from(activeTempDirs);
	activeTempDirs.clear();
	for (const dir of dirs) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
}

export function truncateUtf8(str: string, maxBytes: number): string {
	let currentBytes = 0;
	let result = "";
	for (const char of str) {
		const charBytes = Buffer.byteLength(char, "utf-8");
		if (currentBytes + charBytes > maxBytes) {
			break;
		}
		result += char;
		currentBytes += charBytes;
	}
	return result;
}

export function sanitizeFileName(fileName: string): string {
	const noNul = fileName.replace(/\0/g, "");
	const segments = noNul.split(/[/\\]+/).filter(Boolean);
	const last = segments.length > 0 ? segments[segments.length - 1]! : "";
	const noLeadingDots = last.replace(/^\.+/, "");
	if (!noLeadingDots) {
		return "download";
	}

	const maxBytes = 200;
	if (Buffer.byteLength(noLeadingDots, "utf-8") <= maxBytes) {
		return noLeadingDots;
	}

	const lastDot = noLeadingDots.lastIndexOf(".");
	if (lastDot > 0 && lastDot < noLeadingDots.length - 1) {
		const ext = noLeadingDots.slice(lastDot);
		const extBytes = Buffer.byteLength(ext, "utf-8");
		if (extBytes < maxBytes) {
			const base = noLeadingDots.slice(0, lastDot);
			const truncatedBase = truncateUtf8(base, maxBytes - extBytes);
			if (truncatedBase.length > 0) {
				return truncatedBase + ext;
			}
		}
	}

	const truncated = truncateUtf8(noLeadingDots, maxBytes).replace(/^\.+/, "");
	return truncated.length > 0 ? truncated : "download";
}

export async function openWithSystemApp(
	request: { url: string; fileName: string },
	deps: OpenExternalDeps,
): Promise<{ opened: boolean }> {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(request.url);
	} catch {
		throw codedError("REQUEST_FAILED", "Invalid URL");
	}

	const expectedOrigin = deps.proxyOrigin();
	if (!expectedOrigin || parsedUrl.origin !== expectedOrigin) {
		throw codedError("REQUEST_FAILED", "Origin mismatch");
	}

	const safeName = sanitizeFileName(request.fileName);
	const lastDot = safeName.lastIndexOf(".");
	const ext = lastDot !== -1 ? safeName.slice(lastDot + 1).toLowerCase() : "";
	if (blockedExtensions.has(ext)) {
		throw codedError("REQUEST_FAILED", "This file type cannot be opened");
	}

	const tempDir = await mkdtemp(join(deps.tempRoot, "s3me-open-"));
	activeTempDirs.add(tempDir);
	const targetPath = join(tempDir, safeName);

	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, 30000);

	try {
		let response: Response;
		try {
			response = await deps.fetch(request.url, {
				redirect: "error",
				signal: controller.signal,
			});
		} catch (fetchError) {
			if (controller.signal.aborted) {
				throw codedError("REQUEST_FAILED", "Headers timeout");
			}
			throw fetchError;
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			throw codedError(
				"REQUEST_FAILED",
				`Proxy request failed with status ${response.status}`,
			);
		}

		const body = response.body;
		if (!body) {
			throw codedError("REQUEST_FAILED", "Response body is empty");
		}

		const readable = Readable.fromWeb(
			body as import("node:stream/web").ReadableStream,
		);

		const out = createWriteStream(targetPath);
		await pipeline(readable, out);

		const openResult = await deps.openPath(targetPath);
		if (openResult && openResult.length > 0) {
			throw codedError("REQUEST_FAILED", openResult);
		}

		return { opened: true };
	} catch (error) {
		clearTimeout(timer);
		activeTempDirs.delete(tempDir);
		await rm(targetPath, { force: true }).catch(() => undefined);
		await rm(tempDir, { recursive: true, force: true }).catch(
			() => undefined,
		);
		throw error;
	}
}
