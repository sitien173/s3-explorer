import { toast } from "sonner";

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastDescriptor {
	type: "success" | "error" | "info" | "warning";
	message: string;
	description?: string;
	action?: ToastAction;
	duration?: number;
}

export function sanitizeToastText(text: string): string {
	if (!text) return "";
	return text
		.replace(/(?:AKIA|ASIA)[0-9A-Z]{16}/gi, "[redacted]")
		.replace(/(?:secretAccessKey|sessionToken|AWSAccessKeyId|Signature|X-Amz-[\w-]+)=?[^\s&"'<>]*/gi, "[redacted]")
		.replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted URL]")
		.replace(/(?:[A-Za-z]:\\|~\\|~\/|\/(?:mnt|home|Users|tmp|var|usr|etc|opt|private)\/)[^\s"'<>]*/g, (path) => path.split(/[\\/]/).filter(Boolean).pop() ?? "");
}

export function cleanObjectKey(key: string): string {
	if (!key) return "object";
	const pathLike = /^[A-Za-z]:[\\/]|^~[\\/]|^\//i.test(key);
	const name = pathLike ? key.split(/[\\/]/).filter(Boolean).pop() ?? "" : key;
	const cleaned = sanitizeToastText(name).trim();
	return cleaned && !/\[redacted|secret|token/i.test(cleaned) ? cleaned : "object";
}

export function shouldNotifyTransferTerminal(seen: Set<string>, transferId: string): boolean {
	if (seen.has(transferId)) return false;
	seen.add(transferId);
	return true;
}

export function buildUploadDoneToast(key: string): ToastDescriptor {
	const cleaned = cleanObjectKey(key);
	return {
		type: "success",
		message: `Uploaded ${cleaned}`,
	};
}

export function buildDownloadDoneToast(key: string): ToastDescriptor {
	const cleaned = cleanObjectKey(key);
	return {
		type: "success",
		message: `Downloaded ${cleaned}`,
	};
}

export function buildFolderCreatedToast(name: string): ToastDescriptor {
	const cleaned = cleanObjectKey(name);
	return {
		type: "success",
		message: `Created folder ${cleaned}`,
	};
}

export function buildRenameDoneToast(toKey: string): ToastDescriptor {
	const cleaned = cleanObjectKey(toKey.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? toKey);
	return {
		type: "success",
		message: `Renamed to ${cleaned}`,
	};
}

export function buildDeleteDoneToast(target: string | number): ToastDescriptor {
	if (typeof target === "number") {
		return {
			type: "success",
			message: `Deleted ${target} ${target === 1 ? "object" : "objects"}`,
		};
	}
	const cleaned = cleanObjectKey(target);
	return {
		type: "success",
		message: `Deleted ${cleaned}`,
	};
}

export function buildTransferFailedToast(
	key: string,
	_error?: string,
): ToastDescriptor {
	const cleanedKey = cleanObjectKey(key);
	return {
		type: "error",
		message: `Transfer failed for ${cleanedKey}`,
		description: "The transfer could not be completed. Try again.",
	};
}

export function buildOperationFailedToast(
	operation: string,
	_error?: string,
): ToastDescriptor {
	const operations: Record<string, string> = {
		Upload: "Upload", Download: "Download", Delete: "Delete", Rename: "Rename",
		"Create folder": "Create folder", "Create bucket": "Create bucket", "Delete bucket": "Delete bucket", "Open with system app": "Open with system app", "Cancel transfer": "Cancel transfer",
	};
	const safeOperation = operations[operation] ?? "Operation";
	return {
		type: "error",
		message: `${safeOperation} failed`,
		description: "The operation could not be completed. Try again.",
	};
}

export function buildPartialFailureToast(
	report: { completedCount: number; remainingCount: number },
	onAction: () => void,
): ToastDescriptor {
	return {
		type: "error",
		message: "Operation completed with errors",
		description: `${report.remainingCount} ${report.remainingCount === 1 ? "object" : "objects"} remaining`,
		action: {
			label: "View report",
			onClick: onAction,
		},
	};
}

export function buildRejectedUploadToast(count: number): ToastDescriptor {
	return {
		type: "info",
		message: "Some files could not be uploaded",
		description: `${count} file(s) were rejected. Only regular files up to 500 items are accepted.`,
	};
}

export const toastBuilders = {
	uploadDone: buildUploadDoneToast,
	downloadDone: buildDownloadDoneToast,
	folderCreated: buildFolderCreatedToast,
	renameDone: buildRenameDoneToast,
	deleteDone: buildDeleteDoneToast,
	transferFailed: buildTransferFailedToast,
	operationFailed: buildOperationFailedToast,
	partialFailure: buildPartialFailureToast,
	rejectedUploadCount: buildRejectedUploadToast,
};

export function notify(descriptor: ToastDescriptor): string | number {
	const options = {
		description: descriptor.description,
		action: descriptor.action,
		duration: descriptor.duration,
	};
	switch (descriptor.type) {
		case "success":
			return toast.success(descriptor.message, options);
		case "error":
			return toast.error(descriptor.message, options);
		case "info":
			return toast.info(descriptor.message, options);
		case "warning":
			return toast.warning(descriptor.message, options);
		default:
			return toast(descriptor.message, options);
	}
}

notify.uploadDone = (key: string) => notify(buildUploadDoneToast(key));
notify.downloadDone = (key: string) => notify(buildDownloadDoneToast(key));
notify.folderCreated = (name: string) => notify(buildFolderCreatedToast(name));
notify.renameDone = (toKey: string) => notify(buildRenameDoneToast(toKey));
notify.deleteDone = (target: string | number) =>
	notify(buildDeleteDoneToast(target));
notify.transferFailed = (key: string, error?: string) =>
	notify(buildTransferFailedToast(key, error));
notify.operationFailed = (op: string, error?: string) =>
	notify(buildOperationFailedToast(op, error));
notify.partialFailure = (
	report: { completedCount: number; remainingCount: number },
	onAction: () => void,
) => notify(buildPartialFailureToast(report, onAction));
notify.rejectedUploads = (count: number) =>
	notify(buildRejectedUploadToast(count));
