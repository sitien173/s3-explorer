import { Button } from "./ui/button";
import { useEffect, useMemo, useState, type JSX } from "react";
import { api, unwrap } from "../api";
import type { BrowserRow } from "../format";
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
	const [count, setCount] = useState<number | null>(null);
	const [counting, setCounting] = useState<boolean>(false);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	const singleItem = useMemo(() => (item ? [item] : []), [item]);
	const deleteItems = items && items.length > 0 ? items : singleItem;
	const isMulti = deleteItems.length > 1;
	const isMultiObject = isMulti && deleteItems.every((selected) => selected.kind === "object");
	const hasFolderInMulti = isMulti && deleteItems.some((selected) => selected.kind === "folder");
	const targetItem = deleteItems.length === 1 ? deleteItems[0] : (isMultiObject ? deleteItems[0] : item);
	const isFolder = deleteItems.length === 1 && targetItem?.kind === "folder";

	useEffect(() => {
		if (!isOpen || deleteItems.length === 0) {
			return;
		}

		setError(null);
		setDeleting(false);
		setProgress(null);

		if (hasFolderInMulti) {
			setError("Folders cannot be multi-deleted.");
			setCount(null);
			setCounting(false);
			return;
		}

		if (isMultiObject) {
			setCount(deleteItems.length);
			setCounting(false);
			return;
		}

		if (!targetItem) {
			setCount(null);
			setCounting(false);
			return;
		}

		if (targetItem.kind === "object") {
			setCount(1);
			setCounting(false);
			return;
		}

		// Folder: call ops.countPrefix first
		setCount(null);
		setCounting(true);

		let active = true;
		void api.ops
			.countPrefix({
				connectionId,
				bucket,
				prefix: targetItem.prefix,
			})
			.then((res) => {
				if (!active) {
					return;
				}
				const data = unwrap(res);
				setCount(data.count);
				setCounting(false);
			})
			.catch((err: unknown) => {
				if (!active) {
					return;
				}
				setCounting(false);
				const message =
					err instanceof Error
						? err.message
						: "Failed to count objects in folder";
				onFailure?.();
				setError(message);
			});

		return () => {
			active = false;
		};
	}, [isOpen, deleteItems, targetItem, isMultiObject, hasFolderInMulti, connectionId, bucket]);

	async function handleDelete(): Promise<void> {
		if (!targetItem || count === null || counting || hasFolderInMulti) {
			return;
		}

		setDeleting(true);
		setError(null);

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
					keys: deleteItems.map(
						(selected) =>
							(selected as Extract<BrowserRow, { kind: "object" }>).key,
					),
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
			const message =
				err instanceof Error ? err.message : "Delete failed";
			onFailure?.();
			setError(message);
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
				<div className="app-dialog-footer-actions">
					<Button
						type="button"
						variant="secondary"
						onClick={handleClose}
						disabled={deleting}
					>
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
			<div className="app-form-layout">
				{error && (
					<div className="tds-announcement tds-announcement--negative app-dialog-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__message">{error}</div>
						</div>
					</div>
				)}

				{progress && (
					<div className="tds-announcement tds-announcement--warning app-dialog-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__title">
								Deleting in progress
							</div>
							<div className="tds-announcement__message">
								Deleting objects: {progress.done} of {progress.total}
							</div>
						</div>
					</div>
				)}

				{counting ? (
					<div className="app-dialog-counting-state">
						<div className="tds-spinner tds-spinner--sm" />
						<span>
							Counting objects under {targetItem?.kind === "folder" ? targetItem.prefix : ""}...
						</span>
					</div>
				) : count !== null && targetItem ? (
					<div className="app-dialog-delete-prompt">
						{targetItem.kind === "folder" ? (
							<p className="app-dialog-delete-text">
								Delete{" "}
								<strong>{count.toLocaleString()}</strong>{" "}
								{count === 1 ? "object" : "objects"} under{" "}
								<code>{targetItem.prefix}</code>?
							</p>
						) : isMultiObject ? (
							<p className="app-dialog-delete-text">Delete {deleteItems.length} objects?</p>
						) : (
							<p className="app-dialog-delete-text">
								Are you sure you want to delete{" "}
								<code>{targetItem.key}</code>?
							</p>
						)}
						<p className="app-dialog-delete-subtext">
							This action cannot be undone.
						</p>
					</div>
				) : null}
			</div>
		</Dialog>
	);
}
