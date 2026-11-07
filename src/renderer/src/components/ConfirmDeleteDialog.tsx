import { Button } from "./ui/button";
import { BANNER_DESTRUCTIVE_CLASS, BANNER_SEPARATOR_CLASS } from "./ui/alert";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useState, type JSX } from "react";
import { api, unwrap } from "../api";
import type { BrowserRow } from "../format";
import { countPrefixQuery } from "../queries";
import { AlertDialog as Dialog } from "@/components/ui/alert-dialog";
import type { RenameResultReport } from "./RenameDialog";

export interface ConfirmDeleteDialogProps {
	isOpen: boolean;
	connectionId: string;
	bucket: string;
	item: BrowserRow | null;
	items?: BrowserRow[];
	onClose: () => void;
	onSuccess: (report?: RenameResultReport) => void;
	onFailure?: () => void;
}

function createOpId(): string {
	const rand = Math.random().toString(36).slice(2, 10);
	const time = Date.now().toString(36);
	return `op-${time}-${rand}`;
}

export function ConfirmDeleteDialog({
	isOpen,
	connectionId,
	bucket,
	item,
	items,
	onClose,
	onSuccess,
	onFailure,
}: ConfirmDeleteDialogProps): JSX.Element | null {
	const [deleting, setDeleting] = useState<boolean>(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	const singleItem = useMemo(() => (item ? [item] : []), [item]);
	const deleteItems = items && items.length > 0 ? items : singleItem;
	const isMulti = deleteItems.length > 1;
	const isMultiObject = isMulti && deleteItems.every((selected) => selected.kind === "object");
	const hasFolderInMulti = isMulti && deleteItems.some((selected) => selected.kind === "folder");
	const targetItem = deleteItems.length === 1 ? deleteItems[0] : isMultiObject ? deleteItems[0] : item;
	const isFolder = deleteItems.length === 1 && targetItem?.kind === "folder";

	const [resetKey, setResetKey] = useState({ isOpen, deleteItems });
	if (resetKey.isOpen !== isOpen || resetKey.deleteItems !== deleteItems) {
		setResetKey({ isOpen, deleteItems });
		setDeleteError(null);
		setDeleting(false);
		setProgress(null);
	}

	const countTarget =
		isOpen && !hasFolderInMulti && !isMultiObject && targetItem?.kind === "folder" ? targetItem : null;
	const countQuery = useQuery({
		...countPrefixQuery({ connectionId, bucket, prefix: countTarget?.prefix ?? "" }),
		enabled: countTarget !== null,
	});
	const counting = countTarget !== null && countQuery.isFetching;
	const count = countTarget
		? counting
			? null
			: (countQuery.data?.count ?? null)
		: hasFolderInMulti
			? null
			: isMultiObject
				? deleteItems.length
				: targetItem?.kind === "object"
					? 1
					: null;
	const countError = countTarget && !counting && countQuery.error ? countQuery.error : null;
	const error = hasFolderInMulti
		? "Folders cannot be multi-deleted."
		: (deleteError ?? (countError ? countError.message || "Failed to count objects in folder" : null));

	const notifyCountFailure = useEffectEvent(() => {
		onFailure?.();
	});
	useEffect(() => {
		if (countError) {
			notifyCountFailure();
		}
	}, [countError]);

	async function handleDelete(): Promise<void> {
		if (!targetItem || count === null || counting || hasFolderInMulti) {
			return;
		}

		setDeleting(true);
		setDeleteError(null);

		const opId = createOpId();
		const unsubscribe = api.ops.onProgress((payload) => {
			if (payload.opId === opId) {
				setProgress({ done: payload.done, total: payload.total });
			}
		});

		try {
			if (isMultiObject) {
				const res = await api.ops.delete({
					opId,
					connectionId,
					bucket,
					keys: deleteItems.map((selected) => (selected as Extract<BrowserRow, { kind: "object" }>).key),
				});
				const data = unwrap(res);

				if (data.remaining.length > 0 || data.error) {
					onSuccess({
						completedCount: data.completed.length,
						remainingKeys: data.remaining,
						error: data.error?.message,
					});
				} else {
					onSuccess();
				}
			} else if (targetItem.kind === "folder") {
				const res = await api.ops.deletePrefix({
					opId,
					connectionId,
					bucket,
					prefix: targetItem.prefix,
				});
				const data = unwrap(res);

				if (data.remaining.length > 0 || data.error) {
					onSuccess({
						completedCount: data.completed.length,
						remainingKeys: data.remaining,
						error: data.error?.message,
					});
				} else {
					onSuccess();
				}
			} else {
				const res = await api.ops.delete({
					opId,
					connectionId,
					bucket,
					keys: [targetItem.key],
				});
				const data = unwrap(res);

				if (data.remaining.length > 0 || data.error) {
					onSuccess({
						completedCount: data.completed.length,
						remainingKeys: data.remaining,
						error: data.error?.message,
					});
				} else {
					onSuccess();
				}
			}
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Delete failed";
			onFailure?.();
			setDeleteError(message);
		} finally {
			unsubscribe();
			setDeleting(false);
		}
	}

	const confirmDisabled = counting || count === null || deleting || hasFolderInMulti;

	function handleClose(): void {
		if (deleting) {
			return;
		}
		onClose();
	}

	return (
		<Dialog
			isOpen={isOpen}
			title={
				isFolder
					? "Delete folder"
					: isMultiObject
						? `Delete ${deleteItems.length} objects`
						: hasFolderInMulti
							? "Delete"
							: "Delete object"
			}
			onClose={handleClose}
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button type="button" variant="secondary" onClick={handleClose} disabled={deleting}>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={() => {
							void handleDelete();
						}}
						disabled={confirmDisabled}
					>
						{deleting ? "Deleting..." : "Delete"}
					</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-3">
				{error && (
					<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
							<div className="text-sm text-foreground-secondary">{error}</div>
						</div>
					</div>
				)}

				{progress && (
					<div className={cn("mb-2 w-full", BANNER_SEPARATOR_CLASS)}>
						<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
							<div className="text-sm font-medium text-foreground">Deleting in progress</div>
							<div className="text-sm text-foreground-secondary">
								Deleting objects: {progress.done} of {progress.total}
							</div>
						</div>
					</div>
				)}

				{counting ? (
					<div className="flex items-center gap-2 p-3 text-sm text-foreground-secondary">
						<Spinner className="size-6" />
						<span>Counting objects under {targetItem?.kind === "folder" ? targetItem.prefix : ""}...</span>
					</div>
				) : count !== null && targetItem ? (
					<div className="flex flex-col gap-1">
						{targetItem.kind === "folder" ? (
							<p className="m-0 text-sm text-foreground">
								Delete <strong>{count.toLocaleString()}</strong> {count === 1 ? "object" : "objects"} under{" "}
								<code>{targetItem.prefix}</code>?
							</p>
						) : isMultiObject ? (
							<p className="m-0 text-sm text-foreground">Delete {deleteItems.length} objects?</p>
						) : (
							<p className="m-0 text-sm text-foreground">
								Are you sure you want to delete <code>{targetItem.key}</code>?
							</p>
						)}
						<p className="m-0 text-xs text-foreground-secondary">This action cannot be undone.</p>
					</div>
				) : null}
			</div>
		</Dialog>
	);
}
