import { Button } from "./ui/button";
import { BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { cn } from "../lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, type ChangeEvent, type JSX } from "react";
import { useForm } from "react-hook-form";
import { api, unwrap } from "../api";
import { openUrlFormSchema } from "../forms";
import { chooseDefaultConnection, getUrlFileName, type ConnectionOption } from "../urlChoice";
import { Dialog } from "@/components/ui/dialog";
import { FieldError } from "./ui/field";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import type { ViewerTargetStream } from "../store";

export interface OpenUrlDialogProps {
	isOpen: boolean;
	connections: ConnectionOption[];
	selectedConnectionId?: string | null;
	currentBucketList?: string[];
	onClose: () => void;
	onSuccess: (target: ViewerTargetStream) => void;
}

export function OpenUrlDialog({
	isOpen,
	connections,
	selectedConnectionId,
	currentBucketList,
	onClose,
	onSuccess,
}: OpenUrlDialogProps): JSX.Element | null {
	const {
		register,
		handleSubmit,
		reset,
		setValue,
		watch,
		setError,
		clearErrors,
		formState: { errors, isSubmitting: submitting },
	} = useForm<{ url: string; connectionId: string }, unknown, { url: string; connectionId: string }>({
		resolver: zodResolver(openUrlFormSchema),
		defaultValues: { url: "", connectionId: "anonymous" },
	});
	const url = watch("url");
	const userOverrodeConn = useRef<boolean>(false);

	const prevIsOpenRef = useRef<boolean>(false);
	const urlInputId = useId();
	const connSelectId = useId();

	useEffect(() => {
		const wasOpen = prevIsOpenRef.current;
		prevIsOpenRef.current = isOpen;

		if (isOpen && !wasOpen) {
			userOverrodeConn.current = false;
			const defaultChoice = chooseDefaultConnection({
				url: "",
				connections,
				selectedConnectionId,
				currentBucketList,
			});
			reset({ url: "", connectionId: defaultChoice });
		}
	}, [isOpen, connections, selectedConnectionId, currentBucketList, reset]);

	function handleUrlChange(e: ChangeEvent<HTMLInputElement>): void {
		clearErrors("root.server");
		if (!userOverrodeConn.current) {
			const choice = chooseDefaultConnection({
				url: e.target.value,
				connections,
				selectedConnectionId,
				currentBucketList,
			});
			setValue("connectionId", choice);
		}
	}

	async function onValid({
		url: trimmedUrl,
		connectionId: selectedConnId,
	}: {
		url: string;
		connectionId: string;
	}): Promise<void> {
		try {
			const input =
				selectedConnId === "anonymous"
					? { url: trimmedUrl, anonymous: true }
					: { url: trimmedUrl, connectionId: selectedConnId };

			const res = await api.stream.openUrl(input);
			const data = unwrap(res);
			const fileName = getUrlFileName(trimmedUrl);

			onSuccess({
				kind: "stream",
				url: data.url,
				contentType: data.contentType,
				size: data.size,
				fileName,
				key: fileName,
			});
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to open URL";
			setError("root.server", { message });
		}
	}

	function handleClose(): void {
		if (submitting) {
			return;
		}
		onClose();
	}

	return (
		<Dialog
			isOpen={isOpen}
			title="Open URL"
			onClose={handleClose}
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
						Cancel
					</Button>
					<Button type="submit" form="app-open-url-form" variant="default" disabled={submitting || !url.trim()}>
						{submitting ? "Opening..." : "Open"}
					</Button>
				</div>
			}
		>
			<form
				id="app-open-url-form"
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

				<div className="flex w-full min-w-0 flex-col gap-1">
					<label className="text-xs font-medium text-foreground" htmlFor={urlInputId}>
						URL (required)
					</label>
					<Input
						id={urlInputId}
						type="text"
						{...register("url", { onChange: handleUrlChange })}
						placeholder="s3://bucket/key or https://..."
						required
						autoFocus
					/>
					<span className="text-xs text-foreground-secondary">
						Supports S3 URIs, virtual-hosted, path-style, and presigned URLs.
					</span>
					<FieldError error={errors.url} />
				</div>

				<div className="flex w-full min-w-0 flex-col gap-1">
					<label className="text-xs font-medium text-foreground" htmlFor={connSelectId}>
						Signing connection
					</label>
					<Select
						id={connSelectId}
						{...register("connectionId", {
							onChange: () => {
								userOverrodeConn.current = true;
							},
						})}
					>
						{connections.map((conn) => (
							<option key={conn.id} value={conn.id}>
								{conn.name}
							</option>
						))}
						<option value="anonymous">Anonymous</option>
					</Select>
					<span className="text-xs text-foreground-secondary">
						Choose credentials for authorization or select Anonymous.
					</span>
				</div>
			</form>
		</Dialog>
	);
}
