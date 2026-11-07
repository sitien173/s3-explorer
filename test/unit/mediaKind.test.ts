import { describe, expect, it } from "vitest";

type ViewerKind = "video" | "audio" | "image" | "pdf" | "text" | "unsupported";

interface MediaKindModule {
	isMkv(contentType: string, key: string): boolean;
	isPdfContentType(contentType: string): boolean;
	mediaKind(contentType: string, key: string): ViewerKind;
}

const modulePath = "../../src/renderer/src/mediaKind";
const { isMkv, isPdfContentType, mediaKind } = (await import(modulePath)) as MediaKindModule;

describe("mediaKind", () => {
	describe("isPdfContentType", () => {
		it("identifies application/pdf ignoring case and parameters", () => {
			expect(isPdfContentType("application/pdf")).toBe(true);
			expect(isPdfContentType("APPLICATION/PDF")).toBe(true);
			expect(isPdfContentType("application/pdf; charset=utf-8")).toBe(true);
			expect(isPdfContentType("text/html")).toBe(false);
			expect(isPdfContentType("application/octet-stream")).toBe(false);
		});
	});

	describe("isMkv", () => {
		it("identifies mkv by specific content type or fallback extension", () => {
			expect(isMkv("video/x-matroska", "film.bin")).toBe(true);
			expect(isMkv("video/mkv", "film.bin")).toBe(true);
			expect(isMkv("application/octet-stream", "film.mkv")).toBe(true);
			expect(isMkv("", "film.mkv")).toBe(true);
			expect(isMkv("video/mp4", "film.mkv")).toBe(false);
			expect(isMkv("video/mp4", "film.mp4")).toBe(false);
		});
	});

	describe("video formats", () => {
		it("identifies mp4, m4v, webm, mkv, and ogg via specific MIME type", () => {
			expect(mediaKind("video/mp4", "movie.bin")).toBe("video");
			expect(mediaKind("video/x-m4v", "movie.bin")).toBe("video");
			expect(mediaKind("video/webm", "movie.bin")).toBe("video");
			expect(mediaKind("video/x-matroska", "movie.bin")).toBe("video");
			expect(mediaKind("video/mkv", "movie.bin")).toBe("video");
			expect(mediaKind("video/ogg", "movie.bin")).toBe("video");
		});

		it("identifies mp4, m4v, webm, and mkv via extension fallback", () => {
			expect(mediaKind("application/octet-stream", "movie.mp4")).toBe("video");
			expect(mediaKind("application/octet-stream", "movie.m4v")).toBe("video");
			expect(mediaKind("application/octet-stream", "movie.webm")).toBe("video");
			expect(mediaKind("application/octet-stream", "movie.mkv")).toBe("video");
		});

		it("identifies mov only if video/mp4-compatible type", () => {
			expect(mediaKind("video/mp4", "movie.mov")).toBe("video");
			expect(mediaKind("application/octet-stream", "movie.mov")).toBe("unsupported");
			expect(mediaKind("video/quicktime", "movie.mov")).toBe("unsupported");
		});
	});

	describe("audio formats", () => {
		const formats = [
			{ ext: "mp3", type: "audio/mpeg" },
			{ ext: "aac", type: "audio/aac" },
			{ ext: "aac", type: "audio/x-aac" },
			{ ext: "aac", type: "audio/aacp" },
			{ ext: "m4a", type: "audio/mp4" },
			{ ext: "m4a", type: "audio/x-m4a" },
			{ ext: "flac", type: "audio/flac" },
			{ ext: "flac", type: "audio/x-flac" },
			{ ext: "ogg", type: "audio/ogg" },
			{ ext: "ogg", type: "application/ogg" },
			{ ext: "oga", type: "audio/ogg" },
			{ ext: "opus", type: "audio/opus" },
			{ ext: "wav", type: "audio/wav" },
			{ ext: "wav", type: "audio/x-wav" },
		];

		for (const { ext, type } of formats) {
			it(`identifies ${ext} by MIME type ${type}`, () => {
				expect(mediaKind(type, `track.${ext}`)).toBe("audio");
			});

			it(`identifies ${ext} by extension with octet-stream`, () => {
				expect(mediaKind("application/octet-stream", `track.${ext}`)).toBe("audio");
			});
		}
	});

	describe("image formats", () => {
		const formats = [
			{ ext: "jpeg", type: "image/jpeg" },
			{ ext: "png", type: "image/png" },
			{ ext: "gif", type: "image/gif" },
			{ ext: "webp", type: "image/webp" },
			{ ext: "avif", type: "image/avif" },
			{ ext: "svg", type: "image/svg+xml" },
		];

		for (const { ext, type } of formats) {
			it(`identifies ${ext} by MIME type ${type}`, () => {
				expect(mediaKind(type, `img.${ext}`)).toBe("image");
			});

			it(`identifies ${ext} by extension with octet-stream`, () => {
				expect(mediaKind("application/octet-stream", `img.${ext}`)).toBe("image");
			});
		}
	});

	describe("pdf format", () => {
		it("identifies pdf for application/pdf", () => {
			expect(mediaKind("application/pdf", "doc.bin")).toBe("pdf");
			expect(mediaKind("application/pdf", "doc.pdf")).toBe("pdf");
		});

		it("returns unsupported for pdf extension with generic content type", () => {
			expect(mediaKind("application/octet-stream", "doc.pdf")).toBe("unsupported");
			expect(mediaKind("binary/octet-stream", "doc.pdf")).toBe("unsupported");
			expect(mediaKind("", "doc.pdf")).toBe("unsupported");
		});

		it("must be text for pdf-extension-with-html-type case", () => {
			expect(mediaKind("text/html", "doc.pdf")).toBe("text");
		});

		it("rejects pdf extension when non-pdf specific type is provided", () => {
			expect(mediaKind("image/png", "doc.pdf")).toBe("image");
			expect(mediaKind("application/zip", "doc.pdf")).toBe("unsupported");
		});
	});

	describe("text formats", () => {
		const textTypes = [
			"text/plain",
			"text/html",
			"text/css",
			"text/csv",
			"text/markdown",
			"text/xml",
			"application/json",
			"application/xml",
			"application/x-yaml",
			"application/toml",
			"application/javascript",
		];

		for (const type of textTypes) {
			it(`identifies text by MIME type ${type}`, () => {
				expect(mediaKind(type, "sample.bin")).toBe("text");
			});
		}

		const textExtensions = [
			"ts",
			"tsx",
			"js",
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
			"json",
			"xml",
			"yaml",
			"toml",
			"md",
			"txt",
		];

		for (const ext of textExtensions) {
			it(`identifies ${ext} by extension with octet-stream fallback`, () => {
				expect(mediaKind("application/octet-stream", `code.${ext}`)).toBe("text");
				expect(mediaKind("binary/octet-stream", `code.${ext}`)).toBe("text");
				expect(mediaKind("", `code.${ext}`)).toBe("text");
			});
		}
	});

	describe("unsupported and edge cases", () => {
		it("returns unsupported for unknown binary files", () => {
			expect(mediaKind("application/octet-stream", "archive.bin")).toBe("unsupported");
			expect(mediaKind("application/octet-stream", "app.exe")).toBe("unsupported");
			expect(mediaKind("application/x-custom", "file.xyz")).toBe("unsupported");
			expect(mediaKind("", "unknownfile")).toBe("unsupported");
		});
	});
});
