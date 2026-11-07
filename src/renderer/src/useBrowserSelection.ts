import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { initialSelection, keyboardAction, selectionReducer, type SelectionState } from "./selection";
import type { BrowserRow } from "./format";

export interface MoveDelta {
	up: number;
	down: number;
	left?: number;
	right?: number;
}

export interface UseBrowserSelectionOptions {
	connectionId: string;
	bucket: string;
	prefix: string;
	visibleRows: BrowserRow[];
	loading: boolean;
	selectedRowKeys?: string[];
	activeRowKey?: string | null;
	onSelectionChange?: (state: SelectionState) => void;
	onSelectRow?: (row: BrowserRow) => void;
	onOpenRow?: (row: BrowserRow) => void;
	onGridAction?: (action: string, row: BrowserRow | null) => void;
	onShortcut?: (action: string) => void;
	onQuickLook?: (row: BrowserRow) => void;
	onNavigate: (newPrefix: string) => void;
	pageSize: number;
	moveDelta: MoveDelta;
	getItemElement?: (key: string) => HTMLElement | null;
	containerRef: RefObject<HTMLElement | null>;
}

export function useBrowserSelection({
	connectionId,
	bucket,
	prefix,
	visibleRows,
	loading,
	selectedRowKeys: controlledSelectedRowKeys,
	activeRowKey: controlledActiveRowKey,
	onSelectionChange,
	onSelectRow,
	onOpenRow,
	onGridAction,
	onShortcut,
	onQuickLook,
	onNavigate,
	pageSize,
	moveDelta,
	getItemElement,
	containerRef,
}: UseBrowserSelectionOptions) {
	const [localSelection, setLocalSelection] = useState<SelectionState>(initialSelection);
	const [contextRow, setContextRow] = useState<BrowserRow | null>(null);
	const [contextOpen, setContextOpen] = useState(false);

	const [scope, setScope] = useState({ connectionId, bucket, prefix });
	if (scope.connectionId !== connectionId || scope.bucket !== bucket || scope.prefix !== prefix) {
		setScope({ connectionId, bucket, prefix });
		setLocalSelection(initialSelection);
	}

	const selectedKeys = controlledSelectedRowKeys ?? localSelection.selected;
	const activeRowKey = controlledActiveRowKey !== undefined ? controlledActiveRowKey : localSelection.active;

	const visibleKeys = useMemo(
		() => visibleRows.map((row) => (row.kind === "folder" ? row.prefix : row.key)),
		[visibleRows],
	);
	const activeIndex = activeRowKey ? visibleKeys.indexOf(activeRowKey) : -1;
	const activeRow = activeIndex >= 0 ? visibleRows[activeIndex] : null;
	const hasFolderSelected = selectedKeys.some((k) => visibleRows.some((r) => r.kind === "folder" && r.prefix === k));

	const updateSelection = useCallback(
		(next: SelectionState): void => {
			setLocalSelection(next);
			onSelectionChange?.(next);
			for (const key of next.selected) {
				const row = visibleRows.find(
					(candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === key,
				);
				if (row) onSelectRow?.(row);
			}
		},
		[visibleRows, onSelectionChange, onSelectRow],
	);

	const resetSelection = useCallback((): void => {
		updateSelection(initialSelection);
	}, [updateSelection]);

	useEffect(() => {
		if (loading) return;
		const existing = selectedKeys.filter((key) => visibleKeys.includes(key));
		if (existing.length !== selectedKeys.length) {
			const active = activeRowKey && existing.includes(activeRowKey) ? activeRowKey : (existing[0] ?? null);
			updateSelection({
				selected: existing,
				active,
				anchor: localSelection.anchor && existing.includes(localSelection.anchor) ? localSelection.anchor : active,
			});
		}
	}, [loading, selectedKeys, activeRowKey, localSelection.anchor, visibleKeys, updateSelection]);

	const handleItemClick = useCallback(
		(row: BrowserRow, event: MouseEvent): void => {
			const clickedKey = row.kind === "folder" ? row.prefix : row.key;
			const nextSelection = event.shiftKey
				? selectionReducer(
						{
							selected: selectedKeys,
							active: activeRowKey ?? clickedKey,
							anchor: localSelection.anchor ?? activeRowKey ?? clickedKey,
						},
						{ type: "range", key: clickedKey, keys: visibleKeys },
					)
				: event.ctrlKey || event.metaKey
					? selectionReducer(
							{
								selected: selectedKeys,
								active: activeRowKey ?? clickedKey,
								anchor: localSelection.anchor ?? clickedKey,
							},
							{ type: "toggle", key: clickedKey, keys: visibleKeys },
						)
					: selectionReducer(initialSelection, {
							type: "select",
							key: clickedKey,
							keys: visibleKeys,
						});
			updateSelection(nextSelection);
			onSelectRow?.(row);
		},
		[selectedKeys, activeRowKey, localSelection.anchor, visibleKeys, updateSelection, onSelectRow],
	);

	const handleItemDoubleClick = useCallback(
		(row: BrowserRow): void => {
			if (row.kind === "folder") {
				onNavigate(row.prefix);
			} else if (onOpenRow) {
				onOpenRow(row);
			} else {
				onGridAction?.("open", row);
			}
		},
		[onNavigate, onOpenRow, onGridAction],
	);

	const handleContextMenu = useCallback(
		(event: MouseEvent): void => {
			const element = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
			const key = element?.dataset.rowKey;
			const row =
				visibleRows.find((candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === key) ??
				null;
			setContextRow(row);
			if (row) onSelectRow?.(row);
			if (row && key && !selectedKeys.includes(key)) {
				updateSelection(selectionReducer(initialSelection, { type: "select", key, keys: visibleKeys }));
			}
		},
		[visibleRows, selectedKeys, visibleKeys, onSelectRow, updateSelection],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>): void => {
			const target = event.target as HTMLElement;
			if (target !== event.currentTarget && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
				return;
			}
			if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

			const { key, shiftKey, altKey } = event;

			if (!altKey && (key === "ArrowLeft" || key === "ArrowRight")) {
				if (moveDelta.left !== undefined && moveDelta.right !== undefined) {
					event.preventDefault();
					const delta = key === "ArrowLeft" ? moveDelta.left : moveDelta.right;
					updateSelection(
						selectionReducer(
							{ selected: selectedKeys, active: activeRowKey ?? null, anchor: localSelection.anchor },
							{ type: "move", delta, extend: shiftKey, keys: visibleKeys },
						),
					);
					return;
				}
			}

			if (key === "ArrowDown" || (key === "ArrowUp" && !altKey)) {
				event.preventDefault();
				const delta = key === "ArrowUp" ? moveDelta.up : moveDelta.down;
				updateSelection(
					selectionReducer(
						{ selected: selectedKeys, active: activeRowKey ?? null, anchor: localSelection.anchor },
						{ type: "move", delta, extend: shiftKey, keys: visibleKeys },
					),
				);
				return;
			}

			const action = keyboardAction({
				key: event.key,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				selectionCount: selectedKeys.length,
			});
			if (!action) return;
			event.preventDefault();

			const state = {
				selected: selectedKeys,
				active: activeRowKey ?? null,
				anchor: localSelection.anchor,
			};
			const selectedRow =
				selectedKeys.length === 1
					? (visibleRows.find(
							(candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === selectedKeys[0],
						) ?? null)
					: null;

			if (action === "page-up" || action === "page-down") {
				const delta = (action === "page-up" ? -1 : 1) * pageSize;
				updateSelection(
					selectionReducer(state, {
						type: "move",
						delta,
						keys: visibleKeys,
					}),
				);
			} else if (action === "home" || action === "end") {
				updateSelection(selectionReducer(state, { type: action, keys: visibleKeys }));
			} else if (action === "toggle" && activeRowKey) {
				updateSelection(
					selectionReducer(state, {
						type: "toggle",
						key: activeRowKey,
						keys: visibleKeys,
					}),
				);
			} else if (action === "quicklook") {
				const quickLookRow = activeRow ?? selectedRow;
				if (quickLookRow?.kind === "object") onQuickLook?.(quickLookRow);
			} else if (action === "select-all") {
				updateSelection(selectionReducer(initialSelection, { type: "all", keys: visibleKeys }));
			} else if (action === "clear") {
				updateSelection(initialSelection);
			} else if (action === "open") {
				const targetRow =
					visibleRows.find(
						(candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === selectedKeys[0],
					) ?? activeRow;
				if (targetRow) {
					if (targetRow.kind === "folder") {
						onNavigate(targetRow.prefix);
					} else if (onOpenRow) {
						onOpenRow(targetRow);
					} else {
						onGridAction?.("open", targetRow);
					}
				}
			} else if (action === "delete") {
				if (hasFolderSelected && selectedKeys.length > 1) {
					return;
				}
				onGridAction?.("delete", selectedRow);
				onShortcut?.("delete");
			} else if (action === "context-menu") {
				const targetRow =
					activeRow ??
					visibleRows.find(
						(candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === selectedKeys[0],
					) ??
					visibleRows[0] ??
					null;
				setContextRow(targetRow);
				const targetKey = targetRow ? (targetRow.kind === "folder" ? targetRow.prefix : targetRow.key) : null;
				const targetEl = targetKey
					? (getItemElement?.(targetKey) ??
						document.getElementById(`object-row-${encodeURIComponent(targetKey)}`) ??
						document.getElementById(`object-grid-cell-${encodeURIComponent(targetKey)}`))
					: containerRef.current;
				if (targetEl) {
					const rect = targetEl.getBoundingClientRect();
					const clientX = rect.left + (rect.width ? rect.width / 2 : 0);
					const clientY = rect.top + (rect.height ? rect.height / 2 : 0);
					targetEl.dispatchEvent(
						new MouseEvent("contextmenu", {
							bubbles: true,
							cancelable: true,
							clientX,
							clientY,
						}),
					);
				} else {
					setContextOpen(true);
				}
				onGridAction?.(action, targetRow);
			} else {
				onGridAction?.(action, selectedRow);
				onShortcut?.(action);
			}
		},
		[
			moveDelta,
			selectedKeys,
			activeRowKey,
			localSelection.anchor,
			visibleKeys,
			visibleRows,
			pageSize,
			activeRow,
			onQuickLook,
			onOpenRow,
			onGridAction,
			onNavigate,
			hasFolderSelected,
			onShortcut,
			getItemElement,
			containerRef,
			updateSelection,
		],
	);

	return {
		selectedKeys,
		activeRowKey,
		activeIndex,
		activeRow,
		hasFolderSelected,
		contextRow,
		setContextRow,
		contextOpen,
		setContextOpen,
		updateSelection,
		resetSelection,
		handleKeyDown,
		handleItemClick,
		handleItemDoubleClick,
		handleContextMenu,
	};
}
