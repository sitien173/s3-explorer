// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
// @ts-ignore Source module belongs to the renderer project, not the node project.
import { initialSelection } from "../../src/renderer/src/selection";
// @ts-ignore Source module belongs to the renderer project, not the node project.
import { useShellStore } from "../../src/renderer/src/store";

const state = () => useShellStore.getState();
const target = { kind: "s3", connectionId: "c1", bucket: "b1", key: "a.txt" } as const;

beforeEach(() => {
	localStorage.clear();
	state().reset();
});

describe("shell store location", () => {
	it("starts empty", () => {
		expect(state().connectionId).toBeNull();
		expect(state().bucket).toBeNull();
		expect(state().prefix).toBe("");
		expect(state().selection).toEqual(initialSelection);
		expect(state().viewerTarget).toBeNull();
		expect(state().dialog).toBeNull();
		expect(state().transfersOpen).toBe(false);
		expect(state().paletteOpen).toBe(false);
	});

	it("selectBucket sets the location and clears prefix, selection, and viewer", () => {
		state().selectBucket("c1", "b1");
		state().navigate("photos/");
		state().dispatchSelection({ type: "select", key: "photos/a.jpg", keys: ["photos/a.jpg"] });
		state().setViewerTarget(target);
		state().selectBucket("c2", "b2");
		expect(state().connectionId).toBe("c2");
		expect(state().bucket).toBe("b2");
		expect(state().prefix).toBe("");
		expect(state().selection).toEqual(initialSelection);
		expect(state().viewerTarget).toBeNull();
	});

	it("selectConnection clears bucket, prefix, selection, and viewer", () => {
		state().selectBucket("c1", "b1");
		state().navigate("x/");
		state().setViewerTarget(target);
		state().selectConnection("c1");
		expect(state().connectionId).toBe("c1");
		expect(state().bucket).toBeNull();
		expect(state().prefix).toBe("");
		expect(state().viewerTarget).toBeNull();
		state().selectConnection(null);
		expect(state().connectionId).toBeNull();
	});

	it("navigate keeps connection and bucket and clears selection and viewer", () => {
		state().selectBucket("c1", "b1");
		state().dispatchSelection({ type: "select", key: "a", keys: ["a"] });
		state().setViewerTarget(target);
		state().navigate("docs/");
		expect(state().connectionId).toBe("c1");
		expect(state().bucket).toBe("b1");
		expect(state().prefix).toBe("docs/");
		expect(state().selection).toEqual(initialSelection);
		expect(state().viewerTarget).toBeNull();
	});
});

describe("shell store selection and viewer", () => {
	it("applies selection reducer actions", () => {
		state().dispatchSelection({ type: "select", key: "b", keys: ["a", "b", "c"] });
		expect(state().selection.selected).toEqual(["b"]);
		state().dispatchSelection({ type: "toggle", key: "c", keys: ["a", "b", "c"] });
		expect(state().selection.selected).toEqual(["b", "c"]);
		state().dispatchSelection({ type: "reset" });
		expect(state().selection).toEqual(initialSelection);
	});

	it("setViewerTarget accepts a value or an updater", () => {
		state().setViewerTarget(target);
		expect(state().viewerTarget).toEqual(target);
		state().setViewerTarget((current) => (current?.kind === "s3" ? { ...current, key: "b.txt" } : current));
		expect(state().viewerTarget).toEqual({ ...target, key: "b.txt" });
		state().setViewerTarget(null);
		expect(state().viewerTarget).toBeNull();
	});
});

describe("shell store dialogs", () => {
	it("opens one dialog at a time and closes it", () => {
		state().openDialog({ kind: "rename" });
		expect(state().dialog).toEqual({ kind: "rename" });
		state().openDialog({ kind: "connection", editingId: "c1" });
		expect(state().dialog).toEqual({ kind: "connection", editingId: "c1" });
		state().closeDialog();
		expect(state().dialog).toBeNull();
	});

	it("toggles the transfers drawer independently of dialogs", () => {
		state().openDialog({ kind: "delete" });
		state().toggleTransfers();
		expect(state().transfersOpen).toBe(true);
		expect(state().dialog).toEqual({ kind: "delete" });
		state().toggleTransfers();
		expect(state().transfersOpen).toBe(false);
	});

	it("reset restores the initial state", () => {
		state().selectBucket("c1", "b1");
		state().openDialog({ kind: "openUrl" });
		state().toggleTransfers();
		state().reset();
		expect(state().connectionId).toBeNull();
		expect(state().dialog).toBeNull();
		expect(state().transfersOpen).toBe(false);
		expect(state().paletteOpen).toBe(false);
	});

	it("controls paletteOpen independently and resets it", () => {
		expect(state().paletteOpen).toBe(false);
		state().setPaletteOpen(true);
		expect(state().paletteOpen).toBe(true);
		state().setPaletteOpen(false);
		expect(state().paletteOpen).toBe(false);
		state().setPaletteOpen(true);
		state().reset();
		expect(state().paletteOpen).toBe(false);
	});

	it("holds ids only, never server data", () => {
		state().openDialog({ kind: "connection", editingId: "c1" });
		const keys = Object.keys(state()).filter((k) => typeof (state() as never)[k] !== "function");
		expect(keys.sort()).toEqual(
			[
				"bucket",
				"connectionId",
				"dialog",
				"paletteOpen",
				"prefix",
				"selection",
				"transfersOpen",
				"viewerTarget",
				"viewMode",
			].sort(),
		);
	});
});

describe("shell store viewMode", () => {
	it("defaults to list viewMode", () => {
		expect(state().viewMode).toBe("list");
	});

	it("round-trips viewMode changes to localStorage", () => {
		state().setViewMode("grid");
		expect(state().viewMode).toBe("grid");
		const raw = localStorage.getItem("s3-view-mode");
		expect(raw).toBeTruthy();
		const parsed = JSON.parse(raw!);
		expect(parsed.state.viewMode).toBe("grid");
		expect(Object.keys(parsed.state)).toEqual(["viewMode"]);
	});

	it("falls back to list on an invalid stored value", () => {
		localStorage.setItem("s3-view-mode", JSON.stringify({ state: { viewMode: "unknown-mode" }, version: 0 }));
		useShellStore.persist.rehydrate();
		expect(state().viewMode).toBe("list");

		localStorage.setItem("s3-view-mode", JSON.stringify({ state: { viewMode: 123 }, version: 0 }));
		useShellStore.persist.rehydrate();
		expect(state().viewMode).toBe("list");

		localStorage.setItem("s3-view-mode", "corrupted-json");
		useShellStore.persist.rehydrate();
		expect(state().viewMode).toBe("list");
	});
});
