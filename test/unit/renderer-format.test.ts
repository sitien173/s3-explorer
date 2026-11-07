import { describe, expect, it } from "vitest";
import {
	applyPageResponse,
	buildCreateRequest,
	buildUpdateRequest,
	filterByName,
	filterBrowserRows,
	formatBytes,
	isStaleResponse,
	mergeFoldersAndObjects,
	parseBreadcrumbs,
	resetNavigationLoading,
	shouldAutoPage,
	shouldResetInFlight,
	sortBuckets,
	type BrowserRow,
	type BucketItem,
	type ConnectionFormState,
	type PageResponse,
	type PageState,
	type S3Item,
} from "../../src/renderer/src/format";

describe("renderer format pure helpers", () => {
	describe("sortBuckets", () => {
		it("places pinned buckets before unpinned buckets", () => {
			const input: BucketItem[] = [
				{ name: "zebra", pinned: false, listed: true },
				{ name: "apple", pinned: true, listed: true },
				{ name: "banana", pinned: false, listed: true },
				{ name: "orange", pinned: true, listed: true },
			];
			const sorted = sortBuckets(input);
			expect(sorted.map((b) => b.name)).toEqual(["apple", "orange", "zebra", "banana"]);
		});

		it("returns empty array for empty input", () => {
			expect(sortBuckets([])).toEqual([]);
		});
	});

	describe("buildCreateRequest", () => {
		it("builds a profile CreateRequest and omits empty optional fields", () => {
			const form: ConnectionFormState = {
				name: "Dev Profile",
				kind: "profile",
				profile: "default",
				region: "  ",
				endpoint: "",
				forcePathStyle: false,
			};
			const req = buildCreateRequest(form);
			expect(req).toEqual({
				name: "Dev Profile",
				kind: "profile",
				profile: "default",
				forcePathStyle: false,
			});
		});

		it("builds a manual CreateRequest with required fields", () => {
			const form: ConnectionFormState = {
				name: "MinIO Local",
				kind: "manual",
				region: "us-east-1",
				endpoint: "http://127.0.0.1:9000",
				forcePathStyle: true,
				accessKeyId: "minioadmin",
				secretAccessKey: "minioadmin",
				sessionToken: "",
			};
			const req = buildCreateRequest(form);
			expect(req).toEqual({
				name: "MinIO Local",
				kind: "manual",
				region: "us-east-1",
				endpoint: "http://127.0.0.1:9000",
				forcePathStyle: true,
				accessKeyId: "minioadmin",
				secretAccessKey: "minioadmin",
			});
		});
	});

	describe("buildUpdateRequest", () => {
		it("omits secretAccessKey when secret is empty or whitespace", () => {
			const form: ConnectionFormState = {
				name: "Updated MinIO",
				kind: "manual",
				region: "us-west-2",
				endpoint: "http://127.0.0.1:9000",
				forcePathStyle: true,
				accessKeyId: "new-key",
				secretAccessKey: "   ",
				sessionToken: "",
			};
			const req = buildUpdateRequest("conn-1", form);
			expect(req.secretAccessKey).toBeUndefined();
			expect(req.id).toBe("conn-1");
			expect(req.name).toBe("Updated MinIO");
			expect(req.accessKeyId).toBe("new-key");
		});

		it("includes secretAccessKey when provided non-empty", () => {
			const form: ConnectionFormState = {
				name: "Updated MinIO",
				kind: "manual",
				region: "us-west-2",
				endpoint: "http://127.0.0.1:9000",
				forcePathStyle: true,
				accessKeyId: "new-key",
				secretAccessKey: "brand-new-secret",
			};
			const req = buildUpdateRequest("conn-1", form);
			expect(req.secretAccessKey).toBe("brand-new-secret");
		});
	});

	describe("formatBytes", () => {
		it("formats sizes in human-readable units", () => {
			expect(formatBytes(0)).toBe("0 B");
			expect(formatBytes(1024)).toBe("1.0 KB");
			expect(formatBytes(1048576)).toBe("1.0 MB");
			expect(formatBytes(1073741824)).toBe("1.0 GB");
		});
	});

	describe("filterByName", () => {
		it("filters items by case-insensitive substring", () => {
			const items = [{ name: "Report-2026.pdf" }, { name: "photo.jpg" }, { name: "ANNUAL-REPORT.DOCX" }];
			expect(filterByName(items, "report").map((i) => i.name)).toEqual(["Report-2026.pdf", "ANNUAL-REPORT.DOCX"]);
			expect(filterByName(items, "").length).toBe(3);
		});
	});

	describe("parseBreadcrumbs", () => {
		it("returns single root segment for empty prefix", () => {
			expect(parseBreadcrumbs("my-bucket", "")).toEqual([{ name: "my-bucket", prefix: "" }]);
		});

		it("returns hierarchical segments for nested prefixes", () => {
			const segments = parseBreadcrumbs("my-bucket", "documents/finance/2026/");
			expect(segments).toEqual([
				{ name: "my-bucket", prefix: "" },
				{ name: "documents", prefix: "documents/" },
				{ name: "finance", prefix: "documents/finance/" },
				{ name: "2026", prefix: "documents/finance/2026/" },
			]);
		});
	});

	describe("mergeFoldersAndObjects", () => {
		it("places folders first in listing order, then objects", () => {
			const folders = ["photos/2025/", "photos/2026/"];
			const objects: S3Item[] = [
				{ key: "photos/banner.jpg", size: 50000, lastModified: "2026-01-01" },
				{ key: "photos/logo.png", size: 12000, lastModified: "2026-02-01" },
			];
			const rows = mergeFoldersAndObjects("photos/", folders, objects);
			expect(rows).toEqual([
				{ kind: "folder", name: "2025/", prefix: "photos/2025/" },
				{ kind: "folder", name: "2026/", prefix: "photos/2026/" },
				{
					kind: "object",
					name: "banner.jpg",
					key: "photos/banner.jpg",
					size: 50000,
					lastModified: "2026-01-01",
					etag: undefined,
				},
				{
					kind: "object",
					name: "logo.png",
					key: "photos/logo.png",
					size: 12000,
					lastModified: "2026-02-01",
					etag: undefined,
				},
			]);
		});
	});

	describe("filterBrowserRows", () => {
		it("filters both folders and objects by case-insensitive name match", () => {
			const rows: BrowserRow[] = [
				{ kind: "folder", name: "Archives/", prefix: "Archives/" },
				{ kind: "folder", name: "Photos/", prefix: "Photos/" },
				{
					kind: "object",
					name: "archive-summary.csv",
					key: "archive-summary.csv",
					size: 100,
				},
				{
					kind: "object",
					name: "pic.jpg",
					key: "pic.jpg",
					size: 200,
				},
			];
			const filtered = filterBrowserRows(rows, "arch");
			expect(filtered.map((r) => r.name)).toEqual(["Archives/", "archive-summary.csv"]);
		});
	});

	describe("isStaleResponse", () => {
		it("flags mismatched request id or prefix as stale", () => {
			expect(isStaleResponse(2, "photos/", 1, "photos/")).toBe(true);
			expect(isStaleResponse(2, "photos/", 2, "documents/")).toBe(true);
			expect(isStaleResponse(2, "photos/", 2, "photos/")).toBe(false);
		});
	});

	describe("applyPageResponse", () => {
		const baseState: PageState = {
			requestId: 1,
			prefix: "docs/",
			folders: ["docs/a/"],
			objects: [{ key: "docs/1.txt", size: 10 }],
			nextToken: "tok-1",
			hasMore: true,
		};

		it("discards stale responses returning null", () => {
			const staleResp: PageResponse = {
				requestId: 2,
				prefix: "docs/",
				folders: [],
				objects: [],
			};
			expect(applyPageResponse(baseState, staleResp, false)).toBeNull();
		});

		it("replaces state on non-append initial load", () => {
			const freshResp: PageResponse = {
				requestId: 1,
				prefix: "docs/",
				folders: ["docs/b/"],
				objects: [{ key: "docs/2.txt", size: 20 }],
				nextToken: "tok-2",
			};
			const nextState = applyPageResponse(baseState, freshResp, false);
			expect(nextState).toEqual({
				requestId: 1,
				prefix: "docs/",
				folders: ["docs/b/"],
				objects: [{ key: "docs/2.txt", size: 20 }],
				nextToken: "tok-2",
				hasMore: true,
			});
		});

		it("appends folders and objects on page append", () => {
			const appendResp: PageResponse = {
				requestId: 1,
				prefix: "docs/",
				folders: ["docs/c/"],
				objects: [{ key: "docs/3.txt", size: 30 }],
				nextToken: undefined,
			};
			const nextState = applyPageResponse(baseState, appendResp, true);
			expect(nextState).toEqual({
				requestId: 1,
				prefix: "docs/",
				folders: ["docs/a/", "docs/c/"],
				objects: [
					{ key: "docs/1.txt", size: 10 },
					{ key: "docs/3.txt", size: 30 },
				],
				nextToken: undefined,
				hasMore: false,
			});
		});
	});

	describe("shouldResetInFlight", () => {
		it("returns true when request id and prefix match", () => {
			expect(shouldResetInFlight(2, "photos/", 2, "photos/")).toBe(true);
		});

		it("returns false when request id is stale", () => {
			expect(shouldResetInFlight(3, "photos/", 2, "photos/")).toBe(false);
		});

		it("returns false when prefix has changed", () => {
			expect(shouldResetInFlight(2, "photos/2026/", 2, "photos/")).toBe(false);
		});
	});

	describe("shouldAutoPage", () => {
		it("returns false when search is active", () => {
			expect(shouldAutoPage(true, false, true, false, 95, 100)).toBe(false);
		});

		it("returns false when page error is active", () => {
			expect(shouldAutoPage(false, true, true, false, 95, 100)).toBe(false);
		});

		it("returns false when request is in flight", () => {
			expect(shouldAutoPage(false, false, true, true, 95, 100)).toBe(false);
		});

		it("returns false when hasMore is false", () => {
			expect(shouldAutoPage(false, false, false, false, 95, 100)).toBe(false);
		});

		it("returns false when scroll position has not reached threshold", () => {
			expect(shouldAutoPage(false, false, true, false, 90, 100)).toBe(false);
		});

		it("returns true when near bottom, not in flight, has more, and no error", () => {
			expect(shouldAutoPage(false, false, true, false, 95, 100)).toBe(true);
			expect(shouldAutoPage(false, false, true, false, 98, 100)).toBe(true);
		});
	});

	describe("resetNavigationLoading and navigation auto-page recovery", () => {
		it("initializes loading state owning all loading flags", () => {
			const flags = resetNavigationLoading();
			expect(flags).toEqual({
				inFlight: true,
				loading: true,
				loadingMore: false,
			});
		});

		it("leaves state able to auto-page after stale next-page during navigation", () => {
			let loadingMore = true;
			let inFlight = true;
			let currentRequestId = 1;
			let currentPrefix = "a/";

			currentRequestId += 1;
			currentPrefix = "b/";
			const navFlags = resetNavigationLoading();
			inFlight = navFlags.inFlight;
			loadingMore = navFlags.loadingMore;

			const staleNextPageRequestId = 1;
			const staleNextPagePrefix = "a/";
			const shouldResetFromStale = shouldResetInFlight(
				currentRequestId,
				currentPrefix,
				staleNextPageRequestId,
				staleNextPagePrefix,
			);
			expect(shouldResetFromStale).toBe(false);
			if (shouldResetFromStale) {
				loadingMore = false;
			}

			const freshFirstPageRequestId = 2;
			const freshFirstPagePrefix = "b/";
			const shouldResetFromFresh = shouldResetInFlight(
				currentRequestId,
				currentPrefix,
				freshFirstPageRequestId,
				freshFirstPagePrefix,
			);
			expect(shouldResetFromFresh).toBe(true);
			if (shouldResetFromFresh) {
				inFlight = false;
			}

			const canAutoPage = shouldAutoPage(false, false, true, inFlight || loadingMore, 95, 100);
			expect(canAutoPage).toBe(true);
		});
	});
});
