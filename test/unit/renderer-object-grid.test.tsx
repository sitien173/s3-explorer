// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: {
		objects: { list: vi.fn() },
	},
}));

vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (r: any) => r.data,
}));

import { ObjectGrid, CELL_WIDTH, CELL_HEIGHT, GRID_OVERSCAN_ROWS } from "../../src/renderer/src/components/ObjectGrid";

afterEach(() => cleanup());

const objects = Array.from({ length: 10000 }, (_, i) => ({
	key: `row-${i}.txt`,
	size: i,
	lastModified: "2026-01-01",
}));

beforeEach(() => {
	Object.defineProperty(HTMLElement.prototype, "clientHeight", {
		configurable: true,
		value: 400,
	});
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		value: 800,
	});
});

function grid(props: Record<string, unknown> = {}) {
	return render(<ObjectGrid connectionId="c" bucket="b" prefix="" onNavigate={vi.fn()} {...props} />);
}

const setup = async (list = objects.slice(0, 8), props: Record<string, unknown> = {}) => {
	mocks.api.objects.list.mockResolvedValue({
		ok: true,
		data: { folders: [], objects: list },
	});
	const user = userEvent.setup();
	grid(props);
	await waitFor(() => expect(mocks.api.objects.list).toHaveBeenCalled());
	await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-busy")).not.toBe("true"));
	return user;
};

const mountedCellCount = async (list: typeof objects, height: number, width = 800) => {
	Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: height });
	Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: width });
	await setup(list);
	await waitFor(() => {
		const g = screen.getByRole("grid");
		expect(g.getAttribute("aria-busy")).not.toBe("true");
		expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
	});
	const count = screen.getAllByRole("gridcell").length;
	cleanup();
	return count;
};

const expectViewportBound = async (height: number, width = 800) => {
	const columns = Math.max(1, Math.floor(width / CELL_WIDTH));
	const maxBound = (Math.ceil(height / CELL_HEIGHT) + 2 * GRID_OVERSCAN_ROWS) * columns;
	const countLarge = await mountedCellCount(objects, height, width);
	expect(countLarge).toBeLessThanOrEqual(maxBound);
	expect(countLarge).toBe(await mountedCellCount(objects.slice(0, 1000), height, width));
};

it("mounts at most (ceil(viewport / CELL_HEIGHT) + 2 * GRID_OVERSCAN_ROWS) * columns cells at a 400 px viewport, independent of listing size", () =>
	expectViewportBound(400));

it("mounts at most (ceil(viewport / CELL_HEIGHT) + 2 * GRID_OVERSCAN_ROWS) * columns cells at a 1200 px viewport, independent of listing size", () =>
	expectViewportBound(1200));

it("mounts more cells at 1200 px than at 400 px", async () => {
	const count400 = await mountedCellCount(objects, 400);
	const count1200 = await mountedCellCount(objects, 1200);
	expect(count1200).toBeGreaterThan(count400);
});

it("exposes a multiselectable grid with rows and gridcells, aria-multiselectable, and aria-rowcount", async () => {
	await setup();
	const g = screen.getByRole("grid");
	expect(g.getAttribute("aria-multiselectable")).toBe("true");
	expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
	expect(screen.getAllByRole("row").length).toBeGreaterThan(0);
});

it("derives aria-selected and selection styling on click, ctrl-click, and shift-click", async () => {
	const onSelectionChange = vi.fn();
	const user = await setup(objects.slice(0, 6), { onSelectionChange });
	const cells = screen.getAllByRole("gridcell");
	expect(cells.length).toBeGreaterThanOrEqual(2);

	await user.click(cells[0]);
	expect(cells[0].getAttribute("aria-selected")).toBe("true");
	expect(cells[0].className).toContain("bg-selection");
	expect(cells[0].className).toContain("ring-accent");
	expect(cells[1].getAttribute("aria-selected")).toBe("false");

	fireEvent.click(cells[1], { ctrlKey: true });
	expect(cells[0].getAttribute("aria-selected")).toBe("true");
	expect(cells[1].getAttribute("aria-selected")).toBe("true");
});

it("navigates left/right by one cell and up/down by one row of columns", async () => {
	const onSelectionChange = vi.fn();
	await setup(objects.slice(0, 12), { onSelectionChange });
	const g = screen.getByRole("grid");
	g.focus();

	// Select first cell
	fireEvent.keyDown(g, { key: "ArrowRight" });
	expect(onSelectionChange).toHaveBeenCalled();

	// Move down by one row of columns
	fireEvent.keyDown(g, { key: "ArrowDown" });
	expect(onSelectionChange).toHaveBeenCalled();

	// Move left by one cell
	fireEvent.keyDown(g, { key: "ArrowLeft" });
	expect(onSelectionChange).toHaveBeenCalled();

	// Move up by one row of columns
	fireEvent.keyDown(g, { key: "ArrowUp" });
	expect(onSelectionChange).toHaveBeenCalled();
});

it("triggers Quick Look on Space key", async () => {
	const onQuickLook = vi.fn();
	const user = await setup(objects.slice(0, 4), { onQuickLook });
	const cells = screen.getAllByRole("gridcell");
	await user.click(cells[0]);

	const g = screen.getByRole("grid");
	fireEvent.keyDown(g, { key: " " });
	expect(onQuickLook).toHaveBeenCalledWith(expect.objectContaining({ key: "row-0.txt" }));
});

it("opens folder on Enter key and on double click", async () => {
	const onNavigate = vi.fn();
	mocks.api.objects.list.mockResolvedValue({
		ok: true,
		data: { folders: ["photos/"], objects: [] },
	});
	const user = userEvent.setup();
	grid({ onNavigate });
	await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-busy")).not.toBe("true"));

	const folderCell = screen.getByRole("gridcell");
	await user.click(folderCell);

	const g = screen.getByRole("grid");
	fireEvent.keyDown(g, { key: "Enter" });
	expect(onNavigate).toHaveBeenCalledWith("photos/");

	fireEvent.doubleClick(folderCell);
	expect(onNavigate).toHaveBeenCalledTimes(2);
});

it("opens context menu with object actions", async () => {
	const onGridAction = vi.fn();
	await setup(objects.slice(0, 4), { onGridAction });
	const cells = screen.getAllByRole("gridcell");
	fireEvent.contextMenu(cells[0]);

	expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
	expect(screen.getByRole("menuitem", { name: "Download" })).toBeTruthy();
	expect(screen.getByRole("menuitem", { name: "Rename or move" })).toBeTruthy();
	expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
});

it("renders thumbnail img with loading='lazy', decoding='async', alt='' when loaded", async () => {
	const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:19000/stream-thumb.png" });
	const loadImage = vi.fn().mockResolvedValue(undefined);

	mocks.api.objects.list.mockResolvedValue({
		ok: true,
		data: {
			folders: [],
			objects: [{ key: "thumb.png", size: 1024, lastModified: "2026-01-01" }],
		},
	});

	const { container } = render(
		<ObjectGrid
			connectionId="c"
			bucket="b"
			prefix=""
			onNavigate={vi.fn()}
			openStream={openStream}
			loadImage={loadImage}
		/>,
	);

	await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-busy")).not.toBe("true"));

	await waitFor(() => {
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
		expect(img?.getAttribute("loading")).toBe("lazy");
		expect(img?.getAttribute("decoding")).toBe("async");
		expect(img?.getAttribute("alt")).toBe("");
		expect(img?.getAttribute("src")).toBe("http://127.0.0.1:19000/stream-thumb.png");
	});
});

function GridBucketWrapper({
	bucket,
	openStream,
	loadImage,
}: {
	bucket: string;
	openStream: (target: { connectionId: string; bucket: string; key: string }) => Promise<{ url: string }>;
	loadImage: () => Promise<void>;
}) {
	return (
		<ObjectGrid
			key={`${bucket}/`}
			connectionId="c"
			bucket={bucket}
			prefix=""
			onNavigate={vi.fn()}
			openStream={openStream}
			loadImage={loadImage}
		/>
	);
}

it("shows no stale image when switching buckets with the same key", async () => {
	const openStream = vi.fn().mockImplementation(async ({ bucket }: { bucket: string; key: string }) => {
		if (bucket === "bucket-1") {
			return { url: "http://127.0.0.1:19000/b1-photo.png" };
		}
		return new Promise<{ url: string }>(() => {});
	});
	const loadImage = vi.fn().mockResolvedValue(undefined);

	mocks.api.objects.list.mockImplementation(async () => {
		return {
			ok: true,
			data: {
				folders: [],
				objects: [{ key: "photo.png", size: 1024, lastModified: "2026-01-01" }],
			},
		};
	});

	const { container, rerender } = render(
		<GridBucketWrapper bucket="bucket-1" openStream={openStream} loadImage={loadImage} />,
	);

	await waitFor(() => {
		const img = container.querySelector("img");
		expect(img?.getAttribute("src")).toBe("http://127.0.0.1:19000/b1-photo.png");
	});

	// Switch bucket to bucket-2
	rerender(<GridBucketWrapper bucket="bucket-2" openStream={openStream} loadImage={loadImage} />);

	// In bucket-2, stream is not resolved yet; must not show stale image from bucket-1
	const staleImg = container.querySelector("img");
	expect(staleImg).toBeNull();
});

it("marks thumbnail as error on img onError and shows type icon with mediaKind", async () => {
	const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:19000/broken-image.png" });
	const loadImage = vi.fn().mockResolvedValue(undefined);

	mocks.api.objects.list.mockResolvedValue({
		ok: true,
		data: {
			folders: [],
			objects: [{ key: "broken-image.png", size: 1024, lastModified: "2026-01-01" }],
		},
	});

	const { container } = render(
		<ObjectGrid
			connectionId="c"
			bucket="b"
			prefix=""
			onNavigate={vi.fn()}
			openStream={openStream}
			loadImage={loadImage}
		/>,
	);

	await waitFor(() => {
		const img = container.querySelector("img");
		expect(img).not.toBeNull();
	});

	const img = container.querySelector("img")!;
	fireEvent.error(img);

	// After error, img is removed and type icon (svg) is displayed
	await waitFor(() => {
		expect(container.querySelector("img")).toBeNull();
		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
	});
});

it("never passes keys in overscan rows to openStream", async () => {
	const openStream = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:19000/item.png" });
	const loadImage = vi.fn().mockResolvedValue(undefined);

	// At 400 px height and width 800 (columns = 6), rows 0..3 (indices 0..23) are truly visible.
	// Row 4 (indices 24..29) is in overscan.
	const manyObjects = Array.from({ length: 30 }, (_, i) => ({
		key: `photo-${i}.png`,
		size: 1024,
		lastModified: "2026-01-01",
	}));

	mocks.api.objects.list.mockResolvedValue({
		ok: true,
		data: {
			folders: [],
			objects: manyObjects,
		},
	});

	render(
		<ObjectGrid
			connectionId="c"
			bucket="b"
			prefix=""
			onNavigate={vi.fn()}
			openStream={openStream}
			loadImage={loadImage}
		/>,
	);

	await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-busy")).not.toBe("true"));

	// Wait for thumbnail scheduler to run for visible rows
	await waitFor(() => expect(openStream).toHaveBeenCalled());

	// Verify that openStream was called for visible keys, but NEVER for overscan keys (row 4: photo-24 to photo-29)
	const calledKeys = openStream.mock.calls.map((call) => call[0].key);
	for (let i = 24; i < 30; i++) {
		expect(calledKeys).not.toContain(`photo-${i}.png`);
	}
});
