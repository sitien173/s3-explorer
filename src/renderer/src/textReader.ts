export const MAX_TEXT_PREVIEW_BYTES = 2097152;

export async function readBoundedStream(
	body: ReadableStream<Uint8Array> | null,
	maxBytes: number = MAX_TEXT_PREVIEW_BYTES,
): Promise<Uint8Array> {
	if (!body) {
		return new Uint8Array(0);
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (totalBytes < maxBytes) {
			const { done, value } = await reader.read();
			if (done || !value) {
				break;
			}
			const remaining = maxBytes - totalBytes;
			if (value.byteLength >= remaining) {
				chunks.push(value.subarray(0, remaining));
				totalBytes += remaining;
				try {
					await reader.cancel();
				} catch {
					// Ignore cancellation error
				}
				break;
			}
			chunks.push(value);
			totalBytes += value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}

	const combined = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return trimIncompleteTrailingUtf8(combined);
}

export function trimIncompleteTrailingUtf8(bytes: Uint8Array): Uint8Array {
	const len = bytes.length;
	if (len === 0) {
		return bytes;
	}

	for (let i = 1; i <= Math.min(4, len); i++) {
		const byte = bytes[len - i]!;
		if ((byte & 0x80) === 0) {
			return bytes;
		}
		if ((byte & 0xe0) === 0xc0) {
			return i < 2 ? bytes.subarray(0, len - i) : bytes;
		}
		if ((byte & 0xf0) === 0xe0) {
			return i < 3 ? bytes.subarray(0, len - i) : bytes;
		}
		if ((byte & 0xf8) === 0xf0) {
			return i < 4 ? bytes.subarray(0, len - i) : bytes;
		}
	}

	return bytes;
}

export function decodeUtf8Bounded(bytes: Uint8Array): string {
	const trimmed = trimIncompleteTrailingUtf8(bytes);
	return new TextDecoder("utf-8", { fatal: false }).decode(trimmed);
}
