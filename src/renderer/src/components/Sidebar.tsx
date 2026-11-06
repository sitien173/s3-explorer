import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type JSX,
} from "react";
import type { BucketsListResponse } from "../../../shared/ipc";
import { api, IpcErrorWrapper, unwrap } from "../api";
import {
	sortBuckets,
	type BucketItem,
} from "../format";
import { AddBucketDialog } from "./AddBucketDialog";
import { CreateBucketDialog } from "./CreateBucketDialog";
import { DeleteBucketDialog } from "./DeleteBucketDialog";
import { type ConnectionView } from "./ConnectionDialog";
import { Dialog } from "./ui/dialog";
import { Empty, EmptyDescription } from "./ui/empty";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import { SsoBanner } from "./SsoBanner";
import { notify } from "../toasts";

export interface SidebarProps {
	selectedConnectionId: string | null;
	selectedBucket: string | null;
	onSelectConnection: (connectionId: string | null) => void;
	onSelectBucket: (connectionId: string, bucketName: string) => void;
	onOpenAddConnection: () => void;
	onOpenEditConnection: (connection: ConnectionView) => void;
	onBucketDeleted: (connectionId: string, bucket: string) => void;
	refreshKey?: number;
}

export function Sidebar({
	selectedConnectionId,
	selectedBucket,
	onSelectConnection,
	onSelectBucket,
	onOpenAddConnection,
	onOpenEditConnection,
	onBucketDeleted,
	refreshKey = 0,
}: SidebarProps): JSX.Element {
	const [connections, setConnections] = useState<ConnectionView[]>([]);
	const [buckets, setBuckets] = useState<BucketItem[]>([]);
	const [listDenied, setListDenied] = useState<boolean>(false);
	const [loadingBuckets, setLoadingBuckets] = useState<boolean>(false);
	const [ssoProfile, setSsoProfile] = useState<string | null>(null);
	const [bucketsError, setBucketsError] = useState<string | null>(null);
	const [connectionsError, setConnectionsError] = useState<string | null>(
		null,
	);

	const [connectionToDelete, setConnectionToDelete] =
		useState<ConnectionView | null>(null);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [showAddBucket, setShowAddBucket] = useState<boolean>(false);
	const [showCreateBucket, setShowCreateBucket] = useState<boolean>(false);
	const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
	const newBucketBtnRef = useRef<HTMLButtonElement | null>(null);
	const deletedRef = useRef<boolean>(false);
	const bucketListRef = useRef<HTMLDivElement | null>(null);

	const connectionsRef = useRef<ConnectionView[]>(connections);
	connectionsRef.current = connections;
	const bucketRequestIdRef = useRef<number>(0);

	const loadConnections = useCallback(async (): Promise<void> => {
		setConnectionsError(null);
		try {
			const res = await api.connections.list();
			const data = unwrap(res);
			setConnections(data);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setConnectionsError(err.message);
			} else {
				setConnectionsError("Failed to load connections.");
			}
		}
	}, []);

	const loadBuckets = useCallback(
		async (connectionId: string): Promise<void> => {
			bucketRequestIdRef.current += 1;
			const thisRequestId = bucketRequestIdRef.current;

			setLoadingBuckets(true);
			setBucketsError(null);
			setSsoProfile(null);
			setListDenied(false);
			try {
				const res = await api.buckets.list({ connectionId });
				const data: BucketsListResponse = unwrap(res);
				if (bucketRequestIdRef.current !== thisRequestId) {
					return;
				}
				setBuckets(sortBuckets(data.buckets));
				setListDenied(data.listDenied);
			} catch (err: unknown) {
				if (bucketRequestIdRef.current !== thisRequestId) {
					return;
				}
				if (err instanceof IpcErrorWrapper) {
					if (err.code === "SSO_LOGIN_REQUIRED") {
						const conn = connectionsRef.current.find(
							(c) => c.id === connectionId,
						);
						setSsoProfile(
							err.profile || conn?.profile || "default",
						);
					} else {
						setBucketsError(err.message);
					}
				} else if (err instanceof Error) {
					setBucketsError(err.message);
				} else {
					setBucketsError("Failed to load buckets.");
				}
				setBuckets([]);
			} finally {
				if (bucketRequestIdRef.current === thisRequestId) {
					setLoadingBuckets(false);
				}
			}
		},
		[],
	);

	useEffect(() => {
		void loadConnections();
	}, [loadConnections, refreshKey]);

	useEffect(() => {
		if (selectedConnectionId) {
			void loadBuckets(selectedConnectionId);
		} else {
			bucketRequestIdRef.current += 1;
			setBuckets([]);
			setListDenied(false);
			setSsoProfile(null);
			setBucketsError(null);
			setLoadingBuckets(false);
		}
	}, [selectedConnectionId, loadBuckets]);

	async function handlePin(bucketName: string): Promise<void> {
		if (!selectedConnectionId) {
			return;
		}
		try {
			const res = await api.buckets.pin({
				connectionId: selectedConnectionId,
				bucket: bucketName,
			});
			unwrap(res);
			await loadBuckets(selectedConnectionId);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setBucketsError(err.message);
			} else {
				setBucketsError("Failed to pin bucket.");
			}
		}
	}

	async function handleUnpin(bucketName: string): Promise<void> {
		if (!selectedConnectionId) {
			return;
		}
		try {
			const res = await api.buckets.unpin({
				connectionId: selectedConnectionId,
				bucket: bucketName,
			});
			unwrap(res);
			await loadBuckets(selectedConnectionId);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setBucketsError(err.message);
			} else {
				setBucketsError("Failed to unpin bucket.");
			}
		}
	}

	function handleBucketChanged(
		connectionId: string,
		warning: string | undefined,
	): void {
		if (warning) {
			notify({ type: "warning", message: warning });
		}
		void loadBuckets(connectionId);
	}

	async function confirmDelete(): Promise<void> {
		if (!connectionToDelete) {
			return;
		}
		setDeleting(true);
		setDeleteError(null);
		try {
			const res = await api.connections.delete({
				id: connectionToDelete.id,
			});
			unwrap(res);
			if (selectedConnectionId === connectionToDelete.id) {
				onSelectConnection(null);
			}
			setConnectionToDelete(null);
			await loadConnections();
		} catch (err: unknown) {
			if (err instanceof Error) {
				setDeleteError(err.message);
			} else {
				setDeleteError("Failed to delete connection.");
			}
		} finally {
			setDeleting(false);
		}
	}

	return (
		<aside className="app-sidebar tds-side-nav">
			<div className="app-sidebar-header">
				<span className="app-sidebar-title">Connections</span>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onOpenAddConnection}
				>
					Add connection
				</button>
			</div>

			<div className="app-sidebar-content" ref={bucketListRef}>
				{connectionsError && (
					<div className="tds-announcement tds-announcement--error app-sidebar-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__message">
								{connectionsError}
							</div>
						</div>
					</div>
				)}

				{connections.length === 0 ? (
					<Empty className="app-sidebar-empty"><EmptyDescription>No connections configured.</EmptyDescription></Empty>
				) : (
					<div className="tds-nav-list"><div className="app-connection-list">
						{connections.map((conn) => {
							const isSelected = selectedConnectionId === conn.id;
							return (
								<div
									key={conn.id}
									className={`app-connection-item ${isSelected ? "app-connection-item--selected" : ""}`}
								>
									<div className="app-connection-header">
										<button
											type="button"
											className="tds-nav-item app-connection-name-btn"
											onClick={() => {
												onSelectConnection(
													isSelected ? null : conn.id,
												);
											}}
										>
											<span className="app-connection-name">
												{conn.name}
											</span>
											<span className="tds-tag tds-tag--sm app-connection-kind-tag">
												{conn.kind}
											</span>
										</button>
										<div className="app-connection-actions">
											<button
												type="button"
												className="tds-btn tds-btn--sm tds-btn--invisible"
												onClick={() => {
													onOpenEditConnection(conn);
												}}
												aria-label={`Edit ${conn.name}`}
											>
												Edit
											</button>
											<button
												type="button"
												className="tds-btn tds-btn--sm tds-btn--invisible"
												onClick={() => {
													setConnectionToDelete(conn);
												}}
												aria-label={`Delete ${conn.name}`}
											>
												Delete
											</button>
										</div>
									</div>

									{isSelected && (
										<div className="app-connection-details">
											<button
												type="button"
												ref={newBucketBtnRef}
												className="tds-btn tds-btn--sm tds-btn--secondary"
												onClick={() => {
													setShowCreateBucket(true);
												}}
											>
												New bucket
											</button>
											{ssoProfile && (
												<SsoBanner
													profile={ssoProfile}
													onSignedIn={() => {
														void loadBuckets(conn.id);
													}}
												/>
											)}

											{bucketsError && (
												<div className="tds-announcement tds-announcement--error app-sidebar-banner">
													<div className="tds-announcement__content">
														<div className="tds-announcement__message">
															{bucketsError}
														</div>
													</div>
												</div>
											)}

											{loadingBuckets ? (
												<div className="app-sidebar-loading">
													<div className="tds-spinner tds-spinner--sm" />
													<span>Loading buckets...</span>
												</div>
											) : (
												<>
													{listDenied && (
														<div className="app-list-denied-box">
															<span className="app-list-denied-note">
																Listing buckets
																denied by IAM
															</span>
															<button
																type="button"
																className="tds-btn tds-btn--sm tds-btn--secondary"
																onClick={() => {
																	setShowAddBucket(
																		true,
																	);
																}}
															>
																Add bucket by
																name
															</button>
														</div>
													)}

													{buckets.length > 0 ? (
														<div className="app-bucket-list">
															{buckets.map((b) => {
																const isBucketActive =
																	selectedBucket ===
																	b.name;
																return (
																	<ContextMenu key={b.name}>
																	<ContextMenuTrigger asChild>
																	<div className={`app-bucket-row ${isBucketActive ? "app-bucket-row--active" : ""}`}>
																		<button
																			type="button"
																			className="app-bucket-name-btn"
																			data-bucket={b.name}
																			onClick={() => {
																				onSelectBucket(
																					conn.id,
																					b.name,
																				);
																			}}
																		>
																			<span className="app-bucket-name">
																				{
																					b.name
																				}
																			</span>
																		</button>
																		{b.pinned ? (
																			<button
																				type="button"
																				className="tds-btn tds-btn--sm tds-btn--invisible app-pin-btn"
																				onClick={() => {
																					void handleUnpin(
																						b.name,
																					);
																				}}
																				aria-label={`Unpin ${b.name}`}
																				title="Unpin bucket"
																			>
																				Pinned
																			</button>
																		) : (
																			<button
																				type="button"
																				className="tds-btn tds-btn--sm tds-btn--invisible app-pin-btn"
																				onClick={() => {
																					void handlePin(
																						b.name,
																					);
																				}}
																				aria-label={`Pin ${b.name}`}
																				title="Pin bucket"
																			>
																				Pin
																			</button>
																		)}
																	</div>
																	</ContextMenuTrigger>
																	<ContextMenuContent>
																		<ContextMenuItem onSelect={() => onSelectBucket(conn.id, b.name)}>Open</ContextMenuItem>
																		<ContextMenuItem onSelect={() => void (b.pinned ? handleUnpin(b.name) : handlePin(b.name))}>{b.pinned ? "Unpin" : "Pin"}</ContextMenuItem>
																		<ContextMenuItem onSelect={() => setBucketToDelete(b.name)}>Delete bucket</ContextMenuItem>
																	</ContextMenuContent>
																</ContextMenu>
															);
															})}
														</div>
													) : (
														!loadingBuckets &&
														!ssoProfile &&
														!listDenied && (
															<div className="app-sidebar-empty">
																No buckets found
															</div>
														)
													)}
												</>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div></div>
				)}
			</div>

			{showAddBucket && selectedConnectionId && (
				<AddBucketDialog
					isOpen={showAddBucket}
					connectionId={selectedConnectionId}
					onClose={() => {
						setShowAddBucket(false);
					}}
					onAdded={() => {
						void loadBuckets(selectedConnectionId);
					}}
				/>
			)}

			{selectedConnectionId && (
				<CreateBucketDialog
					open={showCreateBucket}
					onOpenChange={setShowCreateBucket}
					connectionId={selectedConnectionId}
					existingNames={buckets.map((b) => b.name)}
					onCreated={(_bucket, warning) => {
						handleBucketChanged(selectedConnectionId, warning);
					}}
				/>
			)}

			{selectedConnectionId && bucketToDelete && (
				<DeleteBucketDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							const closed = bucketToDelete;
							setBucketToDelete(null);
							// Run after the dialog's own focus restore, which targets the unmounted menu item.
							setTimeout(() => {
								const trigger = Array.from(
									bucketListRef.current?.querySelectorAll<HTMLElement>("[data-bucket]") ?? [],
								).find((el) => el.dataset.bucket === closed);
								(deletedRef.current ? newBucketBtnRef.current : (trigger ?? newBucketBtnRef.current))?.focus();
								deletedRef.current = false;
							}, 0);
						}
					}}
					connectionName={
						connections.find((c) => c.id === selectedConnectionId)
							?.name ?? ""
					}
					connectionId={selectedConnectionId}
					bucket={bucketToDelete}
					onDeleted={(bucket, warning) => {
						deletedRef.current = true;
						handleBucketChanged(selectedConnectionId, warning);
						onBucketDeleted(selectedConnectionId, bucket);
					}}
				/>
			)}

			<Dialog
				isOpen={Boolean(connectionToDelete)}
				title="Delete connection"
				onClose={() => {
					setConnectionToDelete(null);
				}}
				footer={
					<>
						<button
							type="button"
							className="tds-btn tds-btn--md tds-btn--secondary"
							onClick={() => {
								setConnectionToDelete(null);
							}}
							disabled={deleting}
						>
							Cancel
						</button>
						<button
							type="button"
							className="tds-btn tds-btn--md tds-btn--danger"
							onClick={() => {
								void confirmDelete();
							}}
							disabled={deleting}
						>
							{deleting ? "Deleting..." : "Delete connection"}
						</button>
					</>
				}
			>
				{deleteError && (
					<div className="tds-announcement tds-announcement--error app-dialog-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__message">
								{deleteError}
							</div>
						</div>
					</div>
				)}
				{connectionToDelete && (
					<p className="app-delete-prompt">
						Are you sure you want to delete connection{" "}
						<strong>{connectionToDelete.name}</strong>? This will
						remove all stored credentials and pinned buckets for
						this connection.
					</p>
				)}
			</Dialog>
		</aside>
	);
}
