export type RangeSpec =
	| { kind: "bytes"; start: number; end?: number }
	| { kind: "suffix"; length: number };

export function parseRange(header: string | undefined): RangeSpec | null {
	if (header === undefined) return null;
	const trimmed = header.trim();
	if (trimmed.includes(",")) return null;
	const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
	if (!match) return null;

	const [, startText, endText] = match;
	if (!startText && !endText) return null;
	if (!startText) {
		const length = Number(endText);
		return Number.isSafeInteger(length) ? { kind: "suffix", length } : null;
	}

	const start = Number(startText);
	if (!Number.isSafeInteger(start)) return null;
	if (!endText) return { kind: "bytes", start };
	const end = Number(endText);
	if (!Number.isSafeInteger(end) || start > end) return null;
	return { kind: "bytes", start, end };
}

export function formatRange(spec: RangeSpec): string {
	if (spec.kind === "suffix") return `bytes=-${spec.length}`;
	return `bytes=${spec.start}-${spec.end ?? ""}`;
}
