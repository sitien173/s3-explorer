import {
	useEffect,
	useId,
	useMemo,
	useReducer,
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
import { Dialog } from "./components/ui/dialog";
import { AppShell } from "./components/AppShell";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./components/ui/empty";
import { Alert } from "./components/ui/alert";
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
import { initialSelection, selectionReducer } from "./selection";
import { Toaster } from "./components/ui/sonner";
import { notify, shouldNotifyTransferTerminal } from "./toasts";

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

	const newFolderInputId = useId();

	const currentBucketList = useMemo(
		() => (selectedBucket ? [selectedBucket] : []),
		[selectedBucket],
	);

	const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
	const [selection, dispatchSelection] = useReducer(selectionReducer, initialSelection);
	const selectedRowsRef = useRef<Map<string, BrowserRow>>(new Map());
	const selectedItem =
		selection.selected.length === 1
			? selectedRowsRef.current.get(selection.selected[0]) ?? null
			: null;
	const selectedItems = useMemo(
		() =>
			selection.selected
				.map((key) => selectedRowsRef.current.get(key))
				.filter((row): row is BrowserRow => Boolean(row)),
		[selection.selected],
	);
	const hasFolderSelected = useMemo(
		() => selectedItems.some((item) => item.kind === "folder"),
		[selectedItems],
	);
	const setSelectedItem = (row: BrowserRow | null): void => {
		if (row) {
			const key = row.kind === "folder" ? row.prefix : row.key;
			selectedRowsRef.current.set(key, row);
			dispatchSelection({ type: "select", key, keys: [key] });
		} else {
			dispatchSelection({ type: "reset" });
		}
	};

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
		useState<boolean>(false);
	const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

	const selectedBucketRef = useRef<string | null>(selectedBucket);
	const selectedPrefixRef = useRef<string>(selectedPrefix);
	const transferMetaMapRef = useRef<Map<string, TransferMeta>>(new Map());
	const terminalTransferIdsRef = useRef(new Set<string>());

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

			const kind = meta?.kind;
			const key = meta?.key;
			const firstTerminalEvent = shouldNotifyTransferTerminal(terminalTransferIdsRef.current, payload.transferId);

			if (firstTerminalEvent && meta && key && payload.status === "completed") {
				if (kind === "upload") notify.uploadDone(key);
				else if (kind === "download") notify.downloadDone(key);
			} else if (firstTerminalEvent && meta && key && payload.status === "failed") {
				notify.transferFailed(key);
			}

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

	function handleBucketDeleted(connId: string, bucketName: string): void {
		if (connId === selectedConnectionId && bucketName === selectedBucket) {
			handleSelectConnection(connId);
		}
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
		selectedRowsRef.current.set(item.key, { kind: "object", key: item.key, name, size: item.size, lastModified: item.lastModified, etag: item.etag });
		setViewerTarget({
			kind: "s3",
			connectionId: selectedConnectionId,
			bucket: selectedBucket,
			key: item.key,
			size: item.size,
		});
	}

	function handleSelectRow(row: BrowserRow): void {
		selectedRowsRef.current.set(row.kind === "folder" ? row.prefix : row.key, row);
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
			notify.operationFailed("Upload", message);
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
				notify.rejectedUploads(data.rejectedCount);
			}
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to upload files";
			notify.operationFailed("Upload", message);
		}
	}

	async function handleOpenWithSystemApp(item: S3Item): Promise<void> {
		if (!selectedConnectionId || !selectedBucket) return;
		try {
			const stream = unwrap(await api.stream.open({
				connectionId: selectedConnectionId,
				bucket: selectedBucket,
				key: item.key,
			}));
			unwrap(await api.files.openWithSystemApp({
				url: stream.url,
				fileName: item.key.split("/").pop() || item.key,
			}));
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Failed to open object";
			notify.operationFailed("Open with system app", message);
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
			notify.operationFailed("Download", message);
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
			notify.operationFailed("Cancel transfer", message);
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
			notify.folderCreated(trimmed);
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to create folder";
			notify.operationFailed("Create folder", message);
			setNewFolderError(message);
		} finally {
			setNewFolderSubmitting(false);
		}
	}

	function handleRenameSuccess(report?: RenameResultReport, destinationKey?: string): void {
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
		const targetName = destinationKey ?? "item";
		setSelectedItem(null);
		if (report) {
			setOperationReport(report);
			setReportTitle("Rename report");
			setIsReportOpen(true);
			notify.partialFailure(
				{
					completedCount: report.completedCount,
					remainingCount: report.remainingKeys.length,
				},
				() => {
					setOperationReport(report);
					setReportTitle("Rename report");
					setIsReportOpen(true);
				},
			);
		} else {
			notify.renameDone(targetName);
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
		const count = selectedItems.length;
		const singleName = selectedItems[0]
			? selectedItems[0].kind === "object"
				? selectedItems[0].name
				: selectedItems[0].prefix
			: selectedItem
				? selectedItem.kind === "object"
					? selectedItem.name
					: selectedItem.prefix
				: "item";
		setSelectedItem(null);
		if (report) {
			setOperationReport(report);
			setReportTitle("Delete report");
			setIsReportOpen(true);
			notify.partialFailure(
				{
					completedCount: report.completedCount,
					remainingCount: report.remainingKeys.length,
				},
				() => {
					setOperationReport(report);
					setReportTitle("Delete report");
					setIsReportOpen(true);
				},
			);
		} else {
			notify.deleteDone(count > 1 ? count : singleName);
		}
	}

	function handleRefresh(): void {
		setRefreshTrigger((k) => k + 1);
		setRefreshKey((k) => k + 1);
	}

	return (
		<>
		<Toaster />
		<AppShell
			sidebar={<Sidebar
				selectedConnectionId={selectedConnectionId}
				selectedBucket={selectedBucket}
				onSelectConnection={handleSelectConnection}
				onSelectBucket={handleSelectBucket}
				onOpenAddConnection={handleOpenAddConnection}
				onOpenEditConnection={handleOpenEditConnection}
				onBucketDeleted={handleBucketDeleted}
				refreshKey={refreshKey}
			/>}
			main={<main className="app-main">
				{sessionWarning && (
					<Alert className="tds-announcement--warning app-main-banner">
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
					</Alert>
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
								selectedCount={selection.selected.length}
								hasFolderSelected={hasFolderSelected}
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
									if (selection.selected.length === 1) {
										setIsRenameOpen(true);
									}
								}}
								onDelete={() => {
									if (
										selection.selected.length === 1 ||
										(selection.selected.length > 1 && !hasFolderSelected)
									) {
										setIsDeleteOpen(true);
									}
								}}
								onOpenUrl={() => {
									setIsUrlDialogOpen(true);
								}}
								onRefresh={handleRefresh}
							/>

							<div
								className={`app-browser-body ${isDraggingOver ? "app-table-drag-active" : ""}`}
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
										selectedRowKeys={selection.selected}
										activeRowKey={selection.active}
										onSelectionChange={(next) => {
											dispatchSelection({ type: "replace", state: next });
										}}
										onGridAction={(action, row) => {
											if (row && selection.selected.length <= 1) {
												setSelectedItem(row);
											}
											if (action === "system-open" && row?.kind === "object") {
												void handleOpenWithSystemApp(row);
											} else if (action === "download") {
												void handleDownload();
											} else if (action === "rename") {
												if (selection.selected.length === 1) {
													setIsRenameOpen(true);
												}
											} else if (action === "delete") {
												if (
													selection.selected.length === 1 ||
													(selection.selected.length > 1 && !hasFolderSelected)
												) {
													setIsDeleteOpen(true);
												}
											} else if (action === "parent") {
												const parts = selectedPrefix
													.replace(/\/$/, "")
													.split("/")
													.filter(Boolean);
												parts.pop();
												handleNavigate(parts.length ? `${parts.join("/")}/` : "");
											}
										}}
										onOpenRow={(row) => {
											if (row.kind === "folder") {
												handleNavigate(row.prefix);
											} else {
												handleSelectObject({
													key: row.key,
													size: row.size,
													lastModified: row.lastModified,
													etag: row.etag,
												});
											}
										}}
										onSelectObject={handleSelectObject}
										onSelectRow={handleSelectRow}
										refreshTrigger={refreshTrigger}
									/>
								</div>
							</div>
						</div>
					) : (
						<Empty className="app-main-empty">
							<EmptyHeader><EmptyTitle>No bucket selected</EmptyTitle><EmptyDescription>Select a bucket from the sidebar to browse objects.</EmptyDescription></EmptyHeader>
							<button
								type="button"
								className="tds-btn tds-btn--md tds-btn--secondary"
								onClick={() => {
									setIsUrlDialogOpen(true);
								}}
							>
								Open URL
							</button>
						</Empty>
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
			</main>}
			viewer={viewerTarget ? <Viewer target={viewerTarget} onClose={() => setViewerTarget(null)} /> : null}
			viewerOpen={viewerTarget !== null}
			onViewerClose={() => setViewerTarget(null)}
		/>

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
				onFailure={() => notify.operationFailed("Rename")}
			/>

			<ConfirmDeleteDialog
				isOpen={isDeleteOpen}
				connectionId={selectedConnectionId ?? ""}
				bucket={selectedBucket ?? ""}
				item={selectedItem}
				items={selectedItems}
				onClose={() => {
					setIsDeleteOpen(false);
				}}
				onSuccess={handleDeleteSuccess}
				onFailure={() => notify.operationFailed("Delete")}
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
		</>
	);
}
