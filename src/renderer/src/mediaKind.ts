export type ViewerKind = "video" | "audio" | "image" | "pdf" | "text" | "unsupported";

const videoMimeTypes = new Set([
	"video/mp4",
	"video/x-m4v",
	"video/webm",
	"video/x-matroska",
	"video/mkv",
	"video/ogg",
]);

const audioMimeTypes = new Set([
	"audio/mpeg",
	"audio/mp3",
	"audio/aac",
	"audio/x-aac",
	"audio/aacp",
	"audio/mp4",
	"audio/x-m4a",
	"audio/m4a",
	"audio/flac",
	"audio/x-flac",
	"audio/ogg",
	"application/ogg",
	"audio/opus",
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
	"audio/webm",
]);

const imageMimeTypes = new Set([
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/avif",
	"image/svg+xml",
]);

const videoExtensions = new Set(["mp4", "m4v", "webm", "mkv"]);
const audioExtensions = new Set(["mp3", "aac", "m4a", "flac", "ogg", "oga", "opus", "wav"]);
const imageExtensions = new Set(["jpeg", "jpg", "png", "gif", "webp", "avif", "svg"]);
const textExtensions = new Set([
	"txt",
	"md",
	"markdown",
	"json",
	"xml",
	"yaml",
	"yml",
	"toml",
	"ts",
	"tsx",
	"js",
	"jsx",
	"py",
	"go",
	"rs",
	"java",
	"c",
	"h",
	"cpp",
	"sh",
	"css",
	"html",
	"sql",
	"csv",
	"log",
	"ini",
	"conf",
]);

export function stripContentTypeParameters(contentType: string): string {
	return contentType.split(";")[0]!.trim().toLowerCase();
}

export function isPdfContentType(contentType: string): boolean {
	return stripContentTypeParameters(contentType) === "application/pdf";
}

export function getFileExtension(key: string): string {
	const lastSlash = key.lastIndexOf("/");
	const filename = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
	const lastDot = filename.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === filename.length - 1) {
		return "";
	}
	return filename.slice(lastDot + 1).toLowerCase();
}

function isGenericContentType(cleanType: string): boolean {
	return cleanType === "" || cleanType === "application/octet-stream" || cleanType === "binary/octet-stream";
}

function isTextMimeType(cleanType: string): boolean {
	if (cleanType.startsWith("text/")) {
		return true;
	}
	if (cleanType === "application/json" || cleanType === "application/ld+json" || cleanType.endsWith("+json")) {
		return true;
	}
	if (cleanType === "application/xml" || cleanType.endsWith("+xml")) {
		return true;
	}
	if (cleanType === "application/x-yaml" || cleanType === "application/yaml" || cleanType === "text/yaml") {
		return true;
	}
	if (cleanType === "application/toml" || cleanType === "text/x-toml") {
		return true;
	}
	if (cleanType === "application/javascript" || cleanType === "text/javascript") {
		return true;
	}
	return false;
}

export function isMkv(contentType: string, key: string): boolean {
	const cleanType = stripContentTypeParameters(contentType);
	if (cleanType === "video/x-matroska" || cleanType === "video/mkv") {
		return true;
	}
	if (isGenericContentType(cleanType) && getFileExtension(key) === "mkv") {
		return true;
	}
	return false;
}

export function mediaKind(contentType: string, key: string): ViewerKind {
	const cleanType = stripContentTypeParameters(contentType);
	const ext = getFileExtension(key);

	if (!isGenericContentType(cleanType)) {
		if (isPdfContentType(cleanType)) {
			return "pdf";
		}
		if (videoMimeTypes.has(cleanType)) {
			return "video";
		}
		if (audioMimeTypes.has(cleanType)) {
			return "audio";
		}
		if (imageMimeTypes.has(cleanType)) {
			return "image";
		}
		if (isTextMimeType(cleanType)) {
			return "text";
		}
		return "unsupported";
	}

	// Generic type: fallback to key extension
	if (videoExtensions.has(ext)) {
		return "video";
	}
	if (audioExtensions.has(ext)) {
		return "audio";
	}
	if (imageExtensions.has(ext)) {
		return "image";
	}
	if (textExtensions.has(ext)) {
		return "text";
	}

	return "unsupported";
}
