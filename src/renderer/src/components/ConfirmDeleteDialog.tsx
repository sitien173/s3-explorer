import { useEffect, useState, type JSX } from "react";
import { api, unwrap } from "../api";
import type { BrowserRow } from "../format";
import { Dialog } from "./Dialog";
import type { RenameResultReport } from "./RenameDialog";

export interface ConfirmDeleteDialogProps {
	isOpen: boolean;
	connectionId: string;
	bucket: string;
	item: BrowserRow | null;
	onClose: () => void;
	onSuccess: (report?: RenameResultReport) => void;
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
	onClose,
	onSuccess,
}: ConfirmDeleteDialogProps): JSX.Element | null {
	const [count, setCount] = useState<number | null>(null);
	const [counting, setCounting] = useState<boolean>(false);
	const [deleting, setDeleting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	const isFolder = item?.kind === "folder";

	useEffect(() => {
		if (!isOpen || !item) {
			return;
		}

		setError(null);
		setDeleting(false);
		setProgress(null);

		if (item.kind === "object") {
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
				prefix: item.prefix,
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
				setError(message);
			});

		return () => {
			active = false;
		};
	}, [isOpen, item, connectionId, bucket]);

	async function handleDelete(): Promise<void> {
		if (!item || count === null || counting) {
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
			if (item.kind === "folder") {
				const res = await api.ops.deletePrefix({
					opId,
					connectionId,
					bucket,
					prefix: item.prefix,
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
					keys: [item.key],
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
			setError(message);
		} finally {
			unsubscribe();
			setDeleting(false);
		}
	}

	const confirmDisabled = counting || count === null || deleting;

	function handleClose(): void {
		if (deleting) {
			return;
		}
		onClose();
	}

	return (
		<Dialog
			isOpen={isOpen}
			title={isFolder ? "Delete folder" : "Delete object"}
			onClose={handleClose}
			footer={
				<div className="app-dialog-footer-actions">
					<button
						type="button"
						className="tds-btn tds-btn--md tds-btn--secondary"
						onClick={handleClose}
						disabled={deleting}
					>
						Cancel
					</button>
					<button
						type="button"
						className="tds-btn tds-btn--md tds-btn--danger"
						onClick={() => {
							void handleDelete();
						}}
						disabled={confirmDisabled}
					>
						{deleting ? "Deleting..." : "Delete"}
					</button>
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
							Counting objects under {item?.kind === "folder" ? item.prefix : ""}...
						</span>
					</div>
				) : count !== null && item ? (
					<div className="app-dialog-delete-prompt">
						{item.kind === "folder" ? (
							<p className="app-dialog-delete-text">
								Delete{" "}
								<strong>{count.toLocaleString()}</strong>{" "}
								{count === 1 ? "object" : "objects"} under{" "}
								<code>{item.prefix}</code>?
							</p>
						) : (
							<p className="app-dialog-delete-text">
								Are you sure you want to delete{" "}
								<code>{item.key}</code>?
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
