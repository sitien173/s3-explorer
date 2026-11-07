// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickLook } from "../../src/renderer/src/components/QuickLook";
import type { BrowserRow } from "../../src/renderer/src/format";
import type { ViewerTarget } from "../../src/renderer/src/store";
import { render } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: { stream: { open: vi.fn() }, files: { openWithSystemApp: vi.fn() } },
}));
vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (result: any) => result.data,
}));

const object = (key: string): BrowserRow => ({ kind: "object", key, name: key, size: 1, lastModified: "2026-01-01" });
const folder = (prefix: string): BrowserRow => ({ kind: "folder", prefix, name: prefix });
const siblings: BrowserRow[] = [
	folder("dir/"),
	object("a.png"),
	folder("dir2/"),
	object("b.png"),
	object("c.png"),
	object("d.png"),
];
const s3 = (key: string): ViewerTarget => ({ kind: "s3", connectionId: "c1", bucket: "b1", key });
const streamTarget: ViewerTarget = {
	kind: "stream",
	url: "http://127.0.0.1/direct.png",
	contentType: "image/png",
	size: 1,
	fileName: "direct.png",
};

const mediaProto = HTMLMediaElement.prototype as any;
let pause: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;

beforeEach(() => {
	pause = vi.fn();
	load = vi.fn();
	mediaProto.pause = pause;
	mediaProto.load = load;
	mediaProto.play = vi.fn(() => Promise.resolve());
	mocks.api.stream.open.mockImplementation(async ({ key }: { key: string }) => ({
		ok: true,
		data: { url: `http://127.0.0.1/${key}`, contentType: contentTypeFor(key), size: 1 },
	}));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function contentTypeFor(key: string): string {
	if (key.endsWith(".mp4")) return "video/mp4";
	if (key.endsWith(".txt")) return "text/plain";
	return "image/png";
}

function Harness({
	initial,
	rows = siblings,
	onClose = vi.fn(),
	withGrid = false,
}: {
	initial: ViewerTarget | null;
	rows?: BrowserRow[];
	onClose?: () => void;
	withGrid?: boolean;
}) {
	const [target, setTarget] = useState<ViewerTarget | null>(initial);
	return (
		<>
			{withGrid && (
				<div role="grid" tabIndex={0} aria-label="grid">
					{rows.map((row) => {
						const key = row.kind === "folder" ? row.prefix : row.key;
						return (
							<div key={key} role="row" tabIndex={-1} id={`object-row-${encodeURIComponent(key)}`}>
								{key}
							</div>
						);
					})}
				</div>
			)}
			<button type="button" onClick={() => setTarget(s3("a.png"))}>
				open a
			</button>
			<QuickLook
				target={target}
				getSiblings={() => rows}
				onNavigate={(row) => setTarget(s3(row.key))}
				onClose={() => {
					onClose();
					setTarget(null);
				}}
			/>
		</>
	);
}

/** Moves fake time forward, then restores real timers so findBy queries can poll again. */
async function advance(ms: number) {
	// Follow-up ticks flush the timers that the debounce, the fetch, and React Query schedule in response.
	for (const step of [ms, 5, 5, 5]) {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(step);
		});
	}
	vi.useRealTimers();
}

const dialog = () => screen.findByRole("dialog");
// Base UI Dialog.Title names the popup through aria-labelledby.
const accessibleName = (element: Element) =>
	document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent ?? "";
const shownImage = (key: string) => screen.findByRole("img", { name: key });

describe("Quick Look open and close", () => {
	it("is named after the file and closes on Escape and on Space", async () => {
		const onClose = vi.fn();
		render(<Harness initial={s3("dir/photo.png")} onClose={onClose} />);
		const popup = await dialog();
		expect(accessibleName(popup)).toContain("photo.png");
		await shownImage("photo.png");
		fireEvent.keyDown(popup, { key: "Escape" });
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		fireEvent.click(screen.getByRole("button", { name: "open a" }));
		const reopened = await dialog();
		await shownImage("a.png");
		fireEvent.keyDown(reopened, { key: " " });
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("renders nothing while there is no target", () => {
		render(<Harness initial={null} />);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("Quick Look sibling navigation", () => {
	it("moves by item index, skips folders, and stops at the ends", async () => {
		render(<Harness initial={s3("a.png")} />);
		const popup = await dialog();
		await shownImage("a.png");
		fireEvent.keyDown(popup, { key: "ArrowLeft" });
		expect(accessibleName(popup)).toContain("a.png");
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		await waitFor(() => expect(accessibleName(popup)).toContain("b.png"));
		fireEvent.keyDown(popup, { key: "ArrowDown" });
		await waitFor(() => expect(accessibleName(popup)).toContain("c.png"));
		fireEvent.keyDown(popup, { key: "ArrowUp" });
		await waitFor(() => expect(accessibleName(popup)).toContain("b.png"));
		fireEvent.keyDown(popup, { key: "ArrowLeft" });
		await waitFor(() => expect(accessibleName(popup)).toContain("a.png"));
		fireEvent.keyDown(popup, { key: "ArrowLeft" });
		expect(accessibleName(popup)).toContain("a.png");
	});

	it("does not navigate for a target without siblings", async () => {
		const onNavigate = vi.fn();
		render(<QuickLook target={streamTarget} getSiblings={() => siblings} onNavigate={onNavigate} onClose={vi.fn()} />);
		const popup = await dialog();
		await shownImage("direct.png");
		for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) fireEvent.keyDown(popup, { key });
		expect(onNavigate).not.toHaveBeenCalled();
		expect(mocks.api.stream.open).not.toHaveBeenCalled();
	});

	it("selects the sibling through onNavigate", async () => {
		const onNavigate = vi.fn();
		render(<QuickLook target={s3("a.png")} getSiblings={() => siblings} onNavigate={onNavigate} onClose={vi.fn()} />);
		fireEvent.keyDown(await dialog(), { key: "ArrowRight" });
		expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ kind: "object", key: "b.png" }));
	});

	it("ignores arrow keys typed into a form control, and Space typed into a text field", async () => {
		const onNavigate = vi.fn();
		const onClose = vi.fn();
		mocks.api.stream.open.mockImplementation(async () => ({
			ok: true,
			data: { url: "http://127.0.0.1/clip.mp4", contentType: "video/mp4", size: 1 },
		}));
		render(
			<QuickLook
				target={s3("clip.mp4")}
				getSiblings={() => [object("clip.mp4"), object("z.mp4")]}
				onNavigate={onNavigate}
				onClose={onClose}
			/>,
		);
		await dialog();
		await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
		const video = document.querySelector("video") as HTMLVideoElement;
		fireEvent.keyDown(video, { key: "ArrowRight" });
		expect(onNavigate).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("closes on Space even when the video element has focus, like Finder", async () => {
		const onClose = vi.fn();
		mocks.api.stream.open.mockImplementation(async () => ({
			ok: true,
			data: { url: "http://127.0.0.1/clip.mp4", contentType: "video/mp4", size: 1 },
		}));
		render(
			<QuickLook
				target={s3("clip.mp4")}
				getSiblings={() => [object("clip.mp4")]}
				onNavigate={vi.fn()}
				onClose={onClose}
			/>,
		);
		await dialog();
		await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
		fireEvent.keyDown(document.querySelector("video") as HTMLVideoElement, { key: " " });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe("Quick Look streamOpen requests", () => {
	it("debounces rapid arrow navigation by 120 ms into one streamOpen call", async () => {
		render(<Harness initial={s3("a.png")} />);
		const popup = await dialog();
		await shownImage("a.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(1);

		vi.useFakeTimers();
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		expect(accessibleName(popup)).toContain("d.png");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(119);
		});
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(1);
		await advance(1);
		await shownImage("d.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);
		expect(mocks.api.stream.open).toHaveBeenLastCalledWith({ connectionId: "c1", bucket: "b1", key: "d.png" });
	});

	it("debounces arrows pressed within 120 ms of opening, after settling the opened target at once", async () => {
		render(<Harness initial={null} />);
		fireEvent.click(screen.getByRole("button", { name: "open a" }));
		const popup = await dialog();
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		expect(accessibleName(popup)).toContain("d.png");
		await shownImage("d.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);
		expect(mocks.api.stream.open).toHaveBeenNthCalledWith(1, { connectionId: "c1", bucket: "b1", key: "a.png" });
		expect(mocks.api.stream.open).toHaveBeenNthCalledWith(2, { connectionId: "c1", bucket: "b1", key: "d.png" });
	});

	it("reuses cached streamOpen results when returning to an object or reopening it", async () => {
		render(<Harness initial={s3("a.png")} />);
		const popup = await dialog();
		await shownImage("a.png");
		vi.useFakeTimers();
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		await advance(120);
		await shownImage("b.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);
		vi.useFakeTimers();
		fireEvent.keyDown(popup, { key: "ArrowLeft" });
		await advance(120);
		await shownImage("a.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);

		fireEvent.keyDown(popup, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "open a" }));
		await shownImage("a.png");
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);
	});
});

describe("Quick Look load errors", () => {
	it("drops the cache entry and re-runs streamOpen once, then shows an inline error with Retry", async () => {
		let calls = 0;
		mocks.api.stream.open.mockImplementation(async () => ({
			ok: true,
			data: { url: `http://127.0.0.1/handle-${++calls}`, contentType: "image/png", size: 1 },
		}));
		render(<Harness initial={s3("a.png")} />);
		const first = await shownImage("a.png");
		expect(first.getAttribute("src")).toBe("http://127.0.0.1/handle-1");

		fireEvent.error(first);
		await waitFor(() => expect(mocks.api.stream.open).toHaveBeenCalledTimes(2));
		const second = await screen.findByRole("img", { name: "a.png" });
		expect(second.getAttribute("src")).toBe("http://127.0.0.1/handle-2");
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

		fireEvent.error(second);
		expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Open with system app" })).toBeTruthy();
		expect(mocks.api.stream.open).toHaveBeenCalledTimes(2);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(mocks.api.stream.open).toHaveBeenCalledTimes(3));
		const third = await screen.findByRole("img", { name: "a.png" });
		expect(third.getAttribute("src")).toBe("http://127.0.0.1/handle-3");
	});

	it("shows the inline error at once for a stream target, which has no cache entry to drop", async () => {
		render(<QuickLook target={streamTarget} getSiblings={() => []} onNavigate={vi.fn()} onClose={vi.fn()} />);
		fireEvent.error(await shownImage("direct.png"));
		expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect((await shownImage("direct.png")).getAttribute("src")).toBe("http://127.0.0.1/direct.png");
		expect(mocks.api.stream.open).not.toHaveBeenCalled();
	});
});

describe("Quick Look media and text lifecycle", () => {
	it("unloads video on close and on navigation", async () => {
		render(<Harness initial={s3("a.mp4")} rows={[object("a.mp4"), object("b.mp4")]} />);
		const popup = await dialog();
		await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
		const first = document.querySelector("video") as HTMLVideoElement;
		expect(first.getAttribute("src")).toBe("http://127.0.0.1/a.mp4");

		vi.useFakeTimers();
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		expect(first.isConnected).toBe(false);
		expect(pause).toHaveBeenCalled();
		expect(first.hasAttribute("src")).toBe(false);
		expect(load).toHaveBeenCalled();

		await advance(120);
		await waitFor(() => expect(document.querySelector("video")?.getAttribute("src")).toBe("http://127.0.0.1/b.mp4"));
		const second = document.querySelector("video") as HTMLVideoElement;
		pause.mockClear();
		load.mockClear();
		fireEvent.keyDown(popup, { key: "Escape" });
		await waitFor(() => expect(second.isConnected).toBe(false));
		expect(pause).toHaveBeenCalled();
		expect(second.hasAttribute("src")).toBe(false);
		expect(load).toHaveBeenCalled();
	});

	it("pauses and unloads media as soon as Quick Look closes, without waiting for the exit transition", async () => {
		render(<Harness initial={s3("a.mp4")} rows={[object("a.mp4")]} />);
		const popup = await dialog();
		await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
		const video = document.querySelector("video") as HTMLVideoElement;
		pause.mockClear();
		load.mockClear();
		// Hold the exit transition open: jsdom has no animations, so the popup would otherwise unmount at once.
		const getAnimations = vi.fn(() => [{ finished: new Promise(() => {}) }]);
		(Element.prototype as any).getAnimations = getAnimations;
		try {
			fireEvent.keyDown(popup, { key: "Escape" });
			await act(async () => {});
			expect(popup.isConnected).toBe(true);
			expect(pause).toHaveBeenCalled();
			expect(load).toHaveBeenCalled();
			expect(video.hasAttribute("src")).toBe(false);
		} finally {
			delete (Element.prototype as any).getAnimations;
		}
	});

	it("aborts the text request on close and on navigation", async () => {
		const signals: AbortSignal[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init: RequestInit) => {
				signals.push(init.signal as AbortSignal);
				return new Promise(() => {});
			}),
		);
		render(<Harness initial={s3("a.txt")} rows={[object("a.txt"), object("b.txt")]} />);
		const popup = await dialog();
		await waitFor(() => expect(signals).toHaveLength(1));
		vi.useFakeTimers();
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		expect(signals[0].aborted).toBe(true);
		await advance(120);
		await waitFor(() => expect(signals).toHaveLength(2));
		expect(signals[1].aborted).toBe(false);
		fireEvent.keyDown(popup, { key: "Escape" });
		await waitFor(() => expect(signals[1].aborted).toBe(true));
		vi.unstubAllGlobals();
	});
});

describe("Quick Look focus", () => {
	it("returns focus to the current item's row after navigating", async () => {
		const user = userEvent.setup();
		render(<Harness initial={null} withGrid />);
		screen.getByRole("grid").focus();
		fireEvent.click(screen.getByRole("button", { name: "open a" }));
		const popup = await dialog();
		await shownImage("a.png");
		fireEvent.keyDown(popup, { key: "ArrowRight" });
		await waitFor(() => expect(accessibleName(popup)).toContain("b.png"));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement?.id).toBe("object-row-b.png"));
	});

	it("falls back to the grid when the current row is not mounted", async () => {
		const user = userEvent.setup();
		render(<Harness initial={null} rows={siblings} withGrid />);
		const grid = screen.getByRole("grid");
		grid.focus();
		fireEvent.click(screen.getByRole("button", { name: "open a" }));
		await dialog();
		document.getElementById("object-row-a.png")?.remove();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(grid));
	});
});
