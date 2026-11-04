import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type FormEvent,
	type JSX,
} from "react";
import { api, unwrap } from "./api";
import { Breadcrumb } from "./components/Breadcrumb";
import { ConfirmDeleteDialog } from "./components/ConfirmDeleteDialog";
import {
	ConnectionDialog,
	type ConnectionView,
} from "./components/ConnectionDialog";
import { Dialog } from "./components/Dialog";
import { ObjectTable } from "./components/ObjectTable";
import { OpenUrlDialog } from "./components/OpenUrlDialog";
import { OperationReport } from "./components/OperationReport";
import {
	RenameDialog,
	type RenameResultReport,
} from "./components/RenameDialog";
import { SearchBar } from "./components/SearchBar";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import {
	TransfersDrawer,
	type TransferRecord,
} from "./components/TransfersDrawer";
import { Viewer, type ViewerTarget } from "./components/Viewer";
import type { BrowserRow, S3Item } from "./format";

export interface TransferMeta {
	kind: "upload" | "download";
	bucket: string;
	key: string;
}

export interface ProgressPayload {
	transferId: string;
	kind: "upload" | "download";
	bucket: string;
	key: string;
	loaded: number;
	total: number;
}

export interface DonePayload {
	transferId: string;
	status: "completed" | "failed" | "cancelled";
	error?: { code?: string; message: string };
}

export function updateTransfersOnProgress(
	prev: TransferRecord[],
	payload: ProgressPayload,
): TransferRecord[] {
	const existingIndex = prev.findIndex(
		(t) => t.transferId === payload.transferId,
	);
	if (existingIndex >= 0) {
		const existing = prev[existingIndex];
		if (
			existing &&
			existing.status !== "running" &&
			existing.status !== undefined
		) {
			return prev;
		}
		const updated = [...prev];
		const item = prev[existingIndex];
		if (item) {
			updated[existingIndex] = {
				...item,
				key: payload.key,
				loaded: payload.loaded,
				total: payload.total,
			};
		}
		return updated;
	}
	const newRecord: TransferRecord = {
		transferId: payload.transferId,
		kind: payload.kind,
		bucket: payload.bucket,
		key: payload.key,
		loaded: payload.loaded,
		total: payload.total,
		status: "running",
	};
	return [newRecord, ...prev];
}

export function updateTransfersOnDone(
	prev: TransferRecord[],
	payload: DonePayload,
	meta?: TransferMeta,
): TransferRecord[] {
	const existingIndex = prev.findIndex(
		(t) => t.transferId === payload.transferId,
	);
	if (existingIndex >= 0) {
		const updated = [...prev];
		const item = prev[existingIndex];
		if (item) {
			updated[existingIndex] = {
				...item,
				key: meta ? meta.key : item.key,
				status: payload.status,
				loaded:
					payload.status === "completed" && item.total > 0
						? item.total
						: item.loaded,
				error: payload.error?.message,
			};
		}
		return updated;
	}
	if (meta) {
		const newRecord: TransferRecord = {
			transferId: payload.transferId,
			kind: meta.kind,
			bucket: meta.bucket,
			key: meta.key,
			loaded: 0,
			total: 0,
			status: payload.status,
			error: payload.error?.message,
		};
		return [newRecord, ...prev];
	}
	return prev;
}

export function shouldClearViewerTarget(
	target: ViewerTarget | null,
	item: BrowserRow | null,
	connectionId: string | null,
	bucket: string | null,
): boolean {
	if (!target || target.kind !== "s3" || !item) {
		return false;
	}
	if (target.connectionId !== connectionId || target.bucket !== bucket) {
		return false;
	}
	if (item.kind === "object") {
		return target.key === item.key;
	}
	return target.key.startsWith(item.prefix);
}

export default function App(): JSX.Element {
	const [selectedConnectionId, setSelectedConnectionId] = useState<
		string | null
	>(null);
	const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
	const [selectedPrefix, setSelectedPrefix] = useState<string>("");

	const [searchResults, setSearchResults] = useState<S3Item[] | null>(null);
	const [isSearchActive, setIsSearchActive] = useState<boolean>(false);

	const [isConnectionDialogOpen, setIsConnectionDialogOpen] =
		useState<boolean>(false);
	const [editingConnection, setEditingConnection] =
		useState<ConnectionView | null>(null);
	const [connections, setConnections] = useState<ConnectionView[]>([]);
	const [refreshKey, setRefreshKey] = useState<number>(0);
	const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
	const [sessionWarning, setSessionWarning] = useState<boolean>(false);
	const [rejectedUploadCount, setRejectedUploadCount] = useState<number>(0);
	const [appError, setAppError] = useState<string | null>(null);

	const newFolderInputId = useId();

	const currentBucketList = useMemo(
		() => (selectedBucket ? [selectedBucket] : []),
		[selectedBucket],
	);

	const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
	const [selectedItem, setSelectedItem] = useState<BrowserRow | null>(null);

	const [isUrlDialogOpen, setIsUrlDialogOpen] = useState<boolean>(false);
	const [isNewFolderOpen, setIsNewFolderOpen] = useState<boolean>(false);
	const [newFolderName, setNewFolderName] = useState<string>("");
	const [newFolderError, setNewFolderError] = useState<string | null>(null);
	const [newFolderSubmitting, setNewFolderSubmitting] =
		useState<boolean>(false);

	const [isRenameOpen, setIsRenameOpen] = useState<boolean>(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
	const [operationReport, setOperationReport] =
		useState<RenameResultReport | null>(null);
	const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
	const [reportTitle, setReportTitle] = useState<string>("Operation report");

	const [transfers, setTransfers] = useState<TransferRecord[]>([]);
	const [isTransfersDrawerOpen, setIsTransfersDrawerOpen] =
		useState<boolean>(true);
	const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

	const selectedBucketRef = useRef<string | null>(selectedBucket);
	const selectedPrefixRef = useRef<string>(selectedPrefix);
	const transferMetaMapRef = useRef<Map<string, TransferMeta>>(new Map());

	useEffect(() => {
		selectedBucketRef.current = selectedBucket;
		selectedPrefixRef.current = selectedPrefix;
	}, [selectedBucket, selectedPrefix]);

	useEffect(() => {
		let active = true;
		void api.connections
			.list()
			.then((res) => {
				if (!active) {
					return;
				}
				const data = unwrap(res);
				setConnections(data);
			})
			.catch(() => {});

		return () => {
			active = false;
		};
	}, [refreshKey]);

	useEffect(() => {
		const unsubProgress = api.transfers.onProgress((payload) => {
			transferMetaMapRef.current.set(payload.transferId, {
				kind: payload.kind,
				bucket: payload.bucket,
				key: payload.key,
			});

			setTransfers((prev) => updateTransfersOnProgress(prev, payload));
		});

		const unsubDone = api.transfers.onDone((payload) => {
			const meta = transferMetaMapRef.current.get(payload.transferId);
			transferMetaMapRef.current.delete(payload.transferId);

			setTransfers((prev) => updateTransfersOnDone(prev, payload, meta));

			if (
				meta &&
				meta.kind === "upload" &&
				payload.status === "completed" &&
				meta.bucket === selectedBucketRef.current
			) {
				const curPrefix = selectedPrefixRef.current;
				if (!curPrefix || meta.key.startsWith(curPrefix)) {
					setRefreshTrigger((k) => k + 1);
				}
			}
		});

		return () => {
			unsubProgress();
			unsubDone();
		};
	}, []);

	function handleSelectConnection(connId: string | null): void {
		setSelectedConnectionId(connId);
		setSelectedBucket(null);
		setSelectedPrefix("");
		setSelectedItem(null);
		setSearchResults(null);
		setIsSearchActive(false);
		setViewerTarget(null);
	}

	function handleSelectBucket(connId: string, bucketName: string): void {
		setSelectedConnectionId(connId);
		setSelectedBucket(bucketName);
		setSelectedPrefix("");
		setSelectedItem(null);
		setSearchResults(null);
		setIsSearchActive(false);
		setViewerTarget(null);
	}

	function handleNavigate(newPrefix: string): void {
		setSelectedPrefix(newPrefix);
		setSelectedItem(null);
		setSearchResults(null);
		setIsSearchActive(false);
		setViewerTarget(null);
	}

	function handleSearchResults(
		results: S3Item[],
		_isDone: boolean,
		_truncated: boolean,
	): void {
		setSearchResults(results);
		setIsSearchActive(true);
		setSelectedItem(null);
		setViewerTarget(null);
	}

	function handleSearchCleared(): void {
		setSearchResults(null);
		setIsSearchActive(false);
		setSelectedItem(null);
		setViewerTarget(null);
	}

	function handleSelectObject(item: S3Item): void {
		if (!selectedConnectionId || !selectedBucket) {
			return;
		}
		if (
			viewerTarget?.kind === "s3" &&
			viewerTarget.connectionId === selectedConnectionId &&
			viewerTarget.bucket === selectedBucket &&
			viewerTarget.key === item.key
		) {
			return;
		}
		const name = item.key.split("/").pop() || item.key;
		setSelectedItem({
			kind: "object",
			key: item.key,
			name,
			size: item.size,
			lastModified: item.lastModified,
			etag: item.etag,
		});
		setViewerTarget({
			kind: "s3",
			connectionId: selectedConnectionId,
			bucket: selectedBucket,
			key: item.key,
			size: item.size,
		});
	}

	function handleSelectRow(row: BrowserRow): void {
		setSelectedItem(row);
		if (row.kind === "folder") {
			setViewerTarget(null);
		}
	}

	function handleOpenAddConnection(): void {
		setEditingConnection(null);
		setIsConnectionDialogOpen(true);
	}

	function handleOpenEditConnection(conn: ConnectionView): void {
		setEditingConnection(conn);
		setIsConnectionDialogOpen(true);
	}

	function handleConnectionSaved(saved: ConnectionView): void {
		if (saved.sessionOnly) {
			setSessionWarning(true);
		}
		setRefreshKey((k) => k + 1);
	}

	async function handleUpload(): Promise<void> {
		if (!selectedConnectionId || !selectedBucket) {
			return;
		}
		try {
			const res = await api.transfers.upload({
				connectionId: selectedConnectionId,
				bucket: selectedBucket,
				prefix: selectedPrefix,
			});
			unwrap(res);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to upload file";
			setAppError(message);
		}
	}

	async function handleUploadPaths(paths: string[]): Promise<void> {
		if (!selectedConnectionId || !selectedBucket) {
			return;
		}
		try {
			const res = await api.transfers.uploadPaths({
				connectionId: selectedConnectionId,
				bucket: selectedBucket,
				prefix: selectedPrefix,
				paths,
			});
			const data = unwrap(res);
			if (data.rejectedCount > 0) {
				setRejectedUploadCount(data.rejectedCount);
			}
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to upload files";
			setAppError(message);
		}
	}

	async function handleDownload(): Promise<void> {
		if (
			!selectedConnectionId ||
			!selectedBucket ||
			selectedItem?.kind !== "object"
		) {
			return;
		}
		try {
			const res = await api.transfers.download({
				connectionId: selectedConnectionId,
				bucket: selectedBucket,
				key: selectedItem.key,
			});
			unwrap(res);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to download object";
			setAppError(message);
		}
	}

	async function handleCancelTransfer(transferId: string): Promise<void> {
		try {
			const res = await api.transfers.cancel({ transferId });
			unwrap(res);
		} catch (err: unknown) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to cancel transfer";
			setAppError(message);
		}
	}

	function handleCloseNewFolder(): void {
		if (newFolderSubmitting) {
			return;
		}
		setIsNewFolderOpen(false);
		setNewFolderName("");
		setNewFolderError(null);
	}

	async function handleCreateFolder(e: FormEvent): Promise<void> {
		e.preventDefault();
		if (!selectedConnectionId || !selectedBucket) {
			return;
		}
		const trimmed = newFolderName.trim();
		if (!trimmed) {
			setNewFolderError("Folder name cannot be empty.");
			return;
		}
		if (trimmed.includes("/")) {
			setNewFolderError("Folder name cannot contain slashes.");
			return;
		}
		if (trimmed === "." || trimmed === "..") {
			setNewFolderError("Invalid folder name.");
			return;
		}

		setNewFolderSubmitting(true);
		setNewFolderError(null);
		try {
			const res = await api.ops.createFolder({
				connectionId: selectedConnectionId,
				bucket: selectedBucket,
				parent: selectedPrefix,
				name: trimmed,
			});
			unwrap(res);
			setIsNewFolderOpen(false);
			setNewFolderName("");
			setRefreshTrigger((k) => k + 1);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to create folder";
			setNewFolderError(message);
		} finally {
			setNewFolderSubmitting(false);
		}
	}

	function handleRenameSuccess(report?: RenameResultReport): void {
		setRefreshTrigger((k) => k + 1);
		setViewerTarget((current) =>
			shouldClearViewerTarget(
				current,
				selectedItem,
				selectedConnectionId,
				selectedBucket,
			)
				? null
				: current,
		);
		setSelectedItem(null);
		if (report) {
			setOperationReport(report);
			setReportTitle("Rename report");
			setIsReportOpen(true);
		}
	}

	function handleDeleteSuccess(report?: RenameResultReport): void {
		setRefreshTrigger((k) => k + 1);
		setViewerTarget((current) =>
			shouldClearViewerTarget(
				current,
				selectedItem,
				selectedConnectionId,
				selectedBucket,
			)
				? null
				: current,
		);
		setSelectedItem(null);
		if (report) {
			setOperationReport(report);
			setReportTitle("Delete report");
			setIsReportOpen(true);
		}
	}

	function handleRefresh(): void {
		setRefreshTrigger((k) => k + 1);
		setRefreshKey((k) => k + 1);
	}

	const activeSelectedRowKey = selectedItem
		? selectedItem.kind === "folder"
			? selectedItem.prefix
			: selectedItem.key
		: viewerTarget?.kind === "s3"
			? viewerTarget.key
			: null;

	return (
		<div className="app-shell">
			<Sidebar
				selectedConnectionId={selectedConnectionId}
				selectedBucket={selectedBucket}
				onSelectConnection={handleSelectConnection}
				onSelectBucket={handleSelectBucket}
				onOpenAddConnection={handleOpenAddConnection}
				onOpenEditConnection={handleOpenEditConnection}
				refreshKey={refreshKey}
			/>

			<main className="app-main">
				{sessionWarning && (
					<div className="tds-announcement tds-announcement--warning app-main-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__title">
								Session-only storage active
							</div>
							<div className="tds-announcement__message">
								Secure credentials storage is unavailable. Your
								access keys will only be kept in memory for this
								session.
							</div>
						</div>
						<div className="tds-announcement__actions">
							<button
								type="button"
								className="tds-btn tds-btn--sm tds-btn--secondary"
								onClick={() => {
									setSessionWarning(false);
								}}
							>
								Dismiss
							</button>
						</div>
					</div>
				)}

				{rejectedUploadCount > 0 && (
					<div className="tds-announcement tds-announcement--warning app-main-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__title">
								Some files could not be uploaded
							</div>
							<div className="tds-announcement__message">
								{rejectedUploadCount} file(s) were rejected. Only
								regular files up to 500 items are accepted.
							</div>
						</div>
						<div className="tds-announcement__actions">
							<button
								type="button"
								className="tds-btn tds-btn--sm tds-btn--secondary"
								onClick={() => {
									setRejectedUploadCount(0);
								}}
							>
								Dismiss
							</button>
						</div>
					</div>
				)}

				{appError && (
					<div className="tds-announcement tds-announcement--error app-main-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__message">
								{appError}
							</div>
						</div>
						<div className="tds-announcement__actions">
							<button
								type="button"
								className="tds-btn tds-btn--sm tds-btn--secondary"
								onClick={() => {
									setAppError(null);
								}}
							>
								Dismiss
							</button>
						</div>
					</div>
				)}

				<div className="app-main-content">
					{selectedConnectionId && selectedBucket ? (
						<div className="app-browser-view">
							<header className="app-browser-header">
								<Breadcrumb
									bucket={selectedBucket}
									prefix={selectedPrefix}
									onNavigate={handleNavigate}
								/>
								<SearchBar
									connectionId={selectedConnectionId}
									bucket={selectedBucket}
									prefix={selectedPrefix}
									onSearchResults={handleSearchResults}
									onSearchCleared={handleSearchCleared}
									isSearchActive={isSearchActive}
								/>
							</header>

							<Toolbar
								connectionId={selectedConnectionId}
								bucket={selectedBucket}
								prefix={selectedPrefix}
								selectedItem={selectedItem}
								onUpload={() => {
									void handleUpload();
								}}
								onNewFolder={() => {
									setNewFolderError(null);
									setNewFolderName("");
									setIsNewFolderOpen(true);
								}}
								onDownload={() => {
									void handleDownload();
								}}
								onRename={() => {
									setIsRenameOpen(true);
								}}
								onDelete={() => {
									setIsDeleteOpen(true);
								}}
								onOpenUrl={() => {
									setIsUrlDialogOpen(true);
								}}
								onRefresh={handleRefresh}
							/>

							<div
								className={`app-browser-body ${viewerTarget ? "app-browser-body--with-viewer" : ""} ${isDraggingOver ? "app-table-drag-active" : ""}`}
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "copy";
									setIsDraggingOver(true);
								}}
								onDragLeave={(e) => {
									if (
										!e.currentTarget.contains(
											e.relatedTarget as Node,
										)
									) {
										setIsDraggingOver(false);
									}
								}}
								onDrop={(e) => {
									e.preventDefault();
									setIsDraggingOver(false);
									const files = Array.from(e.dataTransfer.files);
									if (
										files.length === 0 ||
										!selectedConnectionId ||
										!selectedBucket
									) {
										return;
									}
									const paths = api.transfers.pathsForFiles(files);
									if (paths.length > 0) {
										void handleUploadPaths(paths);
									}
								}}
							>
								<div className="app-browser-table-pane">
									<ObjectTable
										connectionId={selectedConnectionId}
										bucket={selectedBucket}
										prefix={selectedPrefix}
										onNavigate={handleNavigate}
										searchResults={searchResults}
										isSearchActive={isSearchActive}
										selectedRowKey={activeSelectedRowKey}
										onSelectObject={handleSelectObject}
										onSelectRow={handleSelectRow}
										refreshTrigger={refreshTrigger}
									/>
								</div>
								{viewerTarget && (
									<div className="app-browser-viewer-pane">
										<Viewer
											target={viewerTarget}
											onClose={() => {
												setViewerTarget(null);
											}}
										/>
									</div>
								)}
							</div>
						</div>
					) : viewerTarget ? (
						<div className="app-browser-view">
							<div className="app-browser-body app-browser-body--with-viewer">
								<div className="app-browser-viewer-pane app-browser-viewer-pane--standalone">
									<Viewer
										target={viewerTarget}
										onClose={() => {
											setViewerTarget(null);
										}}
									/>
								</div>
							</div>
						</div>
					) : (
						<div className="app-main-empty">
							<p>
								Select a bucket from the sidebar to browse objects.
							</p>
							<button
								type="button"
								className="tds-btn tds-btn--md tds-btn--secondary"
								onClick={() => {
									setIsUrlDialogOpen(true);
								}}
							>
								Open URL
							</button>
						</div>
					)}
				</div>

				<TransfersDrawer
					transfers={transfers}
					isOpen={isTransfersDrawerOpen}
					onToggle={() => {
						setIsTransfersDrawerOpen((prev) => !prev);
					}}
					onCancel={(transferId) => {
						void handleCancelTransfer(transferId);
					}}
				/>
			</main>

			<ConnectionDialog
				isOpen={isConnectionDialogOpen}
				initialConnection={editingConnection}
				onClose={() => {
					setIsConnectionDialogOpen(false);
					setEditingConnection(null);
				}}
				onSaved={handleConnectionSaved}
			/>

			<OpenUrlDialog
				isOpen={isUrlDialogOpen}
				connections={connections}
				selectedConnectionId={selectedConnectionId}
				currentBucketList={currentBucketList}
				onClose={() => {
					setIsUrlDialogOpen(false);
				}}
				onSuccess={(target) => {
					setViewerTarget(target);
				}}
			/>

			<RenameDialog
				isOpen={isRenameOpen}
				connectionId={selectedConnectionId ?? ""}
				bucket={selectedBucket ?? ""}
				item={selectedItem}
				onClose={() => {
					setIsRenameOpen(false);
				}}
				onSuccess={handleRenameSuccess}
			/>

			<ConfirmDeleteDialog
				isOpen={isDeleteOpen}
				connectionId={selectedConnectionId ?? ""}
				bucket={selectedBucket ?? ""}
				item={selectedItem}
				onClose={() => {
					setIsDeleteOpen(false);
				}}
				onSuccess={handleDeleteSuccess}
			/>

			<OperationReport
				isOpen={isReportOpen}
				title={reportTitle}
				completedCount={operationReport?.completedCount ?? 0}
				remainingKeys={operationReport?.remainingKeys ?? []}
				error={operationReport?.error}
				onClose={() => {
					setIsReportOpen(false);
					setOperationReport(null);
				}}
			/>

			<Dialog
				isOpen={isNewFolderOpen}
				title="New folder"
				onClose={handleCloseNewFolder}
				footer={
					<div className="app-dialog-footer-actions">
						<button
							type="button"
							className="tds-btn tds-btn--md tds-btn--secondary"
							onClick={handleCloseNewFolder}
							disabled={newFolderSubmitting}
						>
							Cancel
						</button>
						<button
							type="submit"
							form="app-new-folder-form"
							className="tds-btn tds-btn--md tds-btn--primary"
							disabled={newFolderSubmitting || !newFolderName.trim()}
						>
							{newFolderSubmitting ? "Creating..." : "Create folder"}
						</button>
					</div>
				}
			>
				<form
					id="app-new-folder-form"
					onSubmit={(e) => {
						void handleCreateFolder(e);
					}}
					className="app-form-layout"
				>
					{newFolderError && (
						<div className="tds-announcement tds-announcement--negative app-dialog-banner">
							<div className="tds-announcement__content">
								<div className="tds-announcement__message">
									{newFolderError}
								</div>
							</div>
						</div>
					)}

					<div className="tds-text-input">
						<label
							className="tds-field-label"
							htmlFor={newFolderInputId}
						>
							Folder name (required)
						</label>
						<input
							id={newFolderInputId}
							type="text"
							className="tds-text-input__field"
							value={newFolderName}
							onChange={(e) => {
								setNewFolderName(e.target.value);
								setNewFolderError(null);
							}}
							placeholder="documents"
							disabled={newFolderSubmitting}
							required
							autoFocus
						/>
						<span className="tds-field-caption">
							Folder names cannot contain slashes or dot-only
							segments.
						</span>
					</div>
				</form>
			</Dialog>
		</div>
	);
}
