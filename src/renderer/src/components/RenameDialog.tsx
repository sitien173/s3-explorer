import { Button } from "./ui/button";
import { BANNER_DESTRUCTIVE_CLASS, BANNER_SEPARATOR_CLASS } from "./ui/alert";
import { cn } from "../lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useState, type JSX } from "react";
import { useForm } from "react-hook-form";
import { api, unwrap } from "../api";
import type { BrowserRow } from "../format";
import { renameFormSchema } from "../forms";
import { Dialog } from "@/components/ui/dialog";
import { FieldError } from "./ui/field";
import { Input } from "./ui/input";

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
	onSuccess: (report?: RenameResultReport, destinationKey?: string) => void;
	onFailure?: () => void;
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
	onFailure,
}: RenameDialogProps): JSX.Element | null {
	const targetKeyId = useId();
	const isFolder = item?.kind === "folder";
	const currentKey = item ? (isFolder ? item.prefix : item.key) : "";
	const schema = useMemo(() => renameFormSchema(isFolder, currentKey), [isFolder, currentKey]);
	const {
		register,
		handleSubmit,
		reset,
		watch,
		setError,
		clearErrors,
		formState: { errors, isSubmitting: submitting },
	} = useForm<{ targetKey: string }, unknown, { targetKey: string }>({
		resolver: zodResolver(schema),
		defaultValues: { targetKey: currentKey },
	});
	const targetKey = watch("targetKey");
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	function handleClose(): void {
		if (submitting) {
			return;
		}
		onClose();
	}

	useEffect(() => {
		if (isOpen && item) {
			reset({ targetKey: currentKey });
			setProgress(null);
		}
	}, [isOpen, item, currentKey, reset]);

	async function onValid({ targetKey: trimmed }: { targetKey: string }): Promise<void> {
		if (!item) {
			return;
		}

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
					onSuccess(undefined, trimmed);
				}
				onClose();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Rename failed";
				onFailure?.();
				setError("root.server", { message });
			} finally {
				unsubscribe();
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
				onSuccess(undefined, trimmed);
				onClose();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : "Rename failed";
				onFailure?.();
				setError("root.server", { message });
			}
		}
	}

	return (
		<Dialog
			isOpen={isOpen}
			title={isFolder ? "Rename or move folder" : "Rename or move object"}
			onClose={handleClose}
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
						Cancel
					</Button>
					<Button type="submit" form="app-rename-form" variant="default" disabled={submitting || !targetKey.trim()}>
						{submitting ? "Renaming..." : "Rename"}
					</Button>
				</div>
			}
		>
			<form
				id="app-rename-form"
				onSubmit={(e) => {
					void handleSubmit(onValid)(e);
				}}
				className="flex flex-col gap-3"
			>
				{errors.root?.server?.message && (
					<div className={cn("mb-2 w-full", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
							<div className="text-sm text-foreground-secondary">{errors.root.server.message}</div>
						</div>
					</div>
				)}

				{progress && (
					<div className={cn("mb-2 w-full", BANNER_SEPARATOR_CLASS)}>
						<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
							<div className="text-sm font-medium text-foreground">Renaming in progress</div>
							<div className="text-sm text-foreground-secondary">
								Moving objects: {progress.done} of {progress.total}
							</div>
						</div>
					</div>
				)}

				<div className="flex w-full min-w-0 flex-col gap-1">
					<label className="text-xs font-medium text-foreground" htmlFor={targetKeyId}>
						{isFolder ? "Target prefix (required)" : "Target key (required)"}
					</label>
					<Input
						id={targetKeyId}
						type="text"
						{...register("targetKey", {
							onChange: () => {
								clearErrors("root.server");
							},
						})}
						disabled={submitting}
						required
						autoFocus
					/>
					<span className="text-xs text-foreground-secondary">
						{isFolder
							? "Enter new folder prefix. Slashing ending will be added if omitted."
							: "Enter the new destination key for this object."}
					</span>
					<FieldError error={errors.targetKey} />
				</div>
			</form>
		</Dialog>
	);
}
