import { describe, expect, it, vi } from "vitest";
import { matchesQuery, runSearch, MAX_SEARCH_MATCHES, type SearchMatch } from "../../src/main/s3/search";

describe("matchesQuery", () => {
	it("matches case-insensitively", () => {
		expect(matchesQuery("DOCUMENTS/REPORT.PDF", "", "report")).toBe(true);
		expect(matchesQuery("documents/report.pdf", "", "REPORT")).toBe(true);
		expect(matchesQuery("documents/report.pdf", "", "xyz")).toBe(false);
	});

	it("matches relative to prefix and does not count match only inside prefix", () => {
		// Matches relative part
		expect(matchesQuery("photos/summer/beach.jpg", "photos/summer/", "beach")).toBe(true);
		// Match is only in prefix, not in relative part -> false
		expect(matchesQuery("photos/summer/beach.jpg", "photos/summer/", "summer")).toBe(false);
		expect(matchesQuery("photos/summer/beach.jpg", "photos/summer/", "photo")).toBe(false);
	});

	it("matches whole key if key does not start with prefix", () => {
		expect(matchesQuery("other/file.txt", "photos/", "other")).toBe(true);
	});

	it("handles unicode matching", () => {
		expect(matchesQuery("musique/CAFÉ.MP3", "musique/", "café")).toBe(true);
		expect(matchesQuery("musique/café.mp3", "musique/", "CAFÉ")).toBe(true);
	});

	it("returns false for empty relative key", () => {
		expect(matchesQuery("photos/", "photos/", "photo")).toBe(false);
		expect(matchesQuery("photos/", "photos/", "photos/")).toBe(false);
	});
});

describe("runSearch", () => {
	it("exports MAX_SEARCH_MATCHES as 10,000", () => {
		expect(MAX_SEARCH_MATCHES).toBe(10_000);
	});

	it("handles paging, per-page batches, and running counts", async () => {
		const batches: SearchMatch[][] = [];
		const progressUpdates: { scanned: number; matched: number }[] = [];

		const page1 = {
			Contents: [
				{ Key: "p1/match1.txt", Size: 10 },
				{ Key: "p1/ignore.txt", Size: 20 },
			],
			IsTruncated: true,
			NextContinuationToken: "tok-2",
		};
		const page2 = {
			Contents: [
				{ Key: "p1/match2.txt", Size: 30 },
				{ Key: "p1/match3.txt", Size: 40 },
			],
			IsTruncated: false,
		};

		const sendCalls: any[] = [];
		const client = {
			send: vi.fn(async (command: any, options: any) => {
				sendCalls.push({ command, options });
				if (!command.input.ContinuationToken) return page1;
				return page2;
			}),
		};

		const result = await runSearch(
			client as any,
			{ bucket: "b", prefix: "p1/", query: "match" },
			{
				onBatch: (b) => batches.push(b),
				onProgress: (p) => progressUpdates.push(p),
			},
		);

		expect(result).toEqual({ truncated: false, cancelled: false });
		expect(sendCalls).toHaveLength(2);
		expect(sendCalls[0].command.input.ContinuationToken).toBeUndefined();
		expect(sendCalls[1].command.input.ContinuationToken).toBe("tok-2");

		// Page 1 batch and progress
		expect(batches).toHaveLength(2);
		expect(batches[0]).toEqual([{ key: "p1/match1.txt", size: 10 }]);
		expect(batches[1]).toEqual([
			{ key: "p1/match2.txt", size: 30 },
			{ key: "p1/match3.txt", size: 40 },
		]);

		expect(progressUpdates).toEqual([
			{ scanned: 2, matched: 1 },
			{ scanned: 4, matched: 3 },
		]);
	});

	it("stops and marks truncated: true when matched equals cap and a further match is found", async () => {
		const batches: SearchMatch[][] = [];
		const client = {
			send: vi.fn(async (command: any) => {
				if (!command.input.ContinuationToken) {
					return {
						Contents: [
							{ Key: "test/m1.txt", Size: 1 },
							{ Key: "test/m2.txt", Size: 2 },
						],
						IsTruncated: true,
						NextContinuationToken: "tok-2",
					};
				}
				return {
					Contents: [
						{ Key: "test/m3.txt", Size: 3 }, // 3rd match triggers truncation at cap=2
						{ Key: "test/m4.txt", Size: 4 },
					],
					IsTruncated: false,
				};
			}),
		};

		const result = await runSearch(
			client as any,
			{ bucket: "b", prefix: "test/", query: "m", cap: 2 },
			{
				onBatch: (b) => batches.push(b),
				onProgress: vi.fn(),
			},
		);

		expect(result).toEqual({ truncated: true, cancelled: false });
		// Only 2 matches were emitted across batches
		const totalMatches = batches.flat().length;
		expect(totalMatches).toBe(2);
	});

	it("resolves truncated: false when exactly the cap matches and listing ends", async () => {
		const batches: SearchMatch[][] = [];
		const client = {
			send: vi.fn(async () => ({
				Contents: [
					{ Key: "test/m1.txt", Size: 1 },
					{ Key: "test/m2.txt", Size: 2 },
				],
				IsTruncated: false,
			})),
		};

		const result = await runSearch(
			client as any,
			{ bucket: "b", prefix: "test/", query: "m", cap: 2 },
			{
				onBatch: (b) => batches.push(b),
				onProgress: vi.fn(),
			},
		);

		expect(result).toEqual({ truncated: false, cancelled: false });
		expect(batches.flat()).toHaveLength(2);
	});

	it("passes abort signal to client.send and handles in-flight abort as cancelled: true", async () => {
		const controller = new AbortController();
		const client = {
			send: vi.fn(async (_cmd: any, options: any) => {
				expect(options?.abortSignal).toBe(controller.signal);
				controller.abort();
				const err = new Error("Request aborted");
				err.name = "AbortError";
				throw err;
			}),
		};

		const result = await runSearch(
			client as any,
			{ bucket: "b", prefix: "", query: "q", signal: controller.signal },
			{
				onBatch: vi.fn(),
				onProgress: vi.fn(),
			},
		);

		expect(result).toEqual({ truncated: false, cancelled: true });
	});

	it("emits nothing after signal.aborted is set", async () => {
		const controller = new AbortController();
		const onBatch = vi.fn();
		const onProgress = vi.fn();

		const client = {
			send: vi.fn(async () => {
				controller.abort();
				return {
					Contents: [{ Key: "file.txt", Size: 1 }],
					IsTruncated: false,
				};
			}),
		};

		const result = await runSearch(
			client as any,
			{ bucket: "b", prefix: "", query: "file", signal: controller.signal },
			{ onBatch, onProgress },
		);

		expect(result).toEqual({ truncated: false, cancelled: true });
		expect(onBatch).not.toHaveBeenCalled();
		expect(onProgress).not.toHaveBeenCalled();
	});

	it("rejects with raw error when a non-abort error occurs", async () => {
		const expectedError = new Error("Network boom");
		const client = {
			send: vi.fn(async () => {
				throw expectedError;
			}),
		};

		await expect(
			runSearch(client as any, { bucket: "b", prefix: "", query: "q" }, { onBatch: vi.fn(), onProgress: vi.fn() }),
		).rejects.toThrow(expectedError);
	});
});
