import {
	useEffect,
	useId,
	useState,
	type FormEvent,
	type JSX,
} from "react";
import { api, unwrap } from "../api";
import type { BrowserRow } from "../format";
import { Dialog } from "./Dialog";

export interface RenameResultReport {
	completedCount: number;
	remainingKeys: string[];
	error?: string | null;
}

export interface RenameDialogProps {
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

export function RenameDialog({
	isOpen,
	connectionId,
	bucket,
	item,
	onClose,
	onSuccess,
}: RenameDialogProps): JSX.Element | null {
	const targetKeyId = useId();
	const [targetKey, setTargetKey] = useState<string>("");
	const [submitting, setSubmitting] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	const isFolder = item?.kind === "folder";

	function handleClose(): void {
		if (submitting) {
			return;
		}
		onClose();
	}

	useEffect(() => {
		if (isOpen && item) {
			setTargetKey(isFolder ? item.prefix : item.key);
			setError(null);
			setSubmitting(false);
			setProgress(null);
		}
	}, [isOpen, item, isFolder]);

	async function handleSubmit(e: FormEvent): Promise<void> {
		e.preventDefault();
		if (!item) {
			return;
		}

		let trimmed = targetKey.trim();
		if (!trimmed) {
			setError("Target name cannot be empty.");
			return;
		}

		if (isFolder && !trimmed.endsWith("/")) {
			trimmed = `${trimmed}/`;
		}
		if (!isFolder && trimmed.endsWith("/")) {
			setError("Object key cannot end with a slash.");
			return;
		}

		const currentKey = isFolder ? item.prefix : item.key;
		if (trimmed === currentKey) {
			setError("Target name must be different from current name.");
			return;
		}

		setSubmitting(true);
		setError(null);

		if (isFolder) {
			const opId = createOpId();
			const unsubscribe = api.ops.onProgress((payload) => {
				if (payload.opId === opId) {
					setProgress({ done: payload.done, total: payload.total });
				}
			});

			try {
				const res = await api.ops.renamePrefix({
					opId,
					connectionId,
					bucket,
					fromPrefix: item.prefix,
					toPrefix: trimmed,
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
				onClose();
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Rename failed";
				setError(message);
			} finally {
				unsubscribe();
				setSubmitting(false);
			}
		} else {
			try {
				const res = await api.ops.rename({
					connectionId,
					bucket,
					fromKey: item.key,
					toKey: trimmed,
				});
				unwrap(res);
				onSuccess();
				onClose();
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Rename failed";
				setError(message);
			} finally {
				setSubmitting(false);
			}
		}
	}

	return (
		<Dialog
			isOpen={isOpen}
			title={isFolder ? "Rename or move folder" : "Rename or move object"}
			onClose={handleClose}
			footer={
				<div className="app-dialog-footer-actions">
					<button
						type="button"
						className="tds-btn tds-btn--md tds-btn--secondary"
						onClick={handleClose}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="submit"
						form="app-rename-form"
						className="tds-btn tds-btn--md tds-btn--primary"
						disabled={submitting || !targetKey.trim()}
					>
						{submitting ? "Renaming..." : "Rename"}
					</button>
				</div>
			}
		>
			<form
				id="app-rename-form"
				onSubmit={(e) => {
					void handleSubmit(e);
				}}
				className="app-form-layout"
			>
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
								Renaming in progress
							</div>
							<div className="tds-announcement__message">
								Moving objects: {progress.done} of {progress.total}
							</div>
						</div>
					</div>
				)}

				<div className="tds-text-input">
					<label
						className="tds-field-label"
						htmlFor={targetKeyId}
					>
						{isFolder ? "Target prefix (required)" : "Target key (required)"}
					</label>
					<input
						id={targetKeyId}
						type="text"
						className="tds-text-input__field"
						value={targetKey}
						onChange={(e) => {
							setTargetKey(e.target.value);
							setError(null);
						}}
						disabled={submitting}
						required
						autoFocus
					/>
					<span className="tds-field-caption">
						{isFolder
							? "Enter new folder prefix. Slashing ending will be added if omitted."
							: "Enter the new destination key for this object."}
					</span>
				</div>
			</form>
		</Dialog>
	);
}
