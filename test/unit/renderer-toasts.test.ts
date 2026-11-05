import { describe, expect, it, vi } from "vitest";

interface ToastDescriptor {
	type: "success" | "error" | "info";
	message: string;
	description?: string;
	action?: { label: string; onClick: () => void };
	duration?: number;
}

interface ToastsModule {
	buildUploadDoneToast(key: string): ToastDescriptor;
	shouldNotifyTransferTerminal(seen: Set<string>, transferId: string): boolean;
	buildDownloadDoneToast(key: string): ToastDescriptor;
	buildFolderCreatedToast(name: string): ToastDescriptor;
	buildRenameDoneToast(toKey: string): ToastDescriptor;
	buildDeleteDoneToast(target: string | number): ToastDescriptor;
	buildTransferFailedToast(key: string, error?: string): ToastDescriptor;
	buildOperationFailedToast(operation: string, error?: string): ToastDescriptor;
	buildPartialFailureToast(
		report: { completedCount: number; remainingCount: number },
		onAction: () => void,
	): ToastDescriptor;
	buildRejectedUploadToast(count: number): ToastDescriptor;
	toastBuilders: {
		uploadDone: (key: string) => ToastDescriptor;
		downloadDone: (key: string) => ToastDescriptor;
		folderCreated: (name: string) => ToastDescriptor;
		renameDone: (toKey: string) => ToastDescriptor;
		deleteDone: (target: string | number) => ToastDescriptor;
		transferFailed: (key: string, error?: string) => ToastDescriptor;
		operationFailed: (operation: string, error?: string) => ToastDescriptor;
		partialFailure: (
			report: { completedCount: number; remainingCount: number },
			onAction: () => void,
		) => ToastDescriptor;
		rejectedUploadCount: (count: number) => ToastDescriptor;
	};
	notify: any;
}

const modulePath = "../../src/renderer/src/toasts";
const {
	buildDeleteDoneToast,
	buildDownloadDoneToast,
	buildFolderCreatedToast,
	buildOperationFailedToast,
	buildPartialFailureToast,
	buildRejectedUploadToast,
	buildRenameDoneToast,
	buildTransferFailedToast,
	buildUploadDoneToast,
	shouldNotifyTransferTerminal,
	toastBuilders,
} = (await import(modulePath)) as ToastsModule;

describe("renderer toast message builders", () => {
	it("builds upload done success toast without local path", () => {
		const toast = buildUploadDoneToast("seeded/photos/sunset.jpg");
		expect(toast.type).toBe("success");
		expect(toast.message).toContain("sunset.jpg");
		expect(toast.message).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);

		// When a local path is mistakenly passed, it must be scrubbed
		const localPathToast = buildUploadDoneToast("/home/ngosi/downloads/vacation.png");
		expect(localPathToast.message).not.toContain("/home/ngosi");
		expect(localPathToast.message).toContain("vacation.png");
	});

	it("builds download done success toast without local path", () => {
		const toast = buildDownloadDoneToast("docs/specification.pdf");
		expect(toast.type).toBe("success");
		expect(toast.message).toContain("specification.pdf");
		expect(toast.message).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);

		const localToast = buildDownloadDoneToast("C:\\Users\\user\\Downloads\\file.txt");
		expect(localToast.message).not.toContain("C:\\Users");
		expect(localToast.message).toContain("file.txt");
	});

	it("builds folder created success toast", () => {
		const toast = buildFolderCreatedToast("new-folder");
		expect(toast.type).toBe("success");
		expect(toast.message).toContain("new-folder");
		expect(toast.message).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);
	});

	it("builds rename done success toast", () => {
		const toast = buildRenameDoneToast("folder/renamed-file.txt");
		expect(toast.type).toBe("success");
		expect(toast.message).toContain("renamed-file.txt");
		expect(toast.message).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);
	});

	it("builds delete done success toast for single item and N items", () => {
		// Single object by key
		const singleToast = buildDeleteDoneToast("records/item-1.json");
		expect(singleToast.type).toBe("success");
		expect(singleToast.message).toContain("item-1.json");
		expect(singleToast.message).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);

		// Single object count (1)
		const countOneToast = buildDeleteDoneToast(1);
		expect(countOneToast.type).toBe("success");
		expect(countOneToast.message).toContain("1 object");

		// N objects count (42)
		const multiToast = buildDeleteDoneToast(42);
		expect(multiToast.type).toBe("success");
		expect(multiToast.message).toContain("42 objects");
	});

	it("redacts paths, credentials, and access-key identifiers from all toast text", () => {
		const inputs = [
			"/mnt/customer/data.csv",
			"/workspace/customer/data.csv",
			"C:\\Users\\customer\\data.csv",
			"~/private/data.csv",
			"secretAccessKey=example-secret-value",
			"AKIAIOSFODNN7EXAMPLE",
			"ASIAIOSFODNN7EXAMPLE",
			"sessionToken=example-session-token",
		];
		for (const input of inputs) {
			const built = buildUploadDoneToast(input);
			const text = `${built.message} ${built.description ?? ""}`;
			expect(text).not.toContain(input);
			expect(text).not.toMatch(/(?:AKIA|ASIA)[0-9A-Z]{16}|secretAccessKey|sessionToken|(?:^|\s)~\//i);
		}
	});

	it("uses generic operation and transfer failure descriptions", () => {
		const transfer = buildTransferFailedToast("folder/file.txt", "failed at /mnt/a with AKIAIOSFODNN7EXAMPLE");
		const operation = buildOperationFailedToast("Delete", "secretAccessKey=secret");
		expect(`${transfer.message} ${transfer.description}`).not.toMatch(/\/mnt|AKIA|failed at/);
		expect(`${operation.message} ${operation.description}`).not.toMatch(/secretAccessKey|secret/);
	});

	it("suppresses replayed terminal events for the same transfer", () => {
		const seen = new Set<string>();
		expect(shouldNotifyTransferTerminal(seen, "transfer-1")).toBe(true);
		expect(shouldNotifyTransferTerminal(seen, "transfer-1")).toBe(false);
		expect(shouldNotifyTransferTerminal(seen, "transfer-2")).toBe(true);
	});

	it("uses the destination key for a rename toast", () => {
		expect(buildRenameDoneToast("folder/new.txt").message).toBe("Renamed to new.txt");
		expect(buildRenameDoneToast("parent/renamed-folder/").message).toBe("Renamed to renamed-folder");
		expect(buildRenameDoneToast("/").message).toBe("Renamed to object");
		expect(buildRenameDoneToast("parent\\renamed-folder\\").message).toBe("Renamed to renamed-folder");
	});

	it("builds transfer failed error toast without local path or secrets", () => {
		const toast = buildTransferFailedToast(
			"data/large-archive.tar.gz",
			"Network timeout at /tmp/scratch/file.part with AKIAIOSFODNN7EXAMPLE",
		);
		expect(toast.type).toBe("error");
		const fullText = `${toast.message} ${toast.description ?? ""}`;
		expect(fullText).toContain("large-archive.tar.gz");
		expect(fullText).not.toContain("/tmp/scratch");
		expect(fullText).not.toContain("AKIAIOSFODNN7EXAMPLE");
	});

	it("builds operation failed error toast without local path or secrets", () => {
		const toast = buildOperationFailedToast(
			"Delete",
			"Access Denied on /var/log/s3/operation.log with secret key",
		);
		expect(toast.type).toBe("error");
		const fullText = `${toast.message} ${toast.description ?? ""}`;
		expect(fullText).toContain("Delete");
		expect(fullText).not.toContain("/var/log");
	});

	it("builds partial failure error toast with a 'View report' action", () => {
		const onAction = vi.fn();
		const toast = buildPartialFailureToast(
			{ completedCount: 5, remainingCount: 2 },
			onAction,
		);
		expect(toast.type).toBe("error");
		expect(toast.action).toBeDefined();
		expect(toast.action?.label).toBe("View report");
		toast.action?.onClick();
		expect(onAction).toHaveBeenCalledTimes(1);

		const fullText = `${toast.message} ${toast.description ?? ""}`;
		expect(fullText).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);
	});

	it("builds rejected upload count info toast", () => {
		const toast = buildRejectedUploadToast(7);
		expect(toast.type).toBe("info");
		const fullText = `${toast.message} ${toast.description ?? ""}`;
		expect(fullText).toContain("7");
		expect(fullText).not.toMatch(/(?:\/home|\/Users|[a-zA-Z]:\\|\/tmp)/);
	});

	it("exposes all builders via toastBuilders map", () => {
		expect(toastBuilders.uploadDone).toBe(buildUploadDoneToast);
		expect(toastBuilders.downloadDone).toBe(buildDownloadDoneToast);
		expect(toastBuilders.folderCreated).toBe(buildFolderCreatedToast);
		expect(toastBuilders.renameDone).toBe(buildRenameDoneToast);
		expect(toastBuilders.deleteDone).toBe(buildDeleteDoneToast);
		expect(toastBuilders.transferFailed).toBe(buildTransferFailedToast);
		expect(toastBuilders.operationFailed).toBe(buildOperationFailedToast);
		expect(toastBuilders.partialFailure).toBe(buildPartialFailureToast);
		expect(toastBuilders.rejectedUploadCount).toBe(buildRejectedUploadToast);
	});
});
