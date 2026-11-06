import {
	useEffect,
	useId,
	useRef,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import { api } from "../api";
import { buildOperationFailedToast, notify } from "../toasts";
import { AlertDialog } from "./ui/alert-dialog";
import { Button } from "./ui/button";

export interface DeleteBucketDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connectionName: string;
	connectionId: string;
	bucket: string;
	onDeleted: (bucket: string, warning?: string) => void;
}

interface Target {
	connectionName: string;
	connectionId: string;
	bucket: string;
}

export function DeleteBucketDialog({
	open,
	onOpenChange,
	connectionName,
	connectionId,
	bucket,
	onDeleted,
}: DeleteBucketDialogProps): JSX.Element | null {
	const inputId = useId();
	const [target, setTarget] = useState<Target>({
		connectionName,
		connectionId,
		bucket,
	});
	const [typed, setTyped] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);
	const busyRef = useRef<boolean>(false);

	// Capture the target only when the dialog opens; later prop changes must not retarget it.
	useEffect(() => {
		if (open) {
			setTarget({ connectionName, connectionId, bucket });
		} else {
			setTyped("");
			setError(null);
			setBusy(false);
			busyRef.current = false;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	if (!open) {
		return null;
	}

	function requestClose(): void {
		if (!busyRef.current) {
			onOpenChange(false);
		}
	}

	async function handleDelete(): Promise<void> {
		if (busyRef.current || typed !== target.bucket) {
			return;
		}
		busyRef.current = true;
		setBusy(true);
		setError(null);
		try {
			const res = await api.buckets.delete({
				connectionId: target.connectionId,
				bucket: target.bucket,
			});
			if (res.ok) {
				onDeleted(target.bucket, res.data.warning);
				onOpenChange(false);
			} else {
				setError(res.error.message);
			}
		} catch {
			notify(buildOperationFailedToast("Delete bucket"));
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}

	return (
		<AlertDialog
			isOpen={open}
			title="Delete bucket"
			onClose={requestClose}
			footer={
				<>
					<Button
						type="button"
						variant="secondary"
						onClick={requestClose}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={busy || typed !== target.bucket}
						onClick={() => {
							void handleDelete();
						}}
					>
						{busy ? "Deleting..." : "Delete bucket"}
					</Button>
				</>
			}
		>
			<p className="app-delete-prompt">
				Delete bucket <strong>{target.bucket}</strong> from connection{" "}
				<strong>{target.connectionName}</strong>? Only an empty bucket
				can be deleted. This cannot be undone.
			</p>
			<div
				className={`tds-text-input app-dialog-field ${error ? "tds-text-input--error" : ""}`}
			>
				<label htmlFor={inputId} className="tds-field-label">
					Type the bucket name to confirm
				</label>
				<input
					id={inputId}
					type="text"
					className="tds-text-input__field"
					value={typed}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setTyped(e.target.value);
					}}
					autoComplete="off"
				/>
				{error && <span className="tds-field-validation">{error}</span>}
			</div>
		</AlertDialog>
	);
}
