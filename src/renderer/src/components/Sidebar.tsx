import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo, useRef, useState, type JSX } from "react";
import { api, IpcErrorWrapper, unwrap } from "../api";
import { sortBuckets, type BucketItem } from "../format";
import { AddBucketDialog } from "./AddBucketDialog";
import { CreateBucketDialog } from "./CreateBucketDialog";
import { DeleteBucketDialog } from "./DeleteBucketDialog";
import type { ConnectionView } from "./ConnectionDialog";
import { BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { Spinner } from "./ui/spinner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Empty, EmptyDescription } from "./ui/empty";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import { SsoBanner } from "./SsoBanner";
import { notify } from "../toasts";
import { bucketsQuery, connectionsQuery, invalidateKeys, invalidations, queryKeys } from "../queries";
import { cn } from "../lib/utils";
import { isMac } from "../platform";

export interface SidebarProps {
	selectedConnectionId: string | null;
	selectedBucket: string | null;
	onSelectConnection: (connectionId: string | null) => void;
	onSelectBucket: (connectionId: string, bucketName: string) => void;
	onOpenAddConnection: () => void;
	onOpenEditConnection: (connection: ConnectionView) => void;
	onBucketDeleted: (connectionId: string, bucket: string) => void;
}

export function Sidebar({
	selectedConnectionId,
	selectedBucket,
	onSelectConnection,
	onSelectBucket,
	onOpenAddConnection,
	onOpenEditConnection,
	onBucketDeleted,
}: SidebarProps): JSX.Element {
	const queryClient = useQueryClient();
	const connectionsQ = useQuery(connectionsQuery());
	const connections: ConnectionView[] = connectionsQ.data ?? [];
	const connectionsError = connectionsQ.isError ? connectionsQ.error.message || "Failed to load connections." : null;

	const bucketsQ = useQuery({
		...bucketsQuery(selectedConnectionId ?? ""),
		enabled: Boolean(selectedConnectionId),
	});
	const buckets: BucketItem[] = useMemo(() => sortBuckets(bucketsQ.data?.buckets ?? []), [bucketsQ.data]);
	const listDenied = bucketsQ.data?.listDenied ?? false;
	const loadingBuckets = Boolean(selectedConnectionId) && bucketsQ.isLoading;
	const bucketsErr = bucketsQ.isError ? bucketsQ.error : null;
	const ssoRequired = bucketsErr instanceof IpcErrorWrapper && bucketsErr.code === "SSO_LOGIN_REQUIRED";
	const ssoProfile = ssoRequired
		? bucketsErr.profile || connections.find((c) => c.id === selectedConnectionId)?.profile || "default"
		: null;
	const [pinError, setPinError] = useState<string | null>(null);
	const bucketsError = ssoRequired
		? null
		: (pinError ?? (bucketsErr ? bucketsErr.message || "Failed to load buckets." : null));

	const [connectionToDelete, setConnectionToDelete] = useState<ConnectionView | null>(null);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [showAddBucket, setShowAddBucket] = useState<boolean>(false);
	const [showCreateBucket, setShowCreateBucket] = useState<boolean>(false);
	const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
	const newBucketBtnRef = useRef<HTMLButtonElement | null>(null);
	const deletedRef = useRef<boolean>(false);
	const bucketListRef = useRef<HTMLDivElement | null>(null);

	const [pinErrorConnectionId, setPinErrorConnectionId] = useState(selectedConnectionId);
	if (pinErrorConnectionId !== selectedConnectionId) {
		setPinErrorConnectionId(selectedConnectionId);
		setPinError(null);
	}

	async function handlePin(bucketName: string): Promise<void> {
		await togglePin(bucketName, true);
	}

	async function handleUnpin(bucketName: string): Promise<void> {
		await togglePin(bucketName, false);
	}

	async function togglePin(bucketName: string, pin: boolean): Promise<void> {
		if (!selectedConnectionId) {
			return;
		}
		setPinError(null);
		try {
			const request = { connectionId: selectedConnectionId, bucket: bucketName };
			unwrap(await (pin ? api.buckets.pin(request) : api.buckets.unpin(request)));
			await invalidateKeys(
				queryClient,
				pin ? invalidations.pinBucket(selectedConnectionId) : invalidations.unpinBucket(selectedConnectionId),
			);
		} catch (err: unknown) {
			setPinError(err instanceof Error ? err.message : `Failed to ${pin ? "pin" : "unpin"} bucket.`);
		}
	}

	function handleBucketChanged(keys: QueryKey[], warning: string | undefined): void {
		if (warning) {
			notify({ type: "warning", message: warning });
		}
		void invalidateKeys(queryClient, keys);
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
			queryClient.removeQueries({ queryKey: queryKeys.connection(connectionToDelete.id) });
			await invalidateKeys(queryClient, invalidations.saveConnection());
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
		<aside className="flex h-full w-full min-w-0 flex-col bg-sidebar">
			<div
				className={cn(
					"flex h-11 shrink-0 items-center justify-between border-b border-separator bg-background px-4 app-drag",
					isMac && "pl-[78px]",
				)}
			>
				<span className="text-sm font-semibold text-foreground">Connections</span>
				<Button type="button" variant="secondary" size="sm" className="app-no-drag" onClick={onOpenAddConnection}>
					Add connection
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-2" ref={bucketListRef}>
				{connectionsError && (
					<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="min-w-0 flex-1">
							<div>{connectionsError}</div>
						</div>
					</div>
				)}

				{connections.length === 0 ? (
					<Empty className="p-6 text-center text-sm text-foreground-secondary">
						<EmptyDescription>No connections configured.</EmptyDescription>
					</Empty>
				) : (
					<div>
						<div className="flex flex-col gap-1">
							{connections.map((conn) => {
								const isSelected = selectedConnectionId === conn.id;
								return (
									<div
										key={conn.id}
										className={cn(
											"rounded-surface border border-transparent bg-background transition-[background-color,border-color] duration-150 ease-out",
											isSelected && "border-separator bg-surface",
										)}
									>
										<div className="flex items-center justify-between gap-1 px-2 py-1">
											<button
												type="button"
												className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-control px-2 py-1 text-left text-foreground hover:bg-foreground/[0.06]"
												onClick={() => {
													onSelectConnection(isSelected ? null : conn.id);
												}}
											>
												<span className="min-w-0 truncate text-sm font-medium text-foreground">{conn.name}</span>
												<Badge>{conn.kind}</Badge>
											</button>
											<div className="flex shrink-0 items-center gap-1">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														onOpenEditConnection(conn);
													}}
													aria-label={`Edit ${conn.name}`}
												>
													Edit
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => {
														setConnectionToDelete(conn);
													}}
													aria-label={`Delete ${conn.name}`}
												>
													Delete
												</Button>
											</div>
										</div>

										{isSelected && (
											<div className="flex flex-col gap-1 border-t border-separator pt-1 pr-2 pb-2 pl-3">
												<Button
													type="button"
													ref={newBucketBtnRef}
													variant="secondary"
													size="sm"
													onClick={() => {
														setShowCreateBucket(true);
													}}
												>
													New bucket
												</Button>
												{ssoProfile && (
													<SsoBanner
														profile={ssoProfile}
														onSignedIn={() => {
															void bucketsQ.refetch();
														}}
													/>
												)}

												{bucketsError && (
													<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
														<div className="min-w-0 flex-1">
															<div>{bucketsError}</div>
														</div>
													</div>
												)}

												{loadingBuckets ? (
													<div className="flex items-center gap-2 p-3 text-xs text-foreground-secondary">
														<Spinner className="size-3" />
														<span>Loading buckets...</span>
													</div>
												) : (
													<>
														{listDenied && (
															<div className="mb-2 flex items-center justify-between rounded-control bg-foreground/[0.06] px-2 py-1">
																<span className="text-xs text-foreground-secondary">Listing buckets denied by IAM</span>
																<Button
																	type="button"
																	variant="secondary"
																	size="sm"
																	onClick={() => {
																		setShowAddBucket(true);
																	}}
																>
																	Add bucket by name
																</Button>
															</div>
														)}

														{buckets.length > 0 ? (
															<div className="flex flex-col gap-1">
																{buckets.map((b) => {
																	const isBucketActive = selectedBucket === b.name;
																	return (
																		<ContextMenu key={b.name}>
																			<ContextMenuTrigger
																				render={
																					<div
																						className={cn(
																							"flex items-center justify-between rounded-control px-2 py-1 transition-colors duration-150 ease-out hover:bg-foreground/[0.06]",
																							isBucketActive && "border border-accent bg-selection",
																						)}
																					/>
																				}
																			>
																				<button
																					type="button"
																					className="min-w-0 flex-1 cursor-pointer truncate bg-transparent p-0 text-left text-xs text-foreground"
																					data-bucket={b.name}
																					onClick={() => {
																						onSelectBucket(conn.id, b.name);
																					}}
																				>
																					<span className="text-xs text-foreground">{b.name}</span>
																				</button>
																				{b.pinned ? (
																					<Button
																						type="button"
																						variant="ghost"
																						size="sm"
																						className="text-foreground-secondary"
																						onClick={() => {
																							void handleUnpin(b.name);
																						}}
																						aria-label={`Unpin ${b.name}`}
																						title="Unpin bucket"
																					>
																						Pinned
																					</Button>
																				) : (
																					<Button
																						type="button"
																						variant="ghost"
																						size="sm"
																						className="text-foreground-secondary"
																						onClick={() => {
																							void handlePin(b.name);
																						}}
																						aria-label={`Pin ${b.name}`}
																						title="Pin bucket"
																					>
																						Pin
																					</Button>
																				)}
																			</ContextMenuTrigger>
																			<ContextMenuContent>
																				<ContextMenuItem onClick={() => onSelectBucket(conn.id, b.name)}>
																					Open
																				</ContextMenuItem>
																				<ContextMenuItem
																					onClick={() => void (b.pinned ? handleUnpin(b.name) : handlePin(b.name))}
																				>
																					{b.pinned ? "Unpin" : "Pin"}
																				</ContextMenuItem>
																				<ContextMenuItem onClick={() => setBucketToDelete(b.name)}>
																					Delete bucket
																				</ContextMenuItem>
																			</ContextMenuContent>
																		</ContextMenu>
																	);
																})}
															</div>
														) : (
															!loadingBuckets &&
															!ssoProfile &&
															!listDenied && (
																<div className="p-6 text-center text-sm text-foreground-secondary">
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
						</div>
					</div>
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
						void invalidateKeys(queryClient, invalidations.addBucket(selectedConnectionId));
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
						handleBucketChanged(invalidations.createBucket(selectedConnectionId), warning);
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
					connectionName={connections.find((c) => c.id === selectedConnectionId)?.name ?? ""}
					connectionId={selectedConnectionId}
					bucket={bucketToDelete}
					onDeleted={(bucket, warning) => {
						deletedRef.current = true;
						// Drop the deleted bucket's listings instead of refetching them.
						queryClient.removeQueries({ queryKey: queryKeys.bucketObjects(selectedConnectionId, bucket) });
						handleBucketChanged([queryKeys.buckets(selectedConnectionId)], warning);
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
						<Button
							type="button"
							variant="secondary"
							onClick={() => {
								setConnectionToDelete(null);
							}}
							disabled={deleting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								void confirmDelete();
							}}
							disabled={deleting}
						>
							{deleting ? "Deleting..." : "Delete connection"}
						</Button>
					</>
				}
			>
				{deleteError && (
					<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="min-w-0 flex-1">
							<div>{deleteError}</div>
						</div>
					</div>
				)}
				{connectionToDelete && (
					<p className="m-0 text-sm leading-5 text-foreground">
						Are you sure you want to delete connection <strong>{connectionToDelete.name}</strong>? This will remove all
						stored credentials and pinned buckets for this connection.
					</p>
				)}
			</Dialog>
		</aside>
	);
}
