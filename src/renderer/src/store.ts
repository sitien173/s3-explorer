import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialSelection, selectionReducer, type SelectionAction, type SelectionState } from "./selection";

export type ViewMode = "list" | "grid";

export const VIEW_MODE_STORAGE_KEY = "s3-view-mode";

export interface ViewerTargetS3 {
	kind: "s3";
	connectionId: string;
	bucket: string;
	key: string;
	size?: number;
	fileName?: string;
}

export interface ViewerTargetStream {
	kind: "stream";
	url: string;
	contentType: string;
	size: number;
	fileName: string;
	key?: string;
}

export type ViewerTarget = ViewerTargetS3 | ViewerTargetStream;

export type ShellDialog =
	| { kind: "connection"; editingId: string | null }
	| { kind: "openUrl" | "newFolder" | "rename" | "delete" | "report" };

export interface ShellState {
	connectionId: string | null;
	bucket: string | null;
	prefix: string;
	selection: SelectionState;
	viewerTarget: ViewerTarget | null;
	dialog: ShellDialog | null;
	transfersOpen: boolean;
	paletteOpen: boolean;
	viewMode: ViewMode;
	selectConnection: (connectionId: string | null) => void;
	selectBucket: (connectionId: string, bucket: string) => void;
	navigate: (prefix: string) => void;
	dispatchSelection: (action: SelectionAction) => void;
	setViewerTarget: (next: ViewerTarget | null | ((current: ViewerTarget | null) => ViewerTarget | null)) => void;
	openDialog: (dialog: ShellDialog) => void;
	closeDialog: () => void;
	toggleTransfers: () => void;
	setPaletteOpen: (open: boolean) => void;
	setViewMode: (viewMode: ViewMode) => void;
	reset: () => void;
}

const initialState = {
	connectionId: null,
	bucket: null,
	prefix: "",
	selection: initialSelection,
	viewerTarget: null,
	dialog: null,
	transfersOpen: false,
	paletteOpen: false,
	viewMode: "list" as ViewMode,
};

const cleared = { selection: initialSelection, viewerTarget: null };

export const useShellStore = create<ShellState>()(
	persist(
		(set) => ({
			...initialState,
			selectConnection: (connectionId) => set({ connectionId, bucket: null, prefix: "", ...cleared }),
			selectBucket: (connectionId, bucket) => set({ connectionId, bucket, prefix: "", ...cleared }),
			navigate: (prefix) => set({ prefix, ...cleared }),
			dispatchSelection: (action) => set((s) => ({ selection: selectionReducer(s.selection, action) })),
			setViewerTarget: (next) =>
				set((s) => ({ viewerTarget: typeof next === "function" ? next(s.viewerTarget) : next })),
			openDialog: (dialog) => set({ dialog }),
			closeDialog: () => set({ dialog: null }),
			toggleTransfers: () => set((s) => ({ transfersOpen: !s.transfersOpen })),
			setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
			setViewMode: (viewMode) => set({ viewMode }),
			reset: () => set(initialState),
		}),
		{
			name: VIEW_MODE_STORAGE_KEY,
			partialize: (state) => ({ viewMode: state.viewMode }),
			merge: (persistedState, currentState) => {
				const candidate = (persistedState as { viewMode?: unknown } | null | undefined)?.viewMode;
				const viewMode: ViewMode = candidate === "grid" ? "grid" : "list";
				return { ...currentState, viewMode };
			},
		},
	),
);
