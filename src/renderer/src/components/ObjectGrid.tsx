import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Folder, FileText, FileImage, FileVideo, FileAudio, type LucideIcon } from "lucide-react";
import type { SelectionState } from "../selection";
import { api, unwrap } from "../api";
import { shouldAutoPage, type BrowserRow, type S3Item } from "../format";
import { mediaKind } from "../mediaKind";
import { useThumbnailScheduler } from "../thumbnails";
import { useShellStore, type ViewerTarget } from "../store";
import { useObjectListing } from "../useObjectListing";
import { useBrowserSelection } from "../useBrowserSelection";
import { ObjectContextMenuItems } from "./ObjectContextMenuItems";
import { ObjectAccessDenied, ObjectSsoFallback } from "./ObjectListingFallbacks";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "./ui/context-menu";
import { Empty, EmptyDescription } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";
import { AlertDescription, BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

export const CELL_WIDTH = 120;
export const CELL_HEIGHT = 120;
export const GRID_OVERSCAN_ROWS = 1;

export interface ObjectGridProps {
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
	onSelectRow?: (row: BrowserRow) => void;
	onQuickLook?: (row: BrowserRow) => void;
	onVisibleRowsChange?: (rows: BrowserRow[]) => void;
	viewerTarget?: ViewerTarget | null;
	openStream?: (target: { connectionId: string; bucket: string; key: string }) => Promise<{ url: string }>;
	loadImage?: (url: string, signal?: AbortSignal) => Promise<void>;
}

function getMediaIcon(key: string): LucideIcon {
	const kind = mediaKind("", key);
	switch (kind) {
		case "image":
			return FileImage;
		case "video":
			return FileVideo;
		case "audio":
			return FileAudio;
		default:
			return FileText;
	}
}

export function ObjectGrid({
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
	onSelectRow,
	onQuickLook,
	onVisibleRowsChange,
	viewerTarget: controlledViewerTarget,
	openStream,
	loadImage,
}: ObjectGridProps): JSX.Element {
	const storeViewerTarget = useShellStore((s) => s.viewerTarget);
	const viewerTarget = controlledViewerTarget !== undefined ? controlledViewerTarget : storeViewerTarget;
	const [containerWidth, setContainerWidth] = useState<number>(0);

	const resizeObserverRef = useRef<ResizeObserver | null>(null);
	const parentRef = useRef<HTMLDivElement | null>(null);

	const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
		if (resizeObserverRef.current) {
			resizeObserverRef.current.disconnect();
			resizeObserverRef.current = null;
		}
		parentRef.current = node;
		if (node) {
			const update = () => {
				if (node.clientWidth > 0) {
					setContainerWidth(Math.max(0, node.clientWidth - 24));
				}
			};
			update();
			if (typeof ResizeObserver !== "undefined") {
				const ro = new ResizeObserver(() => update());
				ro.observe(node);
				resizeObserverRef.current = ro;
			}
		}
	}, []);

	useEffect(() => {
		return () => {
			resizeObserverRef.current?.disconnect();
			resizeObserverRef.current = null;
		};
	}, []);

	const {
		listing,
		hasNextPage,
		loading,
		loadingMore,
		accessDenied,
		ssoProfile,
		error,
		pageError,
		rawRows,
		visibleRows,
		filterText,
		setFilterText,
	} = useObjectListing({
		connectionId,
		bucket,
		prefix,
		searchResults,
		isSearchActive,
	});

	const width =
		containerWidth || (parentRef.current?.clientWidth ? Math.max(0, parentRef.current.clientWidth - 24) : 800 - 24);
	const columns = Math.max(1, Math.floor(width / CELL_WIDTH));
	const rowCount = Math.ceil(visibleRows.length / columns);
	const visibleRowCount = Math.max(1, Math.floor((parentRef.current?.clientHeight || 0) / CELL_HEIGHT));

	const {
		selectedKeys,
		activeRowKey,
		activeIndex,
		contextRow,
		contextOpen,
		setContextOpen,
		resetSelection,
		handleKeyDown,
		handleItemClick,
		handleItemDoubleClick,
		handleContextMenu,
		hasFolderSelected,
	} = useBrowserSelection({
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
		pageSize: visibleRowCount * columns,
		moveDelta: { up: -columns, down: columns, left: -1, right: 1 },
		getItemElement: (key) => document.getElementById(`object-grid-cell-${encodeURIComponent(key)}`),
		containerRef: parentRef,
	});

	const rowVirtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => parentRef.current,
		estimateSize: () => CELL_HEIGHT,
		overscan: GRID_OVERSCAN_ROWS,
		initialRect: { width: 800, height: 400 },
		observeElementRect: (instance, cb) => {
			const el = instance.scrollElement;
			if (!el) return;
			const update = () => {
				const rect = el.getBoundingClientRect();
				const width = rect.width || el.clientWidth || 800;
				const height = rect.height || el.clientHeight || 400;
				cb({ width, height });
			};
			update();
			if (typeof ResizeObserver !== "undefined") {
				const observer = new ResizeObserver(update);
				observer.observe(el);
				return () => observer.disconnect();
			}
			return () => {};
		},
	});

	useEffect(() => {
		onVisibleRowsChange?.(visibleRows);
	});

	const virtualItems = rowVirtualizer.getVirtualItems();

	const trulyVisibleRows = useMemo(() => {
		const result: BrowserRow[] = [];
		const scrollTop = parentRef.current ? parentRef.current.scrollTop : 0;
		const clientHeight = parentRef.current?.clientHeight || 400;
		const topPadding = 12;
		for (const virtualRow of virtualItems) {
			const isVisible =
				virtualRow.start + virtualRow.size + topPadding > scrollTop &&
				virtualRow.start + topPadding < scrollTop + clientHeight;
			if (isVisible) {
				const rowStartIndex = virtualRow.index * columns;
				const rowEndIndex = Math.min(visibleRows.length, rowStartIndex + columns);
				for (let i = rowStartIndex; i < rowEndIndex; i++) {
					result.push(visibleRows[i]);
				}
			}
		}
		return result;
	}, [virtualItems, columns, visibleRows]);

	const visibleKeyString = trulyVisibleRows.map((r) => (r.kind === "folder" ? r.prefix : r.key)).join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: memoize stably on visible key string
	const stableTrulyVisibleRows = useMemo(() => trulyVisibleRows, [visibleKeyString]);

	const defaultOpenStream = useCallback(async (target: { connectionId: string; bucket: string; key: string }) => {
		return unwrap(await api.stream.open(target));
	}, []);
	const activeOpenStream = openStream ?? defaultOpenStream;

	const {
		thumbnails,
		onScroll: onThumbnailScroll,
		markThumbnailError,
	} = useThumbnailScheduler({
		connectionId,
		bucket,
		prefix,
		visibleRows: stableTrulyVisibleRows,
		viewerTarget,
		openStream: activeOpenStream,
		loadImage,
	});

	const activeRowVirtualIndex = activeIndex >= 0 ? Math.floor(activeIndex / columns) : -1;

	useEffect(() => {
		if (activeRowVirtualIndex >= 0) {
			rowVirtualizer.scrollToIndex(activeRowVirtualIndex, { align: "auto" });
		}
	}, [activeRowVirtualIndex, rowVirtualizer]);

	useEffect(() => {
		if (virtualItems.length === 0) return;
		const lastVirtual = virtualItems[virtualItems.length - 1];
		const lastIndex = Math.min(visibleRows.length - 1, (lastVirtual.index + 1) * columns - 1);
		if (
			shouldAutoPage(isSearchActive, Boolean(pageError), hasNextPage, listing.isFetching, lastIndex, visibleRows.length)
		) {
			void listing.fetchNextPage();
		}
	}, [
		virtualItems,
		columns,
		visibleRows.length,
		hasNextPage,
		listing.isFetching,
		isSearchActive,
		pageError,
		listing.fetchNextPage,
	]);

	if (accessDenied) {
		return <ObjectAccessDenied bucket={bucket} />;
	}

	if (ssoProfile) {
		return (
			<ObjectSsoFallback
				profile={ssoProfile}
				onSignedIn={() => {
					void listing.refetch();
				}}
			/>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{error && (
				<div className={cn("m-3", BANNER_DESTRUCTIVE_CLASS)}>
					<div className="min-w-0 flex-1">
						<AlertDescription>{error}</AlertDescription>
					</div>
				</div>
			)}

			{pageError && (
				<div className={cn("m-3", BANNER_DESTRUCTIVE_CLASS)}>
					<div className="min-w-0 flex-1">
						<AlertDescription>{pageError}</AlertDescription>
					</div>
					<div className="flex shrink-0 items-center">
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={() => {
								void listing.fetchNextPage();
							}}
						>
							Retry
						</Button>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between border-b border-separator bg-background px-4 py-2">
				<div className="w-70">
					<Input
						type="text"
						value={filterText}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							setFilterText(e.target.value);
							resetSelection();
						}}
						placeholder="Filter loaded rows by name..."
						aria-label="Filter loaded rows by name"
					/>
				</div>
				<div className="flex items-center gap-1 text-sm text-foreground-secondary">
					<span>
						{visibleRows.length.toLocaleString()} {visibleRows.length === 1 ? "item" : "items"}
					</span>
					{filterText.trim() && <span>(filtered from {rawRows.length.toLocaleString()})</span>}
				</div>
			</div>

			<ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
				<ContextMenuTrigger
					className="flex flex-1 flex-col overflow-hidden rounded-none border-none outline-none"
					role="grid"
					tabIndex={0}
					aria-busy={loading ? "true" : undefined}
					aria-multiselectable="true"
					aria-activedescendant={activeRowKey ? `object-grid-cell-${encodeURIComponent(activeRowKey)}` : undefined}
					aria-rowcount={rowCount}
					aria-colcount={columns}
					onKeyDown={handleKeyDown}
					onContextMenu={handleContextMenu}
				>
					<div ref={containerCallbackRef} onScroll={onThumbnailScroll} className="relative flex-1 overflow-y-auto p-3">
						{loading && visibleRows.length === 0 ? (
							<div
								className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-foreground-secondary"
								role="status"
								aria-live="polite"
								aria-busy="true"
								aria-label="Loading objects"
							>
								<span className="sr-only">Loading objects...</span>
								<div className="grid grid-cols-4 gap-3 w-full max-w-lg">
									{Array.from({ length: 8 }, (_, index) => (
										<Skeleton key={index} className="h-28 rounded-surface" />
									))}
								</div>
							</div>
						) : visibleRows.length === 0 ? (
							<Empty
								className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-foreground-secondary"
								role="status"
							>
								<EmptyDescription>
									{filterText.trim()
										? "No matching items found."
										: isSearchActive
											? "No objects matched your search."
											: prefix
												? "This folder is empty."
												: "This bucket is empty."}
								</EmptyDescription>
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
									const rowStartIndex = virtualRow.index * columns;
									const rowEndIndex = Math.min(visibleRows.length, rowStartIndex + columns);
									const rowItems = visibleRows.slice(rowStartIndex, rowEndIndex);

									return (
										<div
											key={virtualRow.index}
											role="row"
											tabIndex={-1}
											aria-rowindex={virtualRow.index + 1}
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												height: `${virtualRow.size}px`,
												transform: `translateY(${virtualRow.start}px)`,
												display: "grid",
												gridTemplateColumns: `repeat(${columns}, ${CELL_WIDTH}px)`,
												gap: "0px",
											}}
										>
											{rowItems.map((row, colIndex) => {
												const rowKey = row.kind === "folder" ? row.prefix : row.key;
												const isSelected = selectedKeys.includes(rowKey);
												const thumbnail = row.kind === "object" ? thumbnails[row.key] : undefined;

												return (
													// biome-ignore lint/a11y/useKeyWithClickEvents: grid container handles Arrow, Enter, and Space
													<div
														key={rowKey}
														role="gridcell"
														aria-colindex={colIndex + 1}
														aria-selected={isSelected}
														id={`object-grid-cell-${encodeURIComponent(rowKey)}`}
														data-row-key={rowKey}
														tabIndex={-1}
														className={cn(
															"group relative m-1 flex flex-col items-center justify-between rounded-surface p-2 cursor-pointer select-none transition-colors",
															"hover:bg-foreground/[0.06]",
															isSelected && "bg-selection ring-2 ring-accent",
														)}
														onClick={(event) => handleItemClick(row, event)}
														onDoubleClick={() => handleItemDoubleClick(row)}
													>
														<div className="flex flex-1 items-center justify-center w-full min-h-0 text-foreground-secondary">
															{row.kind === "folder" ? (
																<Folder className="size-10 text-accent" aria-hidden="true" />
															) : thumbnail?.status === "loaded" && thumbnail.url ? (
																<img
																	src={thumbnail.url}
																	loading="lazy"
																	decoding="async"
																	alt=""
																	onError={() => markThumbnailError(row.key)}
																	className="size-16 object-contain rounded-control"
																/>
															) : (
																(() => {
																	const MediaIcon = getMediaIcon(row.key);
																	return <MediaIcon className="size-10 text-foreground-secondary" aria-hidden="true" />;
																})()
															)}
														</div>
														<span className="w-full text-center text-xs text-foreground line-clamp-2 break-all leading-tight">
															{row.name}
														</span>
													</div>
												);
											})}
										</div>
									);
								})}
							</div>
						)}
					</div>

					{loadingMore && (
						<div className="flex items-center justify-center gap-2 border-t border-separator bg-surface p-1 text-sm text-foreground-secondary">
							<Spinner />
							<span>Loading more objects...</span>
						</div>
					)}
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ObjectContextMenuItems
						selectedKeys={selectedKeys}
						hasFolderSelected={hasFolderSelected}
						contextRow={contextRow}
						onGridAction={onGridAction}
						onOpenRow={onOpenRow}
						onNavigate={onNavigate}
					/>
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}
