import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { api, unwrap } from "./api";
import { Breadcrumb } from "./components/Breadcrumb";
import { CommandPalette } from "./components/CommandPalette";
import { ConfirmDeleteDialog } from "./components/ConfirmDeleteDialog";
import { ConnectionDialog, type ConnectionView } from "./components/ConnectionDialog";
import { Dialog } from "./components/ui/dialog";
import { FieldError, FieldLabel } from "./components/ui/field";
import { AppShell } from "./components/AppShell";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./components/ui/empty";
import { Alert, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ObjectGrid } from "./components/ObjectGrid";
import { ObjectTable } from "./components/ObjectTable";
import { OpenUrlDialog } from "./components/OpenUrlDialog";
import { OperationReport } from "./components/OperationReport";
import { QuickLook } from "./components/QuickLook";
import { RenameDialog, type RenameResultReport } from "./components/RenameDialog";
import { SearchBar } from "./components/SearchBar";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { TransfersDrawer, type TransferRecord } from "./components/TransfersDrawer";
import type { BrowserRow, S3Item } from "./format";
import { newFolderFormSchema } from "./forms";
import type { SelectionState } from "./selection";
import { invalidateKeys, invalidations, connectionsQuery, queryKeys, streamOpenQuery } from "./queries";
import { useShellStore, type ViewerTarget } from "./store";
import { notify, shouldNotifyTransferTerminal } from "./toasts";
import { cn } from "./lib/utils";
import { isMac } from "./platform";

export interface NewFolderDialogProps {
	isOpen: boolean;
	connectionId: string | null;
	bucket: string | null;
	parent: string;
	onClose: () => void;
	onCreated: (name: string) => void;
}

export function NewFolderDialog({
	isOpen,
	connectionId,
	bucket,
	parent,
	onClose,
	onCreated,
}: NewFolderDialogProps): JSX.Element {
	const inputId = useId();
	const {
		register,
		handleSubmit,
		reset,
		watch,
		setError,
		clearErrors,
		formState: { errors, isSubmitting: submitting },
	} = useForm<{ name: string }, unknown, { name: string }>({
		resolver: zodResolver(newFolderFormSchema),
		defaultValues: { name: "" },
	});
	const name = watch("name");

	useEffect(() => {
		if (!isOpen) {
			reset({ name: "" });
		}
	}, [isOpen, reset]);

	function handleClose(): void {
		if (submitting) {
			return;
		}
		onClose();
	}

	async function onValid({ name: trimmed }: { name: string }): Promise<void> {
		if (!connectionId || !bucket) {
			return;
		}
		try {
			const res = await api.ops.createFolder({ connectionId, bucket, parent, name: trimmed });
			unwrap(res);
			onClose();
			onCreated(trimmed);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to create folder";
			notify.operationFailed("Create folder", message);
			setError("root.server", { message });
		}
	}

	return (
		<Dialog
			isOpen={isOpen}
			title="New folder"
			onClose={handleClose}
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
						Cancel
					</Button>
					<Button type="submit" form="app-new-folder-form" disabled={submitting || !name.trim()}>
						{submitting ? "Creating..." : "Create folder"}
					</Button>
				</div>
			}
		>
			<form
				id="app-new-folder-form"
				onSubmit={(e) => {
					void handleSubmit(onValid)(e);
				}}
				className="flex flex-col gap-3"
			>
				{errors.root?.server?.message && (
					<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="min-w-0 flex-1">
							<div>{errors.root.server.message}</div>
						</div>
					</div>
				)}

				<div className="flex flex-col gap-1">
					<FieldLabel htmlFor={inputId}>Folder name (required)</FieldLabel>
					<Input
						id={inputId}
						type="text"
						{...register("name", {
							onChange: () => {
								clearErrors("root.server");
							},
						})}
						placeholder="documents"
						disabled={submitting}
						required
						autoFocus
					/>
					<span className="text-xs text-foreground-secondary">
						Folder names cannot contain slashes or dot-only segments.
					</span>
					<FieldError error={errors.name} />
				</div>
			</form>
		</Dialog>
	);
}

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

export function updateTransfersOnProgress(prev: TransferRecord[], payload: ProgressPayload): TransferRecord[] {
	const existingIndex = prev.findIndex((t) => t.transferId === payload.transferId);
	if (existingIndex >= 0) {
		const existing = prev[existingIndex];
		if (existing && existing.status !== "running" && existing.status !== undefined) {
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
	const existingIndex = prev.findIndex((t) => t.transferId === payload.transferId);
	if (existingIndex >= 0) {
		const updated = [...prev];
		const item = prev[existingIndex];
		if (item) {
			updated[existingIndex] = {
				...item,
				key: meta ? meta.key : item.key,
				status: payload.status,
				loaded: payload.status === "completed" && item.total > 0 ? item.total : item.loaded,
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
	if (target?.kind !== "s3" || !item) {
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

export default function Shell(): JSX.Element {
	const queryClient = useQueryClient();
	const connectionId = useShellStore((s) => s.connectionId);
	const bucket = useShellStore((s) => s.bucket);
	const prefix = useShellStore((s) => s.prefix);
	const selection = useShellStore((s) => s.selection);
	const viewerTarget = useShellStore((s) => s.viewerTarget);
	const dialog = useShellStore((s) => s.dialog);
	const transfersOpen = useShellStore((s) => s.transfersOpen);
	const viewMode = useShellStore((s) => s.viewMode);
	const {
		selectConnection,
		selectBucket,
		navigate,
		dispatchSelection,
		setViewerTarget,
		openDialog,
		closeDialog,
		setViewMode,
	} = useShellStore.getState();

	const [searchResults, setSearchResults] = useState<S3Item[] | null>(null);
	const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
	const [sessionWarning, setSessionWarning] = useState<boolean>(false);

	const connections: ConnectionView[] = useQuery(connectionsQuery()).data ?? [];
	const editingConnection =
		dialog?.kind === "connection" ? (connections.find((c) => c.id === dialog.editingId) ?? null) : null;

	const currentBucketList = useMemo(() => (bucket ? [bucket] : []), [bucket]);

	const selectedRowsRef = useRef<Map<string, BrowserRow>>(new Map());
	const visibleRowsRef = useRef<BrowserRow[]>([]);
	const selectedItem =
		selection.selected.length === 1 ? (selectedRowsRef.current.get(selection.selected[0]) ?? null) : null;
	const selectedItems = useMemo(
		() =>
			selection.selected
				.map((key) => selectedRowsRef.current.get(key))
				.filter((row): row is BrowserRow => Boolean(row)),
		[selection.selected],
	);
	const hasFolderSelected = useMemo(() => selectedItems.some((item) => item.kind === "folder"), [selectedItems]);
	const setSelectedItem = (row: BrowserRow | null): void => {
		if (row) {
			const key = row.kind === "folder" ? row.prefix : row.key;
			selectedRowsRef.current.set(key, row);
			dispatchSelection({ type: "select", key, keys: [key] });
		} else {
			dispatchSelection({ type: "reset" });
		}
	};

	const [operationReport, setOperationReport] = useState<RenameResultReport | null>(null);
	const [reportTitle, setReportTitle] = useState<string>("Operation report");

	const [transfers, setTransfers] = useState<TransferRecord[]>([]);
	const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

	const transferMetaMapRef = useRef<Map<string, TransferMeta>>(new Map());
	const terminalTransferIdsRef = useRef(new Set<string>());

	// Close only the dialog that asked to close, so a report opened from onSuccess survives the caller's onClose.
	function closeIf(kind: NonNullable<typeof dialog>["kind"]): void {
		if (useShellStore.getState().dialog?.kind === kind) {
			closeDialog();
		}
	}

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

			const current = useShellStore.getState();
			if (
				meta &&
				meta.kind === "upload" &&
				payload.status === "completed" &&
				current.connectionId &&
				meta.bucket === current.bucket &&
				(!current.prefix || meta.key.startsWith(current.prefix))
			) {
				void invalidateKeys(queryClient, [
					...invalidations.upload(current.connectionId, meta.bucket, current.prefix),
					queryKeys.stream(current.connectionId, meta.bucket, meta.key),
				]);
			}
		});

		return () => {
			unsubProgress();
			unsubDone();
		};
	}, [queryClient]);

	function resetSearch(): void {
		setSearchResults(null);
		setIsSearchActive(false);
	}

	function handleSelectConnection(connId: string | null): void {
		selectConnection(connId);
		resetSearch();
	}

	function handleBucketDeleted(connId: string, bucketName: string): void {
		if (connId === connectionId && bucketName === bucket) {
			handleSelectConnection(connId);
		}
	}

	function handleSelectBucket(connId: string, bucketName: string): void {
		selectBucket(connId, bucketName);
		resetSearch();
	}

	function handleNavigate(newPrefix: string): void {
		navigate(newPrefix);
		resetSearch();
	}

	function handleSearchResults(results: S3Item[], _isDone: boolean, _truncated: boolean): void {
		setSearchResults(results);
		setIsSearchActive(true);
		setSelectedItem(null);
		setViewerTarget(null);
	}

	function handleSearchCleared(): void {
		resetSearch();
		setSelectedItem(null);
		setViewerTarget(null);
	}

	function handleQuickLook(row: BrowserRow): void {
		if (!connectionId || !bucket || row.kind !== "object") {
			return;
		}
		selectedRowsRef.current.set(row.key, row);
		setViewerTarget({
			kind: "s3",
			connectionId,
			bucket,
			key: row.key,
			size: row.size,
		});
	}

	// Selection follows Quick Look, so the current item stays selected after it closes.
	function handleQuickLookNavigate(row: BrowserRow): void {
		if (row.kind !== "object") {
			return;
		}
		selectedRowsRef.current.set(row.key, row);
		dispatchSelection({ type: "select", key: row.key, keys: [row.key] });
		handleQuickLook(row);
	}

	function handleSelectRow(row: BrowserRow): void {
		selectedRowsRef.current.set(row.kind === "folder" ? row.prefix : row.key, row);
		if (row.kind === "folder") {
			setViewerTarget(null);
		}
	}

	function handleConnectionSaved(saved: ConnectionView): void {
		if (saved.sessionOnly) {
			setSessionWarning(true);
		}
		void invalidateKeys(queryClient, invalidations.saveConnection());
	}

	async function handleUpload(): Promise<void> {
		if (!connectionId || !bucket) {
			return;
		}
		try {
			const res = await api.transfers.upload({ connectionId, bucket, prefix });
			unwrap(res);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to upload file";
			notify.operationFailed("Upload", message);
		}
	}

	async function handleUploadPaths(paths: string[]): Promise<void> {
		if (!connectionId || !bucket) {
			return;
		}
		try {
			const res = await api.transfers.uploadPaths({ connectionId, bucket, prefix, paths });
			const data = unwrap(res);
			if (data.rejectedCount > 0) {
				notify.rejectedUploads(data.rejectedCount);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to upload files";
			notify.operationFailed("Upload", message);
		}
	}

	async function handleOpenWithSystemApp(item: S3Item): Promise<void> {
		if (!connectionId || !bucket) return;
		try {
			const stream = await queryClient.fetchQuery(streamOpenQuery({ connectionId, bucket, key: item.key }));
			unwrap(
				await api.files.openWithSystemApp({
					url: stream.url,
					fileName: item.key.split("/").pop() || item.key,
				}),
			);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Failed to open object";
			notify.operationFailed("Open with system app", message);
		}
	}

	async function handleDownload(): Promise<void> {
		if (!connectionId || !bucket || selectedItem?.kind !== "object") {
			return;
		}
		try {
			const res = await api.transfers.download({ connectionId, bucket, key: selectedItem.key });
			unwrap(res);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to download object";
			notify.operationFailed("Download", message);
		}
	}

	async function handleCancelTransfer(transferId: string): Promise<void> {
		try {
			const res = await api.transfers.cancel({ transferId });
			unwrap(res);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to cancel transfer";
			notify.operationFailed("Cancel transfer", message);
		}
	}

	function showReport(report: RenameResultReport, title: string): void {
		setOperationReport(report);
		setReportTitle(title);
		openDialog({ kind: "report" });
	}

	function handleRenameSuccess(report?: RenameResultReport, destinationKey?: string): void {
		if (connectionId && bucket && selectedItem) {
			const from = selectedItem.kind === "folder" ? selectedItem.prefix : selectedItem.key;
			// A partial report has no single destination, so refresh every listing of the bucket.
			const keys =
				report || !destinationKey
					? [queryKeys.bucketObjects(connectionId, bucket)]
					: selectedItem.kind === "folder"
						? invalidations.renamePrefix(connectionId, bucket, from, destinationKey)
						: invalidations.rename(connectionId, bucket, from, destinationKey);
			void invalidateKeys(queryClient, keys);
		}
		setViewerTarget((current) =>
			shouldClearViewerTarget(current, selectedItem, connectionId, bucket) ? null : current,
		);
		const targetName = destinationKey ?? "item";
		setSelectedItem(null);
		if (report) {
			showReport(report, "Rename report");
			notify.partialFailure(
				{
					completedCount: report.completedCount,
					remainingCount: report.remainingKeys.length,
				},
				() => {
					showReport(report, "Rename report");
				},
			);
		} else {
			notify.renameDone(targetName);
		}
	}

	function handleDeleteSuccess(report?: RenameResultReport): void {
		if (connectionId && bucket) {
			const rows = selectedItems.length ? selectedItems : selectedItem ? [selectedItem] : [];
			const objectKeys = rows.flatMap((row) => (row.kind === "object" ? [row.key] : []));
			void invalidateKeys(queryClient, [
				...(objectKeys.length ? invalidations.deleteObjects(connectionId, bucket, objectKeys) : []),
				...rows.flatMap((row) =>
					row.kind === "folder" ? invalidations.deletePrefix(connectionId, bucket, row.prefix) : [],
				),
			]);
		}
		setViewerTarget((current) =>
			shouldClearViewerTarget(current, selectedItem, connectionId, bucket) ? null : current,
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
			showReport(report, "Delete report");
			notify.partialFailure(
				{
					completedCount: report.completedCount,
					remainingCount: report.remainingKeys.length,
				},
				() => {
					showReport(report, "Delete report");
				},
			);
		} else {
			notify.deleteDone(count > 1 ? count : singleName);
		}
	}

	function handleRefresh(): void {
		void invalidateKeys(queryClient, [
			queryKeys.connections(),
			...(connectionId && bucket ? [queryKeys.objectList(connectionId, bucket, prefix)] : []),
		]);
	}

	return (
		<>
			<AppShell
				sidebar={
					<Sidebar
						selectedConnectionId={connectionId}
						selectedBucket={bucket}
						onSelectConnection={handleSelectConnection}
						onSelectBucket={handleSelectBucket}
						onOpenAddConnection={() => {
							openDialog({ kind: "connection", editingId: null });
						}}
						onOpenEditConnection={(conn) => {
							openDialog({ kind: "connection", editingId: conn.id });
						}}
						onBucketDeleted={handleBucketDeleted}
					/>
				}
				main={
					<main className="flex h-full flex-col overflow-hidden bg-background">
						{sessionWarning && (
							<Alert className="mx-2 mt-2">
								<div className="min-w-0 flex-1">
									<AlertTitle>Session-only storage active</AlertTitle>
									<div>
										Secure credentials storage is unavailable. Your access keys will only be kept in memory for this
										session.
									</div>
								</div>
								<div className="shrink-0">
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => {
											setSessionWarning(false);
										}}
									>
										Dismiss
									</Button>
								</div>
							</Alert>
						)}

						<div className="flex flex-1 flex-col overflow-hidden bg-background">
							{connectionId && bucket ? (
								<div className="flex h-full flex-col overflow-hidden">
									<Toolbar
										connectionId={connectionId}
										bucket={bucket}
										prefix={prefix}
										selectedItem={selectedItem}
										selectedCount={selection.selected.length}
										hasFolderSelected={hasFolderSelected}
										viewMode={viewMode}
										onViewModeChange={setViewMode}
										breadcrumb={<Breadcrumb bucket={bucket} prefix={prefix} onNavigate={handleNavigate} />}
										search={
											<SearchBar
												connectionId={connectionId}
												bucket={bucket}
												prefix={prefix}
												onSearchResults={handleSearchResults}
												onSearchCleared={handleSearchCleared}
												isSearchActive={isSearchActive}
											/>
										}
										onUpload={() => {
											void handleUpload();
										}}
										onNewFolder={() => {
											openDialog({ kind: "newFolder" });
										}}
										onDownload={() => {
											void handleDownload();
										}}
										onRename={() => {
											if (selection.selected.length === 1) {
												openDialog({ kind: "rename" });
											}
										}}
										onDelete={() => {
											if (selection.selected.length === 1 || (selection.selected.length > 1 && !hasFolderSelected)) {
												openDialog({ kind: "delete" });
											}
										}}
										onOpenUrl={() => {
											openDialog({ kind: "openUrl" });
										}}
										onRefresh={handleRefresh}
									/>

									{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone for file upload, the Upload button is the keyboard path */}
									<div
										className={cn(
											"flex flex-1 flex-col overflow-hidden",
											isDraggingOver && "-outline-offset-4 outline-2 outline-dashed outline-accent bg-surface",
										)}
										onDragOver={(e) => {
											e.preventDefault();
											e.dataTransfer.dropEffect = "copy";
											setIsDraggingOver(true);
										}}
										onDragLeave={(e) => {
											if (!e.currentTarget.contains(e.relatedTarget as Node)) {
												setIsDraggingOver(false);
											}
										}}
										onDrop={(e) => {
											e.preventDefault();
											setIsDraggingOver(false);
											const files = Array.from(e.dataTransfer.files);
											if (files.length === 0 || !connectionId || !bucket) {
												return;
											}
											const paths = api.transfers.pathsForFiles(files);
											if (paths.length > 0) {
												void handleUploadPaths(paths);
											}
										}}
									>
										<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
											{(() => {
												const contentProps = {
													connectionId,
													bucket,
													prefix,
													onNavigate: handleNavigate,
													searchResults,
													isSearchActive,
													selectedRowKeys: selection.selected,
													activeRowKey: selection.active,
													onSelectionChange: (next: SelectionState) => {
														dispatchSelection({ type: "replace", state: next });
													},
													onGridAction: (action: string, row: BrowserRow | null) => {
														if (row && selection.selected.length <= 1) {
															setSelectedItem(row);
														}
														if (action === "system-open" && row?.kind === "object") {
															void handleOpenWithSystemApp(row);
														} else if (action === "download") {
															void handleDownload();
														} else if (action === "rename") {
															if (selection.selected.length === 1) {
																openDialog({ kind: "rename" });
															}
														} else if (action === "delete") {
															if (
																selection.selected.length === 1 ||
																(selection.selected.length > 1 && !hasFolderSelected)
															) {
																openDialog({ kind: "delete" });
															}
														} else if (action === "parent") {
															const parts = prefix.replace(/\/$/, "").split("/").filter(Boolean);
															parts.pop();
															handleNavigate(parts.length ? `${parts.join("/")}/` : "");
														}
													},
													onOpenRow: (row: BrowserRow) => {
														if (row.kind === "folder") {
															handleNavigate(row.prefix);
														} else {
															handleQuickLook(row);
														}
													},
													onQuickLook: handleQuickLook,
													onVisibleRowsChange: (rows: BrowserRow[]) => {
														visibleRowsRef.current = rows;
													},
													onSelectRow: handleSelectRow,
												};
												return viewMode === "grid" ? (
													<ObjectGrid key={`${connectionId}/${bucket}`} {...contentProps} />
												) : (
													<ObjectTable {...contentProps} />
												);
											})()}
										</div>
									</div>
								</div>
							) : (
								<div className="flex h-full flex-col overflow-hidden">
									<div
										className={cn(
											"flex h-11 shrink-0 items-center justify-end border-b border-separator bg-background px-4 app-drag",
											!isMac && "app-overlay-inset",
										)}
									/>
									<Empty className="flex flex-1 flex-col items-center justify-center p-12 text-center text-base text-foreground-secondary">
										<EmptyHeader>
											<EmptyTitle>No bucket selected</EmptyTitle>
											<EmptyDescription>Select a bucket from the sidebar to browse objects.</EmptyDescription>
										</EmptyHeader>
										<Button
											type="button"
											variant="secondary"
											className="app-no-drag"
											onClick={() => {
												openDialog({ kind: "openUrl" });
											}}
										>
											Open URL
										</Button>
									</Empty>
								</div>
							)}
						</div>

						<TransfersDrawer
							transfers={transfers}
							isOpen={transfersOpen}
							onToggle={() => {
								useShellStore.getState().toggleTransfers();
							}}
							onCancel={(transferId) => {
								void handleCancelTransfer(transferId);
							}}
						/>
					</main>
				}
			/>

			<QuickLook
				target={viewerTarget}
				getSiblings={() => visibleRowsRef.current}
				onNavigate={handleQuickLookNavigate}
				onClose={() => setViewerTarget(null)}
			/>

			<ConnectionDialog
				isOpen={dialog?.kind === "connection"}
				initialConnection={editingConnection}
				onClose={() => {
					closeIf("connection");
				}}
				onSaved={handleConnectionSaved}
			/>

			<OpenUrlDialog
				isOpen={dialog?.kind === "openUrl"}
				connections={connections}
				selectedConnectionId={connectionId}
				currentBucketList={currentBucketList}
				onClose={() => {
					closeIf("openUrl");
				}}
				onSuccess={(target) => {
					setViewerTarget(target);
				}}
			/>

			<RenameDialog
				isOpen={dialog?.kind === "rename"}
				connectionId={connectionId ?? ""}
				bucket={bucket ?? ""}
				item={selectedItem}
				onClose={() => {
					closeIf("rename");
				}}
				onSuccess={handleRenameSuccess}
				onFailure={() => notify.operationFailed("Rename")}
			/>

			<ConfirmDeleteDialog
				isOpen={dialog?.kind === "delete"}
				connectionId={connectionId ?? ""}
				bucket={bucket ?? ""}
				item={selectedItem}
				items={selectedItems}
				onClose={() => {
					closeIf("delete");
				}}
				onSuccess={handleDeleteSuccess}
				onFailure={() => notify.operationFailed("Delete")}
			/>

			<OperationReport
				isOpen={dialog?.kind === "report"}
				title={reportTitle}
				completedCount={operationReport?.completedCount ?? 0}
				remainingKeys={operationReport?.remainingKeys ?? []}
				error={operationReport?.error}
				onClose={() => {
					closeIf("report");
					setOperationReport(null);
				}}
			/>

			<NewFolderDialog
				isOpen={dialog?.kind === "newFolder"}
				connectionId={connectionId}
				bucket={bucket}
				parent={prefix}
				onClose={() => {
					closeIf("newFolder");
				}}
				onCreated={(name) => {
					if (connectionId && bucket) {
						void invalidateKeys(queryClient, invalidations.createFolder(connectionId, bucket, prefix));
					}
					notify.folderCreated(name);
				}}
			/>

			<CommandPalette
				onUpload={() => void handleUpload()}
				onNewFolder={() => openDialog({ kind: "newFolder" })}
				onOpenUrl={() => openDialog({ kind: "openUrl" })}
				onRefresh={handleRefresh}
				onAddConnection={() => openDialog({ kind: "connection", editingId: null })}
				onToggleTransfers={() => useShellStore.getState().toggleTransfers()}
				onNavigate={handleNavigate}
				onSelectBucket={handleSelectBucket}
			/>
		</>
	);
}
