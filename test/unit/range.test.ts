import { describe, expect, it } from "vitest";
import { formatRange, parseRange } from "../../src/main/stream/range";

const maxSafe = Number.MAX_SAFE_INTEGER;
const parseCases = [
	{ header: undefined, expected: null },
	{ header: "items=0-1", expected: null },
	{ header: "BYTES=0-1,2-3", expected: null },
	{ header: "bytes=5-4", expected: null },
	{ header: "bytes=", expected: null },
	{ header: "bytes=-", expected: null },
	{ header: "bytes=a-1", expected: null },
	{ header: "bytes=1-b", expected: null },
	{ header: "bytes=1 -2", expected: null },
	{ header: "bytes=--1", expected: null },
	{ header: "bytes=9007199254740992-", expected: null },
	{ header: "bytes=0-9007199254740992", expected: null },
	{ header: "bytes=-9007199254740992", expected: null },
	{ header: "bytes=0-0", expected: { kind: "bytes", start: 0, end: 0 } },
	{
		header: `bytes=${maxSafe}-${maxSafe}`,
		expected: { kind: "bytes", start: maxSafe, end: maxSafe },
	},
	{
		header: `bytes=${maxSafe}-`,
		expected: { kind: "bytes", start: maxSafe },
	},
	{ header: "bytes=-0", expected: { kind: "suffix", length: 0 } },
	{ header: `bytes=-${maxSafe}`, expected: { kind: "suffix", length: maxSafe } },
	{
		header: " \tbytes=2-7 \n",
		expected: { kind: "bytes", start: 2, end: 7 },
	},
	{ header: "Bytes=3-", expected: { kind: "bytes", start: 3 } },
	{ header: "bytes=12-", expected: { kind: "bytes", start: 12 } },
	{ header: "bytes=-12", expected: { kind: "suffix", length: 12 } },
] as const;

describe("parseRange", () => {
	it.each(parseCases)("parses $header", ({ header, expected }) => {
		expect(parseRange(header)).toEqual(expected);
	});
});

describe("formatRange", () => {
	it.each([
		[{ kind: "bytes", start: 5, end: 9 }, "bytes=5-9"],
		[{ kind: "bytes", start: 5 }, "bytes=5-"],
		[{ kind: "suffix", length: 0 }, "bytes=-0"],
		[{ kind: "suffix", length: 12 }, "bytes=-12"],
	] as const)("formats %j", (spec, expected) => {
		expect(formatRange(spec)).toBe(expected);
	});
});
