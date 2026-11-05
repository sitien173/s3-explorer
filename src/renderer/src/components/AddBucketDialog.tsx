import { Button } from "./ui/button";
import {
	useEffect,
	useId,
	useState,
	type ChangeEvent,
	type JSX,
} from "react";
import { api, unwrap } from "../api";
import { Dialog } from "@/components/ui/dialog";

export interface AddBucketDialogProps {
	isOpen: boolean;
	connectionId: string;
	onClose: () => void;
	onAdded: (bucketName: string) => void;
}

const BUCKET_NAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function AddBucketDialog({
	isOpen,
	connectionId,
	onClose,
	onAdded,
}: AddBucketDialogProps): JSX.Element | null {
	const bucketInputId = useId();
	const [bucketName, setBucketName] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState<boolean>(false);

	useEffect(() => {
		if (!isOpen) {
			setBucketName("");
			setError(null);
			setSaving(false);
		}
	}, [isOpen]);

	if (!isOpen) {
		return null;
	}

	async function handleSubmit(): Promise<void> {
		const trimmed = bucketName.trim();
		if (!trimmed) {
			setError("Bucket name is required.");
			return;
		}
		if (!BUCKET_NAME_REGEX.test(trimmed)) {
			setError(
				"Invalid bucket name. Must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores (max 255 chars).",
			);
			return;
		}

		setSaving(true);
		setError(null);
		try {
			const res = await api.buckets.add({
				connectionId,
				bucket: trimmed,
			});
			unwrap(res);
			onAdded(trimmed);
			onClose();
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError("Failed to add bucket.");
			}
		} finally {
			setSaving(false);
		}
	}

	const footer = (
		<>
			<Button
				type="button"
				variant="secondary"
				onClick={onClose}
				disabled={saving}
			>
				Cancel
			</Button>
			<Button
				type="button"
				variant="default"
				disabled={saving}
				onClick={() => {
					void handleSubmit();
				}}
			>
				{saving ? "Adding..." : "Add bucket"}
			</Button>
		</>
	);

	return (
		<Dialog
			isOpen={isOpen}
			title="Add bucket by name"
			onClose={onClose}
			footer={footer}
		>
			<div
				className={`tds-text-input app-dialog-field ${error ? "tds-text-input--error" : ""}`}
			>
				<label htmlFor={bucketInputId} className="tds-field-label">
					Bucket name (required)
				</label>
				<input
					id={bucketInputId}
					type="text"
					className="tds-text-input__field"
					value={bucketName}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setBucketName(e.target.value);
						if (error) {
							setError(null);
						}
					}}
					placeholder="my-bucket-name"
				/>
				<span className="tds-field-caption">
					Specify bucket directly when listing is restricted by IAM
					policy
				</span>
				{error && (
					<span className="tds-field-validation">{error}</span>
				)}
			</div>
		</Dialog>
	);
}
