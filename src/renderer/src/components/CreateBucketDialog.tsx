import {
	useEffect,
	useId,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
	type JSX,
} from "react";
import { createBucketName } from "../../../shared/ipc";
import { api } from "../api";
import { buildOperationFailedToast, notify } from "../toasts";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export interface CreateBucketDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connectionId: string;
	existingNames: string[];
	onCreated: (bucket: string, warning?: string) => void;
}

export function CreateBucketDialog({
	open,
	onOpenChange,
	connectionId,
	existingNames,
	onCreated,
}: CreateBucketDialogProps): JSX.Element | null {
	const inputId = useId();
	const [name, setName] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);
	const busyRef = useRef<boolean>(false);

	useEffect(() => {
		if (!open) {
			setName("");
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

	async function handleSubmit(): Promise<void> {
		if (busyRef.current) {
			return;
		}
		const trimmed = name.trim();
		const parsed = createBucketName.safeParse(trimmed);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Invalid bucket name");
			return;
		}
		if (existingNames.includes(trimmed)) {
			setError("A bucket with this name is already listed");
			return;
		}

		busyRef.current = true;
		setBusy(true);
		setError(null);
		try {
			const res = await api.buckets.create({
				connectionId,
				bucket: trimmed,
			});
			if (res.ok) {
				onCreated(trimmed, res.data.warning);
				onOpenChange(false);
			} else {
				setError(res.error.message);
			}
		} catch {
			notify(buildOperationFailedToast("Create bucket"));
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}

	return (
		<Dialog
			isOpen={open}
			title="New bucket"
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
						type="submit"
						variant="default"
						form={`${inputId}-form`}
						disabled={busy}
					>
						{busy ? "Creating..." : "Create bucket"}
					</Button>
				</>
			}
		>
			<form
				id={`${inputId}-form`}
				onSubmit={(e: FormEvent<HTMLFormElement>) => {
					e.preventDefault();
					void handleSubmit();
				}}
			>
				<div
					className={`tds-text-input app-dialog-field ${error ? "tds-text-input--error" : ""}`}
				>
					<label htmlFor={inputId} className="tds-field-label">
						Bucket name (required)
					</label>
					<input
						id={inputId}
						type="text"
						className="tds-text-input__field"
						value={name}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							setName(e.target.value);
							if (error) {
								setError(null);
							}
						}}
						placeholder="my-new-bucket"
					/>
					{error && (
						<span className="tds-field-validation">{error}</span>
					)}
				</div>
			</form>
		</Dialog>
	);
}
