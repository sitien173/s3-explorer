import { Button } from "./ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, type JSX } from "react";
import { useForm } from "react-hook-form";
import { api, unwrap } from "../api";
import { addBucketFormSchema } from "../forms";
import { Dialog } from "@/components/ui/dialog";
import { FieldError } from "./ui/field";
import { Input } from "./ui/input";

export interface AddBucketDialogProps {
	isOpen: boolean;
	connectionId: string;
	onClose: () => void;
	onAdded: (bucketName: string) => void;
}

export function AddBucketDialog({ isOpen, connectionId, onClose, onAdded }: AddBucketDialogProps): JSX.Element | null {
	const bucketInputId = useId();
	const {
		register,
		handleSubmit,
		reset,
		setError,
		formState: { errors, isSubmitting: saving },
	} = useForm<{ bucket: string }, unknown, { bucket: string }>({
		resolver: zodResolver(addBucketFormSchema),
		defaultValues: { bucket: "" },
	});

	useEffect(() => {
		if (!isOpen) {
			reset({ bucket: "" });
		}
	}, [isOpen, reset]);

	if (!isOpen) {
		return null;
	}

	async function onValid({ bucket }: { bucket: string }): Promise<void> {
		try {
			const res = await api.buckets.add({
				connectionId,
				bucket,
			});
			unwrap(res);
			onAdded(bucket);
			onClose();
		} catch (err: unknown) {
			setError("bucket", { message: err instanceof Error ? err.message : "Failed to add bucket." });
		}
	}

	const footer = (
		<>
			<Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
				Cancel
			</Button>
			<Button
				type="button"
				variant="default"
				disabled={saving}
				onClick={() => {
					void handleSubmit(onValid)();
				}}
			>
				{saving ? "Adding..." : "Add bucket"}
			</Button>
		</>
	);

	return (
		<Dialog isOpen={isOpen} title="Add bucket by name" onClose={onClose} footer={footer}>
			<div className="flex w-full min-w-0 flex-col gap-1">
				<label htmlFor={bucketInputId} className="text-xs font-medium text-foreground">
					Bucket name (required)
				</label>
				<Input
					id={bucketInputId}
					type="text"
					className={errors.bucket ? "border-destructive" : undefined}
					{...register("bucket")}
					placeholder="my-bucket-name"
				/>
				<span className="text-xs text-foreground-secondary">
					Specify bucket directly when listing is restricted by IAM policy
				</span>
				<FieldError error={errors.bucket} />
			</div>
		</Dialog>
	);
}
