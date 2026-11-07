import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useRef, type JSX } from "react";
import { useForm } from "react-hook-form";
import { api } from "../api";
import { createBucketFormSchema } from "../forms";
import { buildOperationFailedToast, notify } from "../toasts";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { FieldError } from "./ui/field";
import { Input } from "./ui/input";

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
	const schema = useMemo(() => createBucketFormSchema(existingNames), [existingNames]);
	const {
		register,
		handleSubmit,
		reset,
		setError,
		formState: { errors, isSubmitting: busy },
	} = useForm<{ bucket: string }, unknown, { bucket: string }>({
		resolver: zodResolver(schema),
		defaultValues: { bucket: "" },
	});
	const busyRef = useRef<boolean>(false);

	useEffect(() => {
		if (!open) {
			reset({ bucket: "" });
			busyRef.current = false;
		}
	}, [open, reset]);

	if (!open) {
		return null;
	}

	function requestClose(): void {
		if (!busyRef.current) {
			onOpenChange(false);
		}
	}

	async function onValid({ bucket }: { bucket: string }): Promise<void> {
		if (busyRef.current) {
			return;
		}
		busyRef.current = true;
		try {
			const res = await api.buckets.create({
				connectionId,
				bucket,
			});
			if (res.ok) {
				onCreated(bucket, res.data.warning);
				onOpenChange(false);
			} else {
				setError("bucket", { message: res.error.message });
			}
		} catch {
			notify(buildOperationFailedToast("Create bucket"));
		} finally {
			busyRef.current = false;
		}
	}

	return (
		<Dialog
			isOpen={open}
			title="New bucket"
			onClose={requestClose}
			footer={
				<>
					<Button type="button" variant="secondary" onClick={requestClose} disabled={busy}>
						Cancel
					</Button>
					<Button type="submit" variant="default" form={`${inputId}-form`} disabled={busy}>
						{busy ? "Creating..." : "Create bucket"}
					</Button>
				</>
			}
		>
			<form
				id={`${inputId}-form`}
				onSubmit={(e) => {
					void handleSubmit(onValid)(e);
				}}
			>
				<div className="flex w-full min-w-0 flex-col gap-1">
					<label htmlFor={inputId} className="text-xs font-medium text-foreground">
						Bucket name (required)
					</label>
					<Input
						id={inputId}
						type="text"
						className={errors.bucket ? "border-destructive" : undefined}
						{...register("bucket")}
						placeholder="my-new-bucket"
					/>
					<FieldError error={errors.bucket} />
				</div>
			</form>
		</Dialog>
	);
}
