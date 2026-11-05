import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type JSX,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { initialSelection, keyboardAction, selectionReducer, type SelectionState } from "../selection";
import type { ObjectsListResponse } from "../../../shared/ipc";
import { api, IpcErrorWrapper, unwrap } from "../api";
import {
	filterBrowserRows,
	formatBytes,
	isStaleResponse,
	mergeFoldersAndObjects,
	shouldAutoPage,
	shouldResetInFlight,
	type BrowserRow,
	type S3Item,
} from "../format";
import { SsoBanner } from "./SsoBanner";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import { Empty, EmptyDescription } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

export interface ObjectTableProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	onNavigate: (newPrefix: string) => void;
	searchResults?: S3Item[] | null;
	isSearchActive?: boolean;
	selectedRowKeys?: string[];
	activeRowKey?: string | null;
	onSelectionChange?: (state: SelectionState) => void;
	onGridAction?: (action: string, row: BrowserRow | null) => void;
	onOpenRow?: (row: BrowserRow) => void;
	onShortcut?: (action: string) => void;
	onSelectObject?: (item: S3Item) => void;
	onSelectRow?: (row: BrowserRow) => void;
	refreshTrigger?: number;
}

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

function formatDate(dateStr?: string): string {
	if (!dateStr) {
		return "—";
	}
	try {
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return dateStr;
	}
}

export function ObjectTable({
	connectionId,
	bucket,
	prefix,
	onNavigate,
	searchResults,
	isSearchActive = false,
	selectedRowKeys: controlledSelectedRowKeys,
	activeRowKey: controlledActiveRowKey,
	onSelectionChange,
	onGridAction,
	onOpenRow,
	onShortcut,
	onSelectObject,
	onSelectRow,
	refreshTrigger,
}: ObjectTableProps): JSX.Element {
	const [folders, setFolders] = useState<string[]>([]);
	const [objects, setObjects] = useState<S3Item[]>([]);
	const [nextToken, setNextToken] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState<boolean>(false);
	const [loadingMore, setLoadingMore] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [pageError, setPageError] = useState<string | null>(null);
	const [accessDenied, setAccessDenied] = useState<boolean>(false);
	const [ssoProfile, setSsoProfile] = useState<string | null>(null);

	const [filterText, setFilterText] = useState<string>("");
	const [localSelection, setLocalSelection] = useState<SelectionState>(initialSelection);
	const [contextRow, setContextRow] = useState<BrowserRow | null>(null);
	const [contextOpen, setContextOpen] = useState(false);
	const selectedKeys = controlledSelectedRowKeys ?? localSelection.selected;
	const activeRowKey = controlledActiveRowKey !== undefined ? controlledActiveRowKey : localSelection.active;

	const requestIdRef = useRef<number>(0);
	const currentPrefixRef = useRef<string>(prefix);
	const parentRef = useRef<HTMLDivElement>(null);
	const inFlightRef = useRef<boolean>(false);
	const nextTokenRef = useRef<string | undefined>(undefined);

	nextTokenRef.current = nextToken;

	useEffect(() => {
		setLocalSelection(initialSelection);
	}, [connectionId, bucket, prefix]);

	const loadFirstPage = useCallback(async (): Promise<void> => {
		if (isSearchActive) {
			return;
		}
		requestIdRef.current += 1;
		currentPrefixRef.current = prefix;
		const thisRequestId = requestIdRef.current;
		const thisPrefix = prefix;

		setLoading(true);
		setLoadingMore(false);
		setError(null);
		setPageError(null);
		setAccessDenied(false);
		setSsoProfile(null);
		setFolders([]);
		setObjects([]);
		setNextToken(undefined);
		setFilterText("");
		setLocalSelection(initialSelection);
		inFlightRef.current = true;

		try {
			const res = await api.objects.list({
				connectionId,
				bucket,
				prefix,
			});
			const data: ObjectsListResponse = unwrap(res);

			if (
				isStaleResponse(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				return;
			}

			setFolders(data.folders);
			setObjects(data.objects);
			setNextToken(data.nextToken);
		} catch (err: unknown) {
			if (
				isStaleResponse(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				return;
			}

			if (err instanceof IpcErrorWrapper) {
				if (err.code === "ACCESS_DENIED") {
					setAccessDenied(true);
				} else if (err.code === "SSO_LOGIN_REQUIRED") {
					setSsoProfile(err.profile || "default");
				} else {
					setError(err.message);
				}
			} else if (err instanceof Error) {
				setError(err.message);
			} else {
				setError("Failed to load objects.");
			}
		} finally {
			if (
				shouldResetInFlight(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				inFlightRef.current = false;
				setLoading(false);
			}
		}
	}, [connectionId, bucket, prefix, isSearchActive]);

	useEffect(() => {
		void loadFirstPage();
	}, [loadFirstPage, refreshTrigger]);

	const loadNextPage = useCallback(async (): Promise<void> => {
		const currentToken = nextTokenRef.current;
		if (
			isSearchActive ||
			!currentToken ||
			inFlightRef.current ||
			loadingMore
		) {
			return;
		}

		const thisRequestId = requestIdRef.current;
		const thisPrefix = prefix;
		inFlightRef.current = true;
		setLoadingMore(true);
		setPageError(null);

		try {
			const res = await api.objects.list({
				connectionId,
				bucket,
				prefix,
				token: currentToken,
			});
			const data: ObjectsListResponse = unwrap(res);

			if (
				isStaleResponse(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				return;
			}

			setFolders((prev) => [...prev, ...data.folders]);
			setObjects((prev) => [...prev, ...data.objects]);
			setNextToken(data.nextToken);
		} catch (err: unknown) {
			if (
				!isStaleResponse(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				if (
					err instanceof IpcErrorWrapper &&
					err.code === "SSO_LOGIN_REQUIRED"
				) {
					setSsoProfile(err.profile || "default");
				} else if (err instanceof Error) {
					setPageError(err.message);
				} else {
					setPageError("Failed to load next page.");
				}
			}
		} finally {
			if (
				shouldResetInFlight(
					requestIdRef.current,
					currentPrefixRef.current,
					thisRequestId,
					thisPrefix,
				)
			) {
				inFlightRef.current = false;
				setLoadingMore(false);
			}
		}
	}, [connectionId, bucket, prefix, isSearchActive, loadingMore]);

	// Prepare rows: search results mode vs directory browsing mode
	const rawRows: BrowserRow[] = isSearchActive
		? (searchResults || []).map((obj) => ({
				kind: "object",
				name: obj.key,
				key: obj.key,
				size: obj.size,
				lastModified: obj.lastModified,
				etag: obj.etag,
			}))
		: mergeFoldersAndObjects(prefix, folders, objects);

	const visibleRows = filterBrowserRows(rawRows, filterText);

	const rowVirtualizer = useVirtualizer({
		count: visibleRows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	const virtualItems = rowVirtualizer.getVirtualItems();
	const visibleKeys = visibleRows.map((row) => row.kind === "folder" ? row.prefix : row.key);
	const activeIndex = activeRowKey ? visibleKeys.indexOf(activeRowKey) : -1;
	useEffect(() => {
		if (activeIndex >= 0) rowVirtualizer.scrollToIndex(activeIndex, { align: "auto" });
	}, [activeIndex, rowVirtualizer]);
	const updateSelection = (next: SelectionState): void => {
		setLocalSelection(next);
		onSelectionChange?.(next);
		for (const key of next.selected) {
			const row = visibleRows.find((candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === key);
			if (row) onSelectRow?.(row);
		}
	};
	useEffect(() => {
		if (loading) return;
		const existing = selectedKeys.filter((key) => visibleKeys.includes(key));
		if (existing.length !== selectedKeys.length) {
			const active = activeRowKey && existing.includes(activeRowKey) ? activeRowKey : existing[0] ?? null;
			updateSelection({ selected: existing, active, anchor: localSelection.anchor && existing.includes(localSelection.anchor) ? localSelection.anchor : active });
		}
	}, [loading, selectedKeys, activeRowKey, localSelection.anchor, visibleRows]);
	const activeRow = activeIndex >= 0 ? visibleRows[activeIndex] : null;
	const hasFolderSelected = selectedKeys.some((k) =>
		visibleRows.some((r) => r.kind === "folder" && r.prefix === k),
	);
	const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
		const target = event.target as HTMLElement;
		if (
			target !== event.currentTarget &&
			/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)
		) {
			return;
		}
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

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
		const visibleRowCount = Math.max(
			1,
			Math.floor((parentRef.current?.clientHeight || 0) / ROW_HEIGHT),
		);
		const selectedRow =
			selectedKeys.length === 1
				? (visibleRows.find(
						(candidate) =>
							(candidate.kind === "folder"
								? candidate.prefix
								: candidate.key) === selectedKeys[0],
					) ?? null)
				: null;
		if (["move-up", "move-down", "extend-up", "extend-down"].includes(action)) {
			updateSelection(
				selectionReducer(state, {
					type: "move",
					delta: action.endsWith("up") ? -1 : 1,
					extend: action.startsWith("extend"),
					keys: visibleKeys,
				}),
			);
		} else if (action === "page-up" || action === "page-down") {
			updateSelection(
				selectionReducer(state, {
					type: "move",
					delta: action === "page-up" ? -1 : 1,
					page: true,
					pageSize: visibleRowCount,
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
		} else if (action === "select-all") {
			updateSelection(selectionReducer(initialSelection, { type: "all", keys: visibleKeys }));
		} else if (action === "clear") {
			updateSelection(initialSelection);
		} else if (action === "open") {
			const targetRow =
				visibleRows.find(
					(candidate) =>
						(candidate.kind === "folder"
							? candidate.prefix
							: candidate.key) === selectedKeys[0],
				) ?? activeRow;
			if (targetRow) {
				if (onOpenRow) {
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
					(candidate) =>
						(candidate.kind === "folder"
							? candidate.prefix
							: candidate.key) === selectedKeys[0],
				) ??
				visibleRows[0] ??
				null;
			setContextRow(targetRow);
			const targetKey = targetRow
				? targetRow.kind === "folder"
					? targetRow.prefix
					: targetRow.key
				: null;
			const rowEl = targetKey
				? document.getElementById(
						`object-row-${encodeURIComponent(targetKey)}`,
					)
				: parentRef.current;
			if (rowEl) {
				const rect = rowEl.getBoundingClientRect();
				const clientX = rect.left + (rect.width ? rect.width / 2 : 0);
				const clientY = rect.top + (rect.height ? rect.height / 2 : 0);
				rowEl.dispatchEvent(
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
	};

	useEffect(() => {
		if (virtualItems.length === 0) {
			return;
		}
		const lastVirtual = virtualItems[virtualItems.length - 1];
		if (
			shouldAutoPage(
				isSearchActive,
				Boolean(pageError),
				Boolean(nextToken),
				inFlightRef.current || loadingMore,
				lastVirtual.index,
				visibleRows.length,
			)
		) {
			void loadNextPage();
		}
	}, [
		virtualItems,
		visibleRows.length,
		nextToken,
		loadingMore,
		isSearchActive,
		pageError,
		loadNextPage,
	]);

	if (accessDenied) {
		return (
			<div className="app-access-denied-pane">
				<div className="tds-announcement tds-announcement--error app-pane-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__title">
							Access denied
						</div>
						<div className="tds-announcement__message">
							You do not have permission to access bucket &quot;
							{bucket}&quot;.
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (ssoProfile) {
		return (
			<div className="app-access-denied-pane">
				<SsoBanner
					profile={ssoProfile}
					onSignedIn={() => {
						setSsoProfile(null);
						void loadFirstPage();
					}}
				/>
			</div>
		);
	}

	return (
		<div className="app-object-table-container">
			{error && (
				<div className="tds-announcement tds-announcement--error app-pane-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">{error}</div>
					</div>
				</div>
			)}

			{pageError && (
				<div className="tds-announcement tds-announcement--error app-pane-banner">
					<div className="tds-announcement__content">
						<div className="tds-announcement__message">
							{pageError}
						</div>
					</div>
					<div className="tds-announcement__actions">
						<button
							type="button"
							className="tds-btn tds-btn--sm tds-btn--secondary"
							onClick={() => {
								setPageError(null);
								void loadNextPage();
							}}
						>
							Retry
						</button>
					</div>
				</div>
			)}

			<div className="app-object-table-toolbar">
				<div className="tds-text-input app-filter-input-wrapper">
					<input
						type="text"
						className="tds-text-input__field app-filter-field"
						value={filterText}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							setFilterText(e.target.value);
							updateSelection(initialSelection);
						}}
						placeholder="Filter loaded rows by name..."
						aria-label="Filter loaded rows by name"
					/>
				</div>
				<div className="app-table-counts">
					<span>
						{visibleRows.length.toLocaleString()}{" "}
						{visibleRows.length === 1 ? "item" : "items"}
					</span>
					{filterText.trim() && (
						<span className="app-filter-match-count">
							(filtered from {rawRows.length.toLocaleString()})
						</span>
					)}
				</div>
			</div>

			<ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
			<ContextMenuTrigger asChild>
			<div
				className="tds-data-table-container app-table-scroll-container"
				role="grid"
				tabIndex={0}
				aria-busy={loading ? "true" : undefined}
				aria-multiselectable="true"
				aria-activedescendant={activeRowKey ? `object-row-${encodeURIComponent(activeRowKey)}` : undefined}
				aria-rowcount={visibleRows.length + 1}
				onKeyDown={handleGridKeyDown}
				onContextMenu={(event) => {
					const element = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
					const key = element?.dataset.rowKey;
					const row = visibleRows.find((candidate) => (candidate.kind === "folder" ? candidate.prefix : candidate.key) === key) ?? null;
					setContextRow(row);
					if (row) onSelectRow?.(row);
					if (row && key && !selectedKeys.includes(key)) updateSelection(selectionReducer(initialSelection, { type: "select", key, keys: visibleKeys }));
				}}
			>
				<div
					className="tds-data-table__header-row app-table-header-grid"
					role="row"
					aria-rowindex={1}
				>
					<div
						className="app-table-col app-table-col--name"
						role="columnheader"
					>
						Name
					</div>
					<div
						className="app-table-col app-table-col--size"
						role="columnheader"
					>
						Size
					</div>
					<div
						className="app-table-col app-table-col--modified"
						role="columnheader"
					>
						Last modified
					</div>
				</div>

				<div ref={parentRef} className="app-table-virtual-viewport">
					{loading && visibleRows.length === 0 ? (
						<div
							className="app-table-loading-state"
							role="status"
							aria-live="polite"
							aria-busy="true"
							aria-label="Loading objects"
						>
							<span className="sr-only">Loading objects...</span>
							{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="tds-data-table__skeleton" />)}
						</div>
					) : visibleRows.length === 0 ? (
						<Empty className="app-table-empty-state" role="status">
							<EmptyDescription>{filterText.trim() ? "No matching items found." : isSearchActive ? "No objects matched your search." : prefix ? "This folder is empty." : "This bucket is empty."}</EmptyDescription>
						</Empty>
					) : (
						<div
							style={{
								height: `${rowVirtualizer.getTotalSize()}px`,
								width: "100%",
								position: "relative",
							}}
						>
							{virtualItems.map((virtualRow) => {
								const row = visibleRows[virtualRow.index];
								const rowKey =
									row.kind === "folder"
										? row.prefix
										: row.key;
								const isSelected = selectedKeys.includes(rowKey);

								return (
									<div
										key={rowKey}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
										id={`object-row-${encodeURIComponent(rowKey)}`}
										className={`app-table-row-grid ${row.kind === "folder" ? "app-table-row-grid--folder" : "app-table-row-grid--object"} ${isSelected ? "app-table-row-grid--selected" : ""}`}
										role="row"
										tabIndex={-1}
										aria-rowindex={virtualRow.index + 2}
										aria-selected={isSelected}
										data-row-key={rowKey}
										onClick={(event) => {
											const clickedKey = row.kind === "folder" ? row.prefix : row.key;
											const nextSelection = event.shiftKey ? selectionReducer({ selected: selectedKeys, active: activeRowKey ?? clickedKey, anchor: localSelection.anchor ?? activeRowKey ?? clickedKey }, { type: "range", key: clickedKey, keys: visibleKeys }) : event.ctrlKey || event.metaKey ? selectionReducer({ selected: selectedKeys, active: activeRowKey ?? clickedKey, anchor: localSelection.anchor ?? clickedKey }, { type: "toggle", key: clickedKey, keys: visibleKeys }) : selectionReducer(initialSelection, { type: "select", key: clickedKey, keys: visibleKeys });
											updateSelection(nextSelection);
											if (row.kind === "folder") {
												onSelectRow?.(row);
											} else {
												onSelectObject?.({
													key: row.key,
													size: row.size,
													lastModified: row.lastModified,
													etag: row.etag,
												});
												onSelectRow?.(row);
											}
										}}
										onDoubleClick={() => {
											if (row.kind === "folder") onNavigate(row.prefix);
											else onOpenRow?.(row);
										}}
									>
										<div
											className="app-table-cell app-table-col--name"
											role="cell"
										>
											<span
												className="app-row-icon"
												aria-hidden="true"
											>
												{row.kind === "folder" ? (
													<svg
														width="16"
														height="16"
														viewBox="0 0 16 16"
														fill="currentColor"
													>
														<path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v7A1.5 1.5 0 0 0 1.5 13h13a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 5H8.707l-1.854-1.854A.5.5 0 0 0 6.5 3H1.5z" />
													</svg>
												) : (
													<svg
														width="16"
														height="16"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														strokeWidth="1.5"
													>
														<path d="M3 2h7l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
														<path d="M10 2v4h4" />
													</svg>
												)}
											</span>
											<span className="app-row-name">
												{row.name}
											</span>
										</div>
										<div
											className="app-table-cell app-table-col--size"
											role="cell"
										>
											{row.kind === "object"
												? formatBytes(row.size)
												: "—"}
										</div>
										<div
											className="app-table-cell app-table-col--modified"
											role="cell"
										>
											{row.kind === "object"
												? formatDate(row.lastModified)
												: "—"}
										</div>
									</div>
								);
							})}
						</div>
					)}
			</div>

				{loadingMore && (
					<div className="app-table-loading-more">
						<div className="tds-spinner tds-spinner--xs" />
						<span>Loading more objects...</span>
					</div>
				)}
			</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					{selectedKeys.length > 1 ? (
						hasFolderSelected ? (
							<ContextMenuItem disabled>
								Delete (folders cannot be multi-deleted)
							</ContextMenuItem>
						) : (
							<ContextMenuItem
								onSelect={() => onGridAction?.("delete", null)}
							>
								{`Delete ${selectedKeys.length} objects`}
							</ContextMenuItem>
						)
					) : contextRow?.kind === "object" ? (
						<>
							<ContextMenuItem onSelect={() => onOpenRow ? onOpenRow(contextRow) : onGridAction?.("open", contextRow)}>
								Open
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("system-open", contextRow)}>
								Open with system app
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("download", contextRow)}>
								Download
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("rename", contextRow)}>
								Rename or move
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("delete", contextRow)}>
								Delete
							</ContextMenuItem>
						</>
					) : contextRow?.kind === "folder" ? (
						<>
							<ContextMenuItem onSelect={() => onNavigate(contextRow.prefix)}>
								Open
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("rename", contextRow)}>
								Rename folder
							</ContextMenuItem>
							<ContextMenuItem onSelect={() => onGridAction?.("delete", contextRow)}>
								Delete folder
							</ContextMenuItem>
						</>
					) : null}
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}
