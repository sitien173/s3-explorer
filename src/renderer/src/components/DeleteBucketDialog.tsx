import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX } from "react";
import { api } from "../api";
import { buildOperationFailedToast, notify } from "../toasts";
import { AlertDialog } from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

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
	// biome-ignore lint/correctness/useExhaustiveDependencies: target is captured only on open transitions
	useEffect(() => {
		if (open) {
			setTarget({ connectionName, connectionId, bucket });
		} else {
			setTyped("");
			setError(null);
			setBusy(false);
			busyRef.current = false;
		}
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
					<Button type="button" variant="secondary" onClick={requestClose} disabled={busy}>
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
			<p className="m-0 text-sm text-foreground">
				Delete bucket <strong>{target.bucket}</strong> from connection <strong>{target.connectionName}</strong>? Only an
				empty bucket can be deleted. This cannot be undone.
			</p>
			<div className="flex w-full min-w-0 flex-col gap-1">
				<label htmlFor={inputId} className="text-xs font-medium text-foreground">
					Type the bucket name to confirm
				</label>
				<Input
					id={inputId}
					type="text"
					className={error ? "border-destructive" : undefined}
					value={typed}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setTyped(e.target.value);
					}}
					autoComplete="off"
				/>
				{error && <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">{error}</span>}
			</div>
		</AlertDialog>
	);
}
