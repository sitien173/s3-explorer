import { describe, expect, it, vi } from "vitest";

interface TextReaderModule {
	MAX_TEXT_PREVIEW_BYTES: number;
	readBoundedStream(body: ReadableStream<Uint8Array> | null, maxBytes?: number): Promise<Uint8Array>;
	trimIncompleteTrailingUtf8(bytes: Uint8Array): Uint8Array;
	decodeUtf8Bounded(bytes: Uint8Array): string;
}

const modulePath = "../../src/renderer/src/textReader";
const { MAX_TEXT_PREVIEW_BYTES, readBoundedStream, trimIncompleteTrailingUtf8, decodeUtf8Bounded } = (await import(
	modulePath
)) as TextReaderModule;

function createMockStream(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
	let index = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index < chunks.length) {
				controller.enqueue(chunks[index]!);
				index += 1;
			} else {
				controller.close();
			}
		},
		cancel() {
			if (onCancel) {
				onCancel();
			}
		},
	});
}

describe("readBoundedStream", () => {
	it("returns empty buffer when stream is null", async () => {
		const result = await readBoundedStream(null);
		expect(result).toHaveLength(0);
	});

	it("returns empty buffer when stream is empty", async () => {
		const stream = createMockStream([]);
		const result = await readBoundedStream(stream);
		expect(result).toHaveLength(0);
	});

	it("reads entire stream when smaller than maxBytes", async () => {
		const chunk1 = new TextEncoder().encode("hello ");
		const chunk2 = new TextEncoder().encode("world");
		const stream = createMockStream([chunk1, chunk2]);
		const result = await readBoundedStream(stream, 100);
		expect(new TextDecoder().decode(result)).toBe("hello world");
		expect(result).toHaveLength(11);
	});

	it("caps stream exactly at maxBytes and cancels remaining data", async () => {
		const cancelSpy = vi.fn();
		const chunk1 = new Uint8Array([1, 2, 3, 4, 5]);
		const chunk2 = new Uint8Array([6, 7, 8, 9, 10]);
		const chunk3 = new Uint8Array([11, 12, 13, 14, 15]);
		const stream = createMockStream([chunk1, chunk2, chunk3], cancelSpy);

		const result = await readBoundedStream(stream, 8);
		expect(result).toHaveLength(8);
		expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(cancelSpy).toHaveBeenCalledTimes(1);
	});

	it("handles chunk exactly hitting maxBytes", async () => {
		const cancelSpy = vi.fn();
		const chunk1 = new Uint8Array([1, 2, 3, 4]);
		const chunk2 = new Uint8Array([5, 6, 7, 8]);
		const chunk3 = new Uint8Array([9, 10]);
		const stream = createMockStream([chunk1, chunk2, chunk3], cancelSpy);

		const result = await readBoundedStream(stream, 8);
		expect(result).toHaveLength(8);
		expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(cancelSpy).toHaveBeenCalledTimes(1);
	});

	it("defaults to MAX_TEXT_PREVIEW_BYTES of 2097152", async () => {
		expect(MAX_TEXT_PREVIEW_BYTES).toBe(2097152);
		const smallChunk = new Uint8Array([42]);
		const stream = createMockStream([smallChunk]);
		const result = await readBoundedStream(stream);
		expect(result).toHaveLength(1);
		expect(result[0]).toBe(42);
	});

	it("trims incomplete trailing multibyte UTF-8 sequence at cap", async () => {
		const full = new TextEncoder().encode("hello世");
		const stream = createMockStream([full]);
		const result = await readBoundedStream(stream, 7);
		expect(new TextDecoder().decode(result)).toBe("hello");
		expect(result).toHaveLength(5);
	});
});

describe("decodeUtf8Bounded and trimIncompleteTrailingUtf8", () => {
	it("returns empty string for empty input", () => {
		expect(decodeUtf8Bounded(new Uint8Array(0))).toBe("");
	});

	it("decodes complete UTF-8 sequences cleanly", () => {
		const bytes = new TextEncoder().encode("Hello 世界 🚀");
		expect(decodeUtf8Bounded(bytes)).toBe("Hello 世界 🚀");
	});

	it("drops cut 2-byte UTF-8 character and does not produce U+FFFD", () => {
		const full = new TextEncoder().encode("cafeé");
		const cut = full.subarray(0, full.length - 1);
		const decoded = decodeUtf8Bounded(cut);
		expect(decoded).toBe("cafe");
		expect(decoded.includes("\uFFFD")).toBe(false);
	});

	it("drops cut 3-byte UTF-8 character and does not produce U+FFFD", () => {
		const full = new TextEncoder().encode("hello世");
		const cut1 = full.subarray(0, full.length - 2);
		const cut2 = full.subarray(0, full.length - 1);

		const decoded1 = decodeUtf8Bounded(cut1);
		expect(decoded1).toBe("hello");
		expect(decoded1.includes("\uFFFD")).toBe(false);

		const decoded2 = decodeUtf8Bounded(cut2);
		expect(decoded2).toBe("hello");
		expect(decoded2.includes("\uFFFD")).toBe(false);
	});

	it("drops cut 4-byte UTF-8 character and does not produce U+FFFD", () => {
		const full = new TextEncoder().encode("rocket 🚀");
		for (let i = 1; i <= 3; i++) {
			const cut = full.subarray(0, full.length - i);
			const decoded = decodeUtf8Bounded(cut);
			expect(decoded).toBe("rocket ");
			expect(decoded.includes("\uFFFD")).toBe(false);
		}
	});

	it("trims incomplete trailing sequences properly with trimIncompleteTrailingUtf8", () => {
		const full = new TextEncoder().encode("test世");
		const trimmed = trimIncompleteTrailingUtf8(full.subarray(0, 5));
		expect(new TextDecoder().decode(trimmed)).toBe("test");
	});
});
