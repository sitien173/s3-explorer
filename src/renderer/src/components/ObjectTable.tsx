import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

export interface ObjectTableProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	onNavigate: (newPrefix: string) => void;
	searchResults?: S3Item[] | null;
	isSearchActive?: boolean;
	selectedRowKey?: string | null;
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
	selectedRowKey: controlledSelectedRowKey,
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
	const [internalSelectedRowKey, setInternalSelectedRowKey] = useState<
		string | null
	>(null);
	const selectedRowKey =
		controlledSelectedRowKey !== undefined
			? controlledSelectedRowKey
			: internalSelectedRowKey;

	const requestIdRef = useRef<number>(0);
	const currentPrefixRef = useRef<string>(prefix);
	const parentRef = useRef<HTMLDivElement>(null);
	const inFlightRef = useRef<boolean>(false);
	const nextTokenRef = useRef<string | undefined>(undefined);

	nextTokenRef.current = nextToken;

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
		setInternalSelectedRowKey(null);
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

			<div
				className="tds-data-table-container app-table-scroll-container"
				role="table"
				aria-rowcount={visibleRows.length + 1}
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
						<div className="app-table-loading-state">
							<div className="tds-spinner tds-spinner--md" />
							<span>Loading objects...</span>
						</div>
					) : visibleRows.length === 0 ? (
						<div className="app-table-empty-state">
							{filterText.trim()
								? "No matching items found."
								: isSearchActive
									? "No objects matched your search."
									: "This folder is empty."}
						</div>
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
								const isSelected = selectedRowKey === rowKey;

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
										className={`app-table-row-grid ${row.kind === "folder" ? "app-table-row-grid--folder" : "app-table-row-grid--object"} ${isSelected ? "app-table-row-grid--selected" : ""}`}
										role="row"
										tabIndex={0}
										aria-rowindex={virtualRow.index + 2}
										aria-selected={isSelected}
										onClick={() => {
											if (row.kind === "folder") {
												if (selectedRowKey === row.prefix) {
													onNavigate(row.prefix);
												} else {
													setInternalSelectedRowKey(row.prefix);
													onSelectRow?.(row);
												}
											} else {
												setInternalSelectedRowKey(row.key);
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
											if (row.kind === "folder") {
												onNavigate(row.prefix);
											}
										}}
										onKeyDown={(e) => {
											if (e.target !== e.currentTarget) {
												return;
											}
											if (e.key === "Enter") {
												e.preventDefault();
												if (row.kind === "folder") {
													onNavigate(row.prefix);
												} else {
													setInternalSelectedRowKey(row.key);
													onSelectObject?.({
														key: row.key,
														size: row.size,
														lastModified: row.lastModified,
														etag: row.etag,
													});
													onSelectRow?.(row);
												}
											} else if (e.key === " ") {
												e.preventDefault();
												if (row.kind === "folder") {
													setInternalSelectedRowKey(row.prefix);
													onSelectRow?.(row);
												} else {
													setInternalSelectedRowKey(row.key);
													onSelectObject?.({
														key: row.key,
														size: row.size,
														lastModified: row.lastModified,
														etag: row.etag,
													});
													onSelectRow?.(row);
												}
											}
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
		</div>
	);
}
