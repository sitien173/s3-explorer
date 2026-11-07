import { useEffect, useRef, type ChangeEvent, type JSX } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SelectionState } from "../selection";
import { formatBytes, shouldAutoPage, type BrowserRow, type S3Item } from "../format";
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
	onSelectRow?: (row: BrowserRow) => void;
	onQuickLook?: (row: BrowserRow) => void;
	onVisibleRowsChange?: (rows: BrowserRow[]) => void;
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
	onSelectRow,
	onQuickLook,
	onVisibleRowsChange,
}: ObjectTableProps): JSX.Element {
	const parentRef = useRef<HTMLDivElement>(null);

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

	const visibleRowCount = Math.max(1, Math.floor((parentRef.current?.clientHeight || 0) / ROW_HEIGHT));

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
		pageSize: visibleRowCount,
		moveDelta: { up: -1, down: 1 },
		containerRef: parentRef,
	});

	const rowVirtualizer = useVirtualizer({
		count: visibleRows.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: OVERSCAN,
	});

	useEffect(() => {
		onVisibleRowsChange?.(visibleRows);
	});

	const virtualItems = rowVirtualizer.getVirtualItems();

	useEffect(() => {
		if (activeIndex >= 0) rowVirtualizer.scrollToIndex(activeIndex, { align: "auto" });
	}, [activeIndex, rowVirtualizer]);

	useEffect(() => {
		if (virtualItems.length === 0) {
			return;
		}
		const lastVirtual = virtualItems[virtualItems.length - 1];
		if (
			shouldAutoPage(
				isSearchActive,
				Boolean(pageError),
				hasNextPage,
				listing.isFetching,
				lastVirtual.index,
				visibleRows.length,
			)
		) {
			void listing.fetchNextPage();
		}
	}, [
		virtualItems,
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
					className="flex flex-1 flex-col overflow-hidden rounded-none border-none"
					role="grid"
					tabIndex={0}
					aria-busy={loading ? "true" : undefined}
					aria-multiselectable="true"
					aria-activedescendant={activeRowKey ? `object-row-${encodeURIComponent(activeRowKey)}` : undefined}
					aria-rowcount={visibleRows.length + 1}
					onKeyDown={handleKeyDown}
					onContextMenu={handleContextMenu}
				>
					<div
						className="grid grid-cols-[minmax(200px,1fr)_120px_180px] min-h-9 items-center border-b border-separator bg-surface px-3 text-sm font-semibold text-foreground-secondary"
						role="row"
						aria-rowindex={1}
					>
						<div className="flex items-center gap-2 pr-3" role="columnheader">
							Name
						</div>
						<div className="pr-3 text-right tabular-nums" role="columnheader">
							Size
						</div>
						<div className="text-left tabular-nums" role="columnheader">
							Last modified
						</div>
					</div>

					<div ref={parentRef} className="relative flex-1 overflow-y-auto">
						{loading && visibleRows.length === 0 ? (
							<div
								className="flex h-60 flex-col items-center justify-center gap-3 text-sm text-foreground-secondary"
								role="status"
								aria-live="polite"
								aria-busy="true"
								aria-label="Loading objects"
							>
								<span className="sr-only">Loading objects...</span>
								{Array.from({ length: 5 }, (_, index) => (
									<Skeleton key={index} className="h-3.5" />
								))}
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
									const row = visibleRows[virtualRow.index];
									const rowKey = row.kind === "folder" ? row.prefix : row.key;
									const isSelected = selectedKeys.includes(rowKey);

									return (
										// biome-ignore lint/a11y/useKeyWithClickEvents: the grid container handles Arrow, Enter, and Space for every row
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
											className={cn(
												"grid cursor-pointer grid-cols-[minmax(200px,1fr)_120px_180px] items-center border-b border-separator px-3 text-base text-foreground hover:bg-foreground/[0.06]",
												row.kind === "folder" && "font-medium",
												isSelected && "bg-selection shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-selection",
											)}
											role="row"
											tabIndex={-1}
											aria-rowindex={virtualRow.index + 2}
											aria-selected={isSelected}
											data-row-key={rowKey}
											onClick={(event) => handleItemClick(row, event)}
											onDoubleClick={() => handleItemDoubleClick(row)}
										>
											<div className="flex items-center gap-2 truncate pr-3" role="cell">
												<span
													className="inline-flex shrink-0 items-center justify-center text-foreground-secondary"
													aria-hidden="true"
												>
													{row.kind === "folder" ? (
														<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
															<path d="M1.5 3A1.5 1.5 0 0 0 0 4.5v7A1.5 1.5 0 0 0 1.5 13h13a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14.5 5H8.707l-1.854-1.854A.5.5 0 0 0 6.5 3H1.5z" />
														</svg>
													) : (
														<svg
															aria-hidden="true"
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
												<span className="truncate">{row.name}</span>
											</div>
											<div className="truncate pr-3 text-right tabular-nums text-foreground-secondary" role="cell">
												{row.kind === "object" ? formatBytes(row.size) : "—"}
											</div>
											<div className="truncate text-left tabular-nums text-foreground-secondary" role="cell">
												{row.kind === "object" ? formatDate(row.lastModified) : "—"}
											</div>
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
