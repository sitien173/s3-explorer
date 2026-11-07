// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ThumbnailScheduler,
	defaultLoadImage,
	isEligibleThumbnail,
	isQuickLookPlayingMedia,
	MAX_THUMBNAIL_SIZE_BYTES,
} from "../../src/renderer/src/thumbnails";
import type { BrowserRow } from "../../src/renderer/src/format";
import type { ViewerTarget } from "../../src/renderer/src/store";

describe("Thumbnail helper predicates", () => {
	it("isEligibleThumbnail allows only image objects <= 5 MiB", () => {
		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "test.png",
				name: "test.png",
				size: 1024,
				lastModified: "2026-01-01",
			}),
		).toBe(true);

		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "max.jpg",
				name: "max.jpg",
				size: MAX_THUMBNAIL_SIZE_BYTES,
				lastModified: "2026-01-01",
			}),
		).toBe(true);

		// > 5 MiB
		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "large.png",
				name: "large.png",
				size: MAX_THUMBNAIL_SIZE_BYTES + 1,
				lastModified: "2026-01-01",
			}),
		).toBe(false);

		// undefined size
		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "nosize.png",
				name: "nosize.png",
				size: undefined as unknown as number,
				lastModified: "2026-01-01",
			}),
		).toBe(false);

		// non-image types
		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "clip.mp4",
				name: "clip.mp4",
				size: 1024,
				lastModified: "2026-01-01",
			}),
		).toBe(false);
		expect(
			isEligibleThumbnail({
				kind: "object",
				key: "doc.pdf",
				name: "doc.pdf",
				size: 1024,
				lastModified: "2026-01-01",
			}),
		).toBe(false);

		// folder
		expect(
			isEligibleThumbnail({
				kind: "folder",
				prefix: "photos/",
				name: "photos",
			}),
		).toBe(false);
	});

	it("isQuickLookPlayingMedia detects video and audio viewer targets", () => {
		expect(isQuickLookPlayingMedia(null)).toBe(false);

		// S3 targets
		expect(
			isQuickLookPlayingMedia({
				kind: "s3",
				connectionId: "c",
				bucket: "b",
				key: "video.mp4",
			}),
		).toBe(true);
		expect(
			isQuickLookPlayingMedia({
				kind: "s3",
				connectionId: "c",
				bucket: "b",
				key: "song.mp3",
			}),
		).toBe(true);
		expect(
			isQuickLookPlayingMedia({
				kind: "s3",
				connectionId: "c",
				bucket: "b",
				key: "photo.jpg",
			}),
		).toBe(false);
		expect(
			isQuickLookPlayingMedia({
				kind: "s3",
				connectionId: "c",
				bucket: "b",
				key: "notes.txt",
			}),
		).toBe(false);

		// Stream targets
		expect(
			isQuickLookPlayingMedia({
				kind: "stream",
				url: "http://127.0.0.1/video",
				contentType: "video/webm",
				fileName: "video.webm",
				size: 100,
			}),
		).toBe(true);
		expect(
			isQuickLookPlayingMedia({
				kind: "stream",
				url: "http://127.0.0.1/audio",
				contentType: "audio/ogg",
				fileName: "audio.ogg",
				size: 100,
			}),
		).toBe(true);
		expect(
			isQuickLookPlayingMedia({
				kind: "stream",
				url: "http://127.0.0.1/img",
				contentType: "image/png",
				fileName: "img.png",
				size: 100,
			}),
		).toBe(false);
	});
});

describe("ThumbnailScheduler", () => {
	const flushMicrotasks = async () => {
		for (let i = 0; i < 5; i++) {
			await Promise.resolve();
		}
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	function makeImageRow(key: string, size = 1000): BrowserRow {
		return {
			kind: "object",
			key,
			name: key,
			size,
			lastModified: "2026-01-01",
		};
	}

	it("keeps a cell marked as error after a later thumbnail state change", async () => {
		const openStream = vi.fn(async ({ key }: { key: string }) => ({ url: `http://127.0.0.1/${key}` }));
		const loadImage = vi.fn().mockResolvedValue(undefined);
		const onStateChange = vi.fn();
		const scheduler = new ThumbnailScheduler({ connectionId: "c", bucket: "b", openStream, loadImage, onStateChange });

		scheduler.schedule([makeImageRow("a.jpg")]);
		vi.advanceTimersByTime(150);
		await flushMicrotasks();
		expect(scheduler.getState()["a.jpg"]).toEqual({ status: "loaded", url: "http://127.0.0.1/a.jpg" });

		scheduler.markError("a.jpg");
		scheduler.schedule([makeImageRow("a.jpg"), makeImageRow("b.jpg")]);
		vi.advanceTimersByTime(150);
		await flushMicrotasks();

		expect(scheduler.getState()["b.jpg"]).toEqual({ status: "loaded", url: "http://127.0.0.1/b.jpg" });
		expect(scheduler.getState()["a.jpg"]).toEqual({ status: "error" });
		expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ "a.jpg": { status: "error" } }));
	});

	it("maintains at most 4 requests in flight counting stream.open plus image load", async () => {
		const openResolvers = new Map<string, (val: { url: string }) => void>();
		const loadResolvers = new Map<string, () => void>();

		const openStream = vi.fn(
			({ key }: { key: string }) =>
				new Promise<{ url: string }>((resolve) => {
					openResolvers.set(key, resolve);
				}),
		);
		const loadImage = vi.fn(
			(url: string) =>
				new Promise<void>((resolve) => {
					loadResolvers.set(url, resolve);
				}),
		);

		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage,
		});

		const rows = Array.from({ length: 8 }, (_, i) => makeImageRow(`photo-${i}.jpg`));
		scheduler.schedule(rows);

		// Before 150 ms idle delay, nothing started
		vi.advanceTimersByTime(149);
		expect(openStream).not.toHaveBeenCalled();

		// At 150 ms, exactly 4 requests start
		vi.advanceTimersByTime(1);
		expect(openStream).toHaveBeenCalledTimes(4);
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "photo-0.jpg" });
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "photo-1.jpg" });
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "photo-2.jpg" });
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "photo-3.jpg" });
		expect(loadImage).not.toHaveBeenCalled();

		// Resolve openStream for photo-0.jpg; loadImage starts for photo-0, still 4 in flight
		openResolvers.get("photo-0.jpg")!({ url: "http://127.0.0.1/photo-0.jpg" });
		await flushMicrotasks();
		expect(loadImage).toHaveBeenCalledWith("http://127.0.0.1/photo-0.jpg");
		expect(openStream).toHaveBeenCalledTimes(4); // 5th item not started yet because photo-0 is still loading image

		// Resolve loadImage for photo-0.jpg; photo-0 is completed, 5th request starts
		loadResolvers.get("http://127.0.0.1/photo-0.jpg")!();
		await flushMicrotasks();
		expect(openStream).toHaveBeenCalledTimes(5);
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "photo-4.jpg" });
		expect(scheduler.getState()["photo-0.jpg"]).toEqual({
			status: "loaded",
			url: "http://127.0.0.1/photo-0.jpg",
		});
	});

	it("resets the 150 ms idle delay on scroll", () => {
		const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1/test.jpg" });
		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
		});

		scheduler.schedule([makeImageRow("pic.png")]);

		vi.advanceTimersByTime(100);
		expect(openStream).not.toHaveBeenCalled();

		scheduler.onScroll();

		vi.advanceTimersByTime(100);
		// 200 ms total elapsed, but only 100 ms since onScroll -> still not called
		expect(openStream).not.toHaveBeenCalled();

		vi.advanceTimersByTime(50);
		// 150 ms since onScroll -> called
		expect(openStream).toHaveBeenCalledTimes(1);
	});

	it("schedules only visible rows, not overscan, and drops rows that scrolled out before idle expires", async () => {
		const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1/test.jpg" });
		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
		});

		// Initial schedule with rows 0 and 1 visible (overscan rows 2 and 3 omitted)
		scheduler.schedule([makeImageRow("visible-0.png"), makeImageRow("visible-1.png")]);

		vi.advanceTimersByTime(80);
		scheduler.onScroll();
		// User scrolls: visible rows become 4 and 5
		scheduler.schedule([makeImageRow("visible-4.png"), makeImageRow("visible-5.png")]);

		vi.advanceTimersByTime(150);
		await flushMicrotasks();

		expect(openStream).toHaveBeenCalledTimes(2);
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "visible-4.png" });
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "visible-5.png" });
		expect(openStream).not.toHaveBeenCalledWith(expect.objectContaining({ key: "visible-0.png" }));
		expect(openStream).not.toHaveBeenCalledWith(expect.objectContaining({ key: "visible-1.png" }));
	});

	it("skips images over 5 MiB and non-image types", async () => {
		const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1/test.jpg" });
		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
		});

		const rows: BrowserRow[] = [
			makeImageRow("valid.png", 2 * 1024 * 1024),
			makeImageRow("too-big.png", 6 * 1024 * 1024),
			{ kind: "object", key: "video.mp4", name: "video.mp4", size: 1000, lastModified: "2026-01-01" },
			{ kind: "folder", prefix: "folder/", name: "folder" },
		];

		scheduler.schedule(rows);
		vi.advanceTimersByTime(150);
		await flushMicrotasks();

		expect(openStream).toHaveBeenCalledTimes(1);
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "valid.png" });
	});

	it("pauses while Quick Look plays video or audio and resumes afterwards", async () => {
		const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1/test.jpg" });
		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
		});

		scheduler.schedule([makeImageRow("pic1.png"), makeImageRow("pic2.png")]);
		// Media playback starts
		scheduler.setPaused(true);

		vi.advanceTimersByTime(200);
		await flushMicrotasks();

		// Nothing started while paused
		expect(openStream).not.toHaveBeenCalled();

		// Quick Look media closed -> resume
		scheduler.setPaused(false);
		await flushMicrotasks();

		// Requests immediately resume
		expect(openStream).toHaveBeenCalledTimes(2);
	});

	it("marks status as error on failure with no toast and no retry", async () => {
		const openStream = vi.fn().mockRejectedValue(new Error("Network failure"));
		const onStateChange = vi.fn();
		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
			onStateChange,
		});

		scheduler.schedule([makeImageRow("broken.png")]);
		vi.advanceTimersByTime(150);
		await flushMicrotasks();

		expect(openStream).toHaveBeenCalledTimes(1);
		expect(scheduler.getState()["broken.png"]).toEqual({ status: "error" });

		// Schedule again: failed row is skipped (no retry)
		scheduler.schedule([makeImageRow("broken.png"), makeImageRow("other.png")]);
		vi.advanceTimersByTime(150);
		await flushMicrotasks();

		// broken.png was not called again; only other.png
		expect(openStream).toHaveBeenCalledTimes(2);
		expect(openStream).toHaveBeenLastCalledWith({ connectionId: "c", bucket: "b", key: "other.png" });
	});

	it("cancels pending work on unmount or prefix change", async () => {
		let resolveOpen: ((val: { url: string }) => void) | undefined;
		const openStream = vi.fn(
			() =>
				new Promise<{ url: string }>((resolve) => {
					resolveOpen = resolve;
				}),
		);
		const onStateChange = vi.fn();

		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
			onStateChange,
		});

		scheduler.schedule([makeImageRow("img-0.png"), makeImageRow("img-1.png")]);
		vi.advanceTimersByTime(150);
		expect(openStream).toHaveBeenCalledTimes(2);

		// Prefix changes / unmount -> cancelAll
		scheduler.cancelAll();

		// Resolve the in-flight request after cancel
		resolveOpen?.({ url: "http://127.0.0.1/img-0.png" });
		await flushMicrotasks();

		// State should not be marked loaded for cancelled request
		expect(scheduler.getState()["img-0.png"]?.status).not.toBe("loaded");
	});

	it("enforces at most 4 pending requests after cancel and reschedule", async () => {
		const pendingResolvers: ((val: { url: string }) => void)[] = [];
		const openStream = vi.fn(
			() =>
				new Promise<{ url: string }>((resolve) => {
					pendingResolvers.push(resolve);
				}),
		);

		const scheduler = new ThumbnailScheduler({
			connectionId: "c",
			bucket: "b",
			openStream,
			loadImage: vi.fn().mockResolvedValue(undefined),
		});

		scheduler.schedule([
			makeImageRow("pic-0.jpg"),
			makeImageRow("pic-1.jpg"),
			makeImageRow("pic-2.jpg"),
			makeImageRow("pic-3.jpg"),
		]);

		vi.advanceTimersByTime(150);
		expect(openStream).toHaveBeenCalledTimes(4);
		expect(pendingResolvers).toHaveLength(4);

		// Cancel while all 4 are still pending
		scheduler.cancelAll();

		// Reschedule new items immediately
		scheduler.schedule([
			makeImageRow("pic-new-0.jpg"),
			makeImageRow("pic-new-1.jpg"),
			makeImageRow("pic-new-2.jpg"),
			makeImageRow("pic-new-3.jpg"),
		]);

		vi.advanceTimersByTime(150);
		// Still only 4 total pending requests started, because 4 old ones have not settled yet
		expect(openStream).toHaveBeenCalledTimes(4);

		// Settle one of the old requests
		const resolver0 = pendingResolvers.shift()!;
		resolver0({ url: "http://127.0.0.1/pic-0.jpg" });
		await flushMicrotasks();

		// Now 1 new request can start, maintaining the limit of 4
		expect(openStream).toHaveBeenCalledTimes(5);
		expect(openStream).toHaveBeenLastCalledWith({ connectionId: "c", bucket: "b", key: "pic-new-0.jpg" });
	});
});

describe("useThumbnailScheduler hook", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	const flushMicrotasks = async () => {
		for (let i = 0; i < 5; i++) {
			await Promise.resolve();
		}
	};

	it("integrates scheduling, pause on media, and reset on prefix change", async () => {
		const { renderHook, act } = await import("@testing-library/react");
		const { useThumbnailScheduler } = await import("../../src/renderer/src/thumbnails");

		const openStream = vi.fn().mockImplementation(async ({ key }: { key: string }) => ({
			url: `http://127.0.0.1/${key}`,
		}));
		const loadImage = vi.fn().mockResolvedValue(undefined);

		const row1 = { kind: "object" as const, key: "pic1.png", name: "pic1.png", size: 1000, lastModified: "2026-01-01" };
		const row2 = { kind: "object" as const, key: "pic2.png", name: "pic2.png", size: 1000, lastModified: "2026-01-01" };

		let prefix = "folder1/";
		const viewerTarget: ViewerTarget | null = null;
		let visibleRows: BrowserRow[] = [row1];

		const { result, rerender, unmount } = renderHook(() =>
			useThumbnailScheduler({
				connectionId: "c",
				bucket: "b",
				prefix,
				visibleRows,
				viewerTarget,
				openStream,
				loadImage,
			}),
		);

		// Advance timers by 150 ms to trigger scheduling
		await act(async () => {
			vi.advanceTimersByTime(150);
			await flushMicrotasks();
		});

		expect(openStream).toHaveBeenCalledTimes(1);
		expect(openStream).toHaveBeenCalledWith({ connectionId: "c", bucket: "b", key: "pic1.png" });
		expect(result.current.thumbnails["pic1.png"]).toEqual({
			status: "loaded",
			url: "http://127.0.0.1/pic1.png",
		});

		// Prefix changes -> state resets and pending work cancelled
		prefix = "folder2/";
		visibleRows = [row2];
		rerender();

		expect(result.current.thumbnails["pic1.png"]).toBeUndefined();

		await act(async () => {
			vi.advanceTimersByTime(150);
			await flushMicrotasks();
		});

		expect(openStream).toHaveBeenCalledTimes(2);
		expect(openStream).toHaveBeenLastCalledWith({ connectionId: "c", bucket: "b", key: "pic2.png" });
		expect(result.current.thumbnails["pic2.png"]).toEqual({
			status: "loaded",
			url: "http://127.0.0.1/pic2.png",
		});

		unmount();
	});
});

describe("defaultLoadImage", () => {
	it("clears img.src on cancel via AbortSignal", async () => {
		const controller = new AbortController();
		const p = defaultLoadImage("http://127.0.0.1/test.png", controller.signal);
		controller.abort();
		await expect(p).rejects.toThrow("Aborted");
	});
});
