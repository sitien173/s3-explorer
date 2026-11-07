// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: {
		connections: { listProfiles: vi.fn(), create: vi.fn(), update: vi.fn(), testConnection: vi.fn() },
		buckets: { add: vi.fn(), create: vi.fn(), delete: vi.fn() },
		ops: {
			onProgress: vi.fn(() => () => {}),
			countPrefix: vi.fn(),
			deletePrefix: vi.fn(),
			delete: vi.fn(),
			renamePrefix: vi.fn(),
			rename: vi.fn(),
			createFolder: vi.fn(),
		},
		stream: { openUrl: vi.fn() },
		objects: { list: vi.fn() },
	},
}));
vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (r: any) => {
		if (!r.ok) throw new Error(r.error?.message);
		return r.data;
	},
}));

import { ConnectionDialog } from "../../src/renderer/src/components/ConnectionDialog";
import { AddBucketDialog } from "../../src/renderer/src/components/AddBucketDialog";
import { CreateBucketDialog } from "../../src/renderer/src/components/CreateBucketDialog";
import { DeleteBucketDialog } from "../../src/renderer/src/components/DeleteBucketDialog";
import { RenameDialog } from "../../src/renderer/src/components/RenameDialog";
import { ConfirmDeleteDialog } from "../../src/renderer/src/components/ConfirmDeleteDialog";
import { OpenUrlDialog } from "../../src/renderer/src/components/OpenUrlDialog";
import { OperationReport } from "../../src/renderer/src/components/OperationReport";
import { Dialog } from "../../src/renderer/src/components/ui/dialog";
import { AlertDialog } from "../../src/renderer/src/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle } from "../../src/renderer/src/components/ui/sheet";
import { ObjectTable } from "../../src/renderer/src/components/ObjectTable";
import { NewFolderDialog } from "../../src/renderer/src/App";

const ok = (data: unknown) => ({ ok: true as const, data });

afterEach(() => cleanup());

beforeEach(() => {
	vi.clearAllMocks();
	mocks.api.connections.listProfiles.mockResolvedValue(ok([]));
	mocks.api.ops.countPrefix.mockResolvedValue(ok({ count: 0 }));
});

function Harness({
	renderDialog,
	onClose,
}: {
	renderDialog: (open: boolean, close: () => void) => React.ReactNode;
	onClose: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	const close = () => {
		onClose();
		setOpen(false);
	};
	return (
		<>
			<button onClick={() => setOpen(true)}>Open test dialog</button>
			{renderDialog(open, close)}
		</>
	);
}

type Opener = { disabledFieldset?: boolean; hidden?: boolean; inert?: boolean };

function OpenerHarness({
	renderModal,
	exposeSetOpener,
}: {
	renderModal: (open: boolean, close: () => void) => React.ReactNode;
	exposeSetOpener: (set: (v: "mounted" | "gone" | Opener) => void) => void;
}) {
	const [open, setOpen] = React.useState(false);
	const [opener, setOpenerState] = React.useState<"mounted" | "gone" | Opener>("mounted");
	exposeSetOpener(setOpenerState);
	const flags = typeof opener === "object" ? opener : {};
	return (
		<>
			<div role="grid" tabIndex={0} aria-label="Objects" />
			{opener !== "gone" && (
				<fieldset disabled={flags.disabledFieldset} hidden={flags.hidden} inert={flags.inert}>
					<button onClick={() => setOpen(true)}>Open test dialog</button>
				</fieldset>
			)}
			{renderModal(open, () => setOpen(false))}
		</>
	);
}

const renameFocusItem = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };

function RenameFocusHarness() {
	const [open, setOpen] = React.useState(false);
	return (
		<>
			<ObjectTable
				connectionId="c1"
				bucket="b1"
				prefix=""
				onNavigate={vi.fn()}
				onGridAction={(action) => {
					if (action === "rename") setOpen(true);
				}}
			/>
			<RenameDialog
				isOpen={open}
				connectionId="c1"
				bucket="b1"
				item={renameFocusItem}
				onClose={() => setOpen(false)}
				onSuccess={vi.fn()}
			/>
		</>
	);
}

function harness(renderDialog: (open: boolean, close: () => void) => React.ReactNode) {
	const onClose = vi.fn();
	return { ...render(<Harness renderDialog={renderDialog} onClose={onClose} />), onClose };
}

async function _expectModalKeyboardBehavior(
	user: ReturnType<typeof userEvent.setup>,
	role: "dialog" | "alertdialog",
	name: string,
	close: ReturnType<typeof vi.fn>,
) {
	const trigger = screen.getByRole("button", { name: "Open test dialog" });
	await user.click(trigger);
	const modal = screen.getByRole(role, { name });
	expect(modal.contains(document.activeElement)).toBe(true);
	await user.tab();
	expect(modal.contains(document.activeElement)).toBe(true);
	await user.keyboard("{Escape}");
	expect(close).toHaveBeenCalled();
	await waitFor(() => expect(screen.queryByRole(role, { name })).toBeNull());
	await waitFor(() => expect(document.activeElement).toBe(trigger));
}

describe("renderer dialog components", () => {
	it("ConnectionDialog preserves e2e labels and buttons and Radix keyboard behavior", { timeout: 15000 }, async () => {
		const user = userEvent.setup();
		const { onClose } = harness((open, close) => <ConnectionDialog isOpen={open} onClose={close} onSaved={vi.fn()} />);
		const trigger = screen.getByRole("button", { name: "Open test dialog" });
		await user.click(trigger);
		const modal = screen.getByRole("dialog", { name: "Add connection" });
		expect(modal).toBeTruthy();
		const profileToggle = screen.getByRole("button", { name: "AWS Profile / SSO" });
		const manualToggle = screen.getByRole("button", { name: "Manual Credentials" });
		expect(manualToggle.dataset.variant).toBe("secondary");
		expect(manualToggle.dataset.variant).not.toBe("default");
		expect(profileToggle.dataset.size).toBe("sm");
		expect(manualToggle.dataset.size).toBe("sm");
		await user.click(manualToggle);
		for (const label of [
			"Connection name (required)",
			"Region (required)",
			"Access Key ID (required)",
			"Secret Access Key (required)",
			"Endpoint URL",
			"Force path-style URLs (required for MinIO / LocalStack)",
		])
			expect(screen.getByLabelText(label)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Save connection" })).toBeTruthy();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("AddBucketDialog has its accessible name, fields, actions, and modal keyboard behavior", async () => {
		const user = userEvent.setup();
		const { onClose } = harness((open, close) => (
			<AddBucketDialog isOpen={open} connectionId="c1" onClose={close} onAdded={vi.fn()} />
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		const modal = screen.getByRole("dialog", { name: "Add bucket by name" });
		expect(screen.getByLabelText("Bucket name (required)")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Add bucket" })).toBeTruthy();
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
	});

	it("CreateBucketDialog blocks an invalid name without calling the api", async () => {
		const user = userEvent.setup();
		render(<CreateBucketDialog open onOpenChange={vi.fn()} connectionId="c1" existingNames={[]} onCreated={vi.fn()} />);
		await user.type(screen.getByLabelText("Bucket name (required)"), "AB");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByText(/at least 3|3 characters/i)).toBeTruthy();
		expect(mocks.api.buckets.create).not.toHaveBeenCalled();
	});

	it("CreateBucketDialog blocks a name that is already listed", async () => {
		const user = userEvent.setup();
		render(
			<CreateBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionId="c1"
				existingNames={["taken-bucket"]}
				onCreated={vi.fn()}
			/>,
		);
		await user.type(screen.getByLabelText("Bucket name (required)"), "  taken-bucket  ");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByText("A bucket with this name is already listed")).toBeTruthy();
		expect(mocks.api.buckets.create).not.toHaveBeenCalled();
	});

	it("CreateBucketDialog creates with the trimmed name and reports success with the warning", async () => {
		const user = userEvent.setup();
		mocks.api.buckets.create.mockResolvedValue(ok({ bucket: "new-bucket", warning: "Pin failed" }));
		const onCreated = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<CreateBucketDialog
				open
				onOpenChange={onOpenChange}
				connectionId="c1"
				existingNames={[]}
				onCreated={onCreated}
			/>,
		);
		await user.type(screen.getByLabelText("Bucket name (required)"), " new-bucket ");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-bucket", "Pin failed"));
		expect(mocks.api.buckets.create).toHaveBeenCalledWith({ connectionId: "c1", bucket: "new-bucket" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("CreateBucketDialog sends one request on a double submit", async () => {
		const user = userEvent.setup();
		let resolve!: (value: unknown) => void;
		mocks.api.buckets.create.mockReturnValue(
			new Promise((r) => {
				resolve = r;
			}),
		);
		render(<CreateBucketDialog open onOpenChange={vi.fn()} connectionId="c1" existingNames={[]} onCreated={vi.fn()} />);
		await user.type(screen.getByLabelText("Bucket name (required)"), "new-bucket");
		await user.dblClick(screen.getByRole("button", { name: "Create bucket" }));
		expect(mocks.api.buckets.create).toHaveBeenCalledTimes(1);
		resolve(ok({ bucket: "new-bucket" }));
	});

	it("CreateBucketDialog shows an api error inline and stays open", async () => {
		const user = userEvent.setup();
		mocks.api.buckets.create.mockResolvedValue({
			ok: false,
			error: { code: "BUCKET_EXISTS", message: "Bucket name is taken" },
		});
		const onCreated = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<CreateBucketDialog
				open
				onOpenChange={onOpenChange}
				connectionId="c1"
				existingNames={[]}
				onCreated={onCreated}
			/>,
		);
		await user.type(screen.getByLabelText("Bucket name (required)"), "new-bucket");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByText("Bucket name is taken")).toBeTruthy();
		expect(onCreated).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("DeleteBucketDialog enables confirm only on an exact name match", async () => {
		const user = userEvent.setup();
		render(
			<DeleteBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionName="Conn"
				connectionId="c1"
				bucket="My-Bucket"
				onDeleted={vi.fn()}
			/>,
		);
		expect(screen.getByRole("alertdialog", { name: "Delete bucket" })).toBeTruthy();
		expect(screen.getAllByText("My-Bucket").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Conn").length).toBeGreaterThan(0);
		const confirm = screen.getByRole("button", { name: "Delete bucket" });
		expect(confirm.hasAttribute("disabled")).toBe(true);
		const input = screen.getByLabelText(/Type the bucket name to confirm/);
		await user.type(input, "my-bucket");
		expect(confirm.hasAttribute("disabled")).toBe(true);
		await user.clear(input);
		await user.type(input, "My-Bucket");
		expect(confirm.hasAttribute("disabled")).toBe(false);
	});

	it("DeleteBucketDialog shows BUCKET_NOT_EMPTY inline and does not report deletion", async () => {
		const user = userEvent.setup();
		mocks.api.buckets.delete.mockResolvedValue({
			ok: false,
			error: { code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" },
		});
		const onDeleted = vi.fn();
		render(
			<DeleteBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionName="Conn"
				connectionId="c1"
				bucket="b1"
				onDeleted={onDeleted}
			/>,
		);
		await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		expect(await screen.findByText("Bucket is not empty")).toBeTruthy();
		expect(mocks.api.buckets.delete).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b1" });
		expect(onDeleted).not.toHaveBeenCalled();
	});

	it("DeleteBucketDialog reports success with the warning", async () => {
		const user = userEvent.setup();
		mocks.api.buckets.delete.mockResolvedValue(ok({ bucket: "b1", warning: "Cleanup failed" }));
		const onDeleted = vi.fn();
		render(
			<DeleteBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionName="Conn"
				connectionId="c1"
				bucket="b1"
				onDeleted={onDeleted}
			/>,
		);
		await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("b1", "Cleanup failed"));
	});

	it("DeleteBucketDialog keeps its target when props change while open", async () => {
		const user = userEvent.setup();
		mocks.api.buckets.delete.mockResolvedValue(ok({ bucket: "b1" }));
		const onDeleted = vi.fn();
		const view = render(
			<DeleteBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionName="Conn"
				connectionId="c1"
				bucket="b1"
				onDeleted={onDeleted}
			/>,
		);
		view.rerender(
			<DeleteBucketDialog
				open
				onOpenChange={vi.fn()}
				connectionName="Other"
				connectionId="c2"
				bucket="b2"
				onDeleted={onDeleted}
			/>,
		);
		await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("b1", undefined));
		expect(mocks.api.buckets.delete).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b1" });
	});

	it("CreateBucketDialog ignores dismissal while a request is pending and closes after it resolves", async () => {
		const user = userEvent.setup();
		let resolve!: (value: unknown) => void;
		mocks.api.buckets.create.mockReturnValue(
			new Promise((r) => {
				resolve = r;
			}),
		);
		const onOpenChange = vi.fn();
		render(
			<CreateBucketDialog open onOpenChange={onOpenChange} connectionId="c1" existingNames={[]} onCreated={vi.fn()} />,
		);
		await user.type(screen.getByLabelText("Bucket name (required)"), "new-bucket");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(mocks.api.buckets.create).toHaveBeenCalledTimes(1));
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(onOpenChange).not.toHaveBeenCalled();
		resolve(ok({ bucket: "new-bucket" }));
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(mocks.api.buckets.create).toHaveBeenCalledTimes(1);
	});

	it("DeleteBucketDialog ignores dismissal and a second confirm while a request is pending", async () => {
		const user = userEvent.setup();
		let resolve!: (value: unknown) => void;
		mocks.api.buckets.delete.mockReturnValue(
			new Promise((r) => {
				resolve = r;
			}),
		);
		const onOpenChange = vi.fn();
		const onDeleted = vi.fn();
		render(
			<DeleteBucketDialog
				open
				onOpenChange={onOpenChange}
				connectionName="Conn"
				connectionId="c1"
				bucket="b1"
				onDeleted={onDeleted}
			/>,
		);
		await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		await waitFor(() => expect(mocks.api.buckets.delete).toHaveBeenCalledTimes(1));
		await user.keyboard("{Escape}");
		expect(onOpenChange).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: /Deleting/ }));
		expect(mocks.api.buckets.delete).toHaveBeenCalledTimes(1);
		resolve(ok({ bucket: "b1" }));
		await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("b1", undefined));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("RenameDialog preserves the e2e name, target label, action, and modal keyboard behavior", async () => {
		const user = userEvent.setup();
		const item = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };
		const { onClose } = harness((open, close) => (
			<RenameDialog isOpen={open} connectionId="c1" bucket="b1" item={item} onClose={close} onSuccess={vi.fn()} />
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		const modal = screen.getByRole("dialog", { name: "Rename or move object" });
		expect(screen.getByLabelText("Target key (required)")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
	});

	it("returns focus to the grid or the opening row after Rename from the row context menu closes with Escape", {
		timeout: 15000,
	}, async () => {
		const user = userEvent.setup();
		mocks.api.objects.list.mockResolvedValue(
			ok({ folders: [], objects: [{ key: "file.txt", size: 1, lastModified: "2026-01-01" }] }),
		);
		const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
		const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
		Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
		Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
		try {
			render(<RenameFocusHarness />);
			const row = await screen.findByRole("row", { name: /file\.txt/ });
			await user.pointer({ keys: "[MouseRight]", target: row });
			await user.click(await screen.findByRole("menuitem", { name: "Rename or move" }));
			await screen.findByRole("dialog", { name: "Rename or move object" });
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			const grid = screen.getByRole("grid");
			await waitFor(() => {
				const active = document.activeElement;
				expect(active === grid || active === row).toBe(true);
			});
		} finally {
			if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
			else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
			if (clientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
			else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
		}
	});

	describe.each([
		[
			"Dialog",
			"dialog",
			(open: boolean, close: () => void) => <Dialog isOpen={open} title="Final focus" onClose={close} />,
		],
		[
			"AlertDialog",
			"alertdialog",
			(open: boolean, close: () => void) => <AlertDialog isOpen={open} title="Final focus" onClose={close} />,
		],
		[
			"Sheet",
			"dialog",
			(open: boolean, close: () => void) => (
				<Sheet open={open} onOpenChange={(next) => !next && close()}>
					<SheetContent aria-label="Final focus">
						<SheetTitle>Final focus</SheetTitle>
					</SheetContent>
				</Sheet>
			),
		],
	] as const)("%s final focus", (_name, role, renderModal) => {
		async function run(mode: "unmount" | Exclude<keyof Opener, never>) {
			const user = userEvent.setup();
			let setOpener: (v: "mounted" | "gone" | Opener) => void = () => {};
			render(
				<OpenerHarness
					renderModal={renderModal}
					exposeSetOpener={(set) => {
						setOpener = set;
					}}
				/>,
			);
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			const modal = await screen.findByRole(role);
			await waitFor(() => expect(modal.contains(document.activeElement)).toBe(true));
			act(() => setOpener(mode === "unmount" ? "gone" : { [mode]: true }));
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole(role)).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("grid")));
		}
		it("returns focus to the grid when the opener is unmounted after the modal opens", () => run("unmount"));
		it("returns focus to the grid when the opener is connected but hidden", () => run("hidden"));
		it("returns focus to the grid when the opener is connected but inert", () => run("inert"));
		it("returns focus to the grid when the opener is disabled by an ancestor fieldset", () => run("disabledFieldset"));
	});

	it("ConfirmDeleteDialog deletes a multi-object selection in one operation and shows its count", async () => {
		const user = userEvent.setup();
		const items = [
			{ kind: "object" as const, name: "a.txt", key: "a.txt", size: 1 },
			{ kind: "object" as const, name: "b.txt", key: "b.txt", size: 2 },
			{ kind: "object" as const, name: "c.txt", key: "c.txt", size: 3 },
		];
		mocks.api.ops.delete.mockResolvedValue(ok({ completed: items.map((item) => item.key), remaining: [] }));
		const onSuccess = vi.fn();
		harness((open, close) => (
			<ConfirmDeleteDialog
				isOpen={open}
				connectionId="c1"
				bucket="b1"
				item={items[0]}
				items={items}
				onSuccess={onSuccess}
				onClose={close}
			/>
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		expect(screen.getByRole("alertdialog", { name: "Delete 3 objects" })).toBeTruthy();
		expect(screen.getByText("Delete 3 objects?")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(mocks.api.ops.delete).toHaveBeenCalledTimes(1));
		expect(mocks.api.ops.delete.mock.calls[0][0].keys).toEqual(["a.txt", "b.txt", "c.txt"]);
		expect(onSuccess).toHaveBeenCalledOnce();
	});

	it("ConfirmDeleteDialog targets the single selected key rather than a deselected active item", async () => {
		const user = userEvent.setup();
		const itemA = { kind: "object" as const, name: "a.txt", key: "a.txt", size: 1 };
		const _itemB = { kind: "object" as const, name: "b.txt", key: "b.txt", size: 2 };
		mocks.api.ops.delete.mockResolvedValue(ok({ completed: ["a.txt"], remaining: [] }));
		const onSuccess = vi.fn();
		harness((open, close) => (
			<ConfirmDeleteDialog
				isOpen={open}
				connectionId="c1"
				bucket="b1"
				item={itemA}
				items={[itemA]}
				onSuccess={onSuccess}
				onClose={close}
			/>
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		expect(screen.getByRole("alertdialog", { name: "Delete object" })).toBeTruthy();
		expect(screen.getByText(/Are you sure you want to delete/)).toBeTruthy();
		expect(screen.getByText("a.txt")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(mocks.api.ops.delete).toHaveBeenCalledTimes(1));
		expect(mocks.api.ops.delete.mock.calls[0][0].keys).toEqual(["a.txt"]);
	});

	it("ConfirmDeleteDialog counts a folder through the query and enables delete once counted", async () => {
		const folder = { kind: "folder" as const, name: "docs/", prefix: "docs/" };
		mocks.api.ops.countPrefix.mockResolvedValue(ok({ count: 1234 }));
		render(
			<ConfirmDeleteDialog isOpen connectionId="c1" bucket="b1" item={folder} onSuccess={vi.fn()} onClose={vi.fn()} />,
		);
		expect(await screen.findByText("1,234")).toBeTruthy();
		expect(mocks.api.ops.countPrefix).toHaveBeenCalledTimes(1);
		expect(mocks.api.ops.countPrefix).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b1", prefix: "docs/" });
		expect(screen.getByRole("button", { name: "Delete" }).hasAttribute("disabled")).toBe(false);
	});

	it("ConfirmDeleteDialog shows a count failure once and keeps delete disabled", async () => {
		const folder = { kind: "folder" as const, name: "docs/", prefix: "docs/" };
		mocks.api.ops.countPrefix.mockRejectedValue(new Error("count exploded"));
		const onFailure = vi.fn();
		const { rerender } = render(
			<ConfirmDeleteDialog
				isOpen
				connectionId="c1"
				bucket="b1"
				item={folder}
				onSuccess={vi.fn()}
				onClose={vi.fn()}
				onFailure={onFailure}
			/>,
		);
		expect(await screen.findByText("count exploded")).toBeTruthy();
		await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
		rerender(
			<ConfirmDeleteDialog
				isOpen
				connectionId="c1"
				bucket="b1"
				item={folder}
				onSuccess={vi.fn()}
				onClose={vi.fn()}
				onFailure={() => onFailure()}
			/>,
		);
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("button", { name: "Delete" }).hasAttribute("disabled")).toBe(true);
	});

	it("ConnectionDialog defaults a new connection to the first profile", async () => {
		mocks.api.connections.listProfiles.mockResolvedValue(
			ok([
				{ name: "dev", kind: "static" },
				{ name: "prod", kind: "sso" },
			]),
		);
		render(<ConnectionDialog isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
		await waitFor(() => {
			const select = screen.getByLabelText("AWS Profile (required)") as HTMLSelectElement;
			expect(select.tagName).toBe("SELECT");
			expect(select.value).toBe("dev");
		});
	});

	it("ConfirmDeleteDialog disables delete when multi-selection contains folders", async () => {
		const user = userEvent.setup();
		const folder = { kind: "folder" as const, name: "docs/", prefix: "docs/" };
		const object = { kind: "object" as const, name: "a.txt", key: "a.txt", size: 1 };
		harness((open, close) => (
			<ConfirmDeleteDialog
				isOpen={open}
				connectionId="c1"
				bucket="b1"
				item={null}
				items={[folder, object]}
				onSuccess={vi.fn()}
				onClose={close}
			/>
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		expect(await screen.findByText("Folders cannot be multi-deleted.")).toBeTruthy();
		const deleteBtn = screen.getByRole("button", { name: "Delete" });
		expect(deleteBtn.hasAttribute("disabled")).toBe(true);
		expect(mocks.api.ops.delete).not.toHaveBeenCalled();
		expect(mocks.api.ops.deletePrefix).not.toHaveBeenCalled();
	});

	it("ConfirmDeleteDialog is an alertdialog with Delete and traps/restores focus", async () => {
		const user = userEvent.setup();
		const item = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };
		const { onClose } = harness((open, close) => (
			<ConfirmDeleteDialog
				isOpen={open}
				connectionId="c1"
				bucket="b1"
				item={item}
				onClose={close}
				onSuccess={vi.fn()}
			/>
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		const modal = screen.getByRole("alertdialog", { name: "Delete object" });
		expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
	});

	it("OpenUrlDialog preserves e2e labels, signing value, action, and modal keyboard behavior", async () => {
		const user = userEvent.setup();
		const { onClose } = harness((open, close) => (
			<OpenUrlDialog isOpen={open} connections={[]} onClose={close} onSuccess={vi.fn()} />
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		const modal = screen.getByRole("dialog", { name: "Open URL" });
		expect(screen.getByLabelText("URL (required)")).toBeTruthy();
		expect((screen.getByLabelText("Signing connection") as HTMLSelectElement).value).toBe("anonymous");
		expect(screen.getByRole("button", { name: "Open", exact: true })).toBeTruthy();
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
	});

	it("OperationReport has its accessible name and close action with modal keyboard behavior", async () => {
		const user = userEvent.setup();
		const { onClose } = harness((open, close) => (
			<OperationReport isOpen={open} completedCount={1} remainingKeys={[]} onClose={close} />
		));
		await user.click(screen.getByRole("button", { name: "Open test dialog" }));
		const modal = screen.getByRole("dialog", { name: "Operation report" });
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
	});

	it("new-folder dialog usage has its title, field, buttons, and modal keyboard behavior", async () => {
		const user = userEvent.setup();
		const { onClose } = harness((open, close) => (
			<Dialog
				isOpen={open}
				title="New folder"
				onClose={close}
				footer={
					<>
						<button onClick={close}>Cancel</button>
						<button>Create folder</button>
					</>
				}
			>
				<label htmlFor="folder-name">Folder name (required)</label>
				<input id="folder-name" />
			</Dialog>
		));
		const trigger = screen.getByRole("button", { name: "Open test dialog" });
		await user.click(trigger);
		const modal = screen.getByRole("dialog", { name: "New folder" });
		expect(screen.getByLabelText("Folder name (required)")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Create folder" })).toBeTruthy();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.tab();
		expect(modal.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	describe("form validation", () => {
		const fieldAlert = (name: string | RegExp) =>
			screen.findByRole("alert").then((el) => {
				expect(el.textContent).toMatch(name);
				return el;
			});

		it("ConnectionDialog shows field errors and does not call the api while invalid", async () => {
			const user = userEvent.setup();
			render(<ConnectionDialog isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
			await user.click(screen.getByRole("button", { name: "Save connection" }));
			const alerts = await screen.findAllByRole("alert");
			expect(alerts.map((a) => a.textContent)).toEqual([
				"Connection name is required.",
				"AWS profile name is required.",
			]);
			await user.click(screen.getByRole("button", { name: "Manual Credentials" }));
			await user.click(screen.getByRole("button", { name: "Save connection" }));
			await waitFor(async () =>
				expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toEqual([
					"Connection name is required.",
					"AWS Region is required.",
					"Access Key ID is required.",
					"Secret Access Key is required.",
				]),
			);
			expect(mocks.api.connections.create).not.toHaveBeenCalled();
			expect(mocks.api.connections.update).not.toHaveBeenCalled();
		});

		it("ConnectionDialog clears a field error once the field is fixed and saves the trimmed values", async () => {
			const user = userEvent.setup();
			mocks.api.connections.create.mockResolvedValue(ok({ id: "c1", name: "Prod" }));
			const onSaved = vi.fn();
			render(<ConnectionDialog isOpen onClose={vi.fn()} onSaved={onSaved} />);
			await user.click(screen.getByRole("button", { name: "Save connection" }));
			await screen.findAllByRole("alert");
			await user.type(screen.getByLabelText("Connection name (required)"), "  Prod ");
			await user.type(screen.getByLabelText("AWS Profile (required)"), "default");
			await user.click(screen.getByRole("button", { name: "Save connection" }));
			await waitFor(() => expect(onSaved).toHaveBeenCalled());
			expect(mocks.api.connections.create).toHaveBeenCalledWith({
				kind: "profile",
				name: "Prod",
				profile: "default",
				forcePathStyle: false,
			});
			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("ConnectionDialog resets its fields and errors after it closes", async () => {
			const user = userEvent.setup();
			harness((open, close) => <ConnectionDialog isOpen={open} onClose={close} onSaved={vi.fn()} />);
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			await user.type(screen.getByLabelText("Connection name (required)"), "Leftover");
			await user.click(screen.getByRole("button", { name: "Manual Credentials" }));
			await user.click(screen.getByRole("button", { name: "Save connection" }));
			await screen.findAllByRole("alert");
			await user.keyboard("{Escape}");
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			expect((screen.getByLabelText("Connection name (required)") as HTMLInputElement).value).toBe("");
			expect(screen.getByRole("button", { name: "AWS Profile / SSO" }).getAttribute("aria-pressed")).toBe("true");
			expect(screen.queryByRole("alert")).toBeNull();
		});

		it("RenameDialog shows the field error and does not call the api for a slash-ended object key", async () => {
			const user = userEvent.setup();
			const item = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };
			render(<RenameDialog isOpen connectionId="c1" bucket="b1" item={item} onClose={vi.fn()} onSuccess={vi.fn()} />);
			const input = screen.getByLabelText("Target key (required)") as HTMLInputElement;
			expect(input.value).toBe("file.txt");
			await user.clear(input);
			await user.type(input, "dir/");
			await user.click(screen.getByRole("button", { name: "Rename" }));
			await fieldAlert("Object key cannot end with a slash.");
			await user.clear(input);
			await user.type(input, "file.txt");
			await user.click(screen.getByRole("button", { name: "Rename" }));
			await fieldAlert("Target name must be different from current name.");
			expect(mocks.api.ops.rename).not.toHaveBeenCalled();
			expect(mocks.api.ops.renamePrefix).not.toHaveBeenCalled();
		});

		it("RenameDialog sends the trimmed key once and keeps double submit blocked", async () => {
			const user = userEvent.setup();
			let resolve!: (value: unknown) => void;
			mocks.api.ops.rename.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			const item = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };
			const onSuccess = vi.fn();
			render(<RenameDialog isOpen connectionId="c1" bucket="b1" item={item} onClose={vi.fn()} onSuccess={onSuccess} />);
			const input = screen.getByLabelText("Target key (required)");
			await user.clear(input);
			await user.type(input, "  moved.txt ");
			await user.dblClick(screen.getByRole("button", { name: "Rename" }));
			expect(mocks.api.ops.rename).toHaveBeenCalledTimes(1);
			expect(mocks.api.ops.rename).toHaveBeenCalledWith({
				connectionId: "c1",
				bucket: "b1",
				fromKey: "file.txt",
				toKey: "moved.txt",
			});
			resolve(ok({ key: "moved.txt" }));
			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(undefined, "moved.txt"));
		});

		it("RenameDialog shows an api failure as a banner and keeps the typed value", async () => {
			const user = userEvent.setup();
			mocks.api.ops.rename.mockResolvedValue({ ok: false, error: { code: "X", message: "Rename exploded" } });
			const item = { kind: "object" as const, name: "file.txt", key: "file.txt", size: 1 };
			const onFailure = vi.fn();
			render(
				<RenameDialog
					isOpen
					connectionId="c1"
					bucket="b1"
					item={item}
					onClose={vi.fn()}
					onSuccess={vi.fn()}
					onFailure={onFailure}
				/>,
			);
			const input = screen.getByLabelText("Target key (required)") as HTMLInputElement;
			await user.clear(input);
			await user.type(input, "moved.txt");
			await user.click(screen.getByRole("button", { name: "Rename" }));
			expect(await screen.findByText("Rename exploded")).toBeTruthy();
			expect(onFailure).toHaveBeenCalled();
			expect(input.value).toBe("moved.txt");
			await user.type(input, "2");
			await waitFor(() => expect(screen.queryByText("Rename exploded")).toBeNull());
		});

		it("OpenUrlDialog shows the field error for an over-long URL and does not call the api", async () => {
			const user = userEvent.setup();
			render(<OpenUrlDialog isOpen connections={[]} onClose={vi.fn()} onSuccess={vi.fn()} />);
			await user.click(screen.getByLabelText("URL (required)"));
			await user.paste("u".repeat(8193));
			await user.click(screen.getByRole("button", { name: "Open", exact: true }));
			await fieldAlert("URL must be 8192 characters or fewer.");
			expect(mocks.api.stream.openUrl).not.toHaveBeenCalled();
		});

		it("OpenUrlDialog opens with the trimmed URL and the chosen signing connection", async () => {
			const user = userEvent.setup();
			mocks.api.stream.openUrl.mockResolvedValue(
				ok({ url: "http://127.0.0.1:1/x", contentType: "video/mp4", size: 3 }),
			);
			const onSuccess = vi.fn();
			render(
				<OpenUrlDialog
					isOpen
					connections={[{ id: "c1", name: "Prod" } as never]}
					onClose={vi.fn()}
					onSuccess={onSuccess}
				/>,
			);
			await user.type(screen.getByLabelText("URL (required)"), "  https://x.example/a.mp4 ");
			await user.selectOptions(screen.getByLabelText("Signing connection"), "c1");
			await user.click(screen.getByRole("button", { name: "Open", exact: true }));
			await waitFor(() => expect(onSuccess).toHaveBeenCalled());
			expect(mocks.api.stream.openUrl).toHaveBeenCalledWith({ url: "https://x.example/a.mp4", connectionId: "c1" });
		});

		it("AddBucketDialog shows field errors and does not call the api while invalid", async () => {
			const user = userEvent.setup();
			render(<AddBucketDialog isOpen connectionId="c1" onClose={vi.fn()} onAdded={vi.fn()} />);
			await user.click(screen.getByRole("button", { name: "Add bucket" }));
			await fieldAlert("Bucket name is required.");
			await user.type(screen.getByLabelText("Bucket name (required)"), "-bad");
			await user.click(screen.getByRole("button", { name: "Add bucket" }));
			await fieldAlert(/^Invalid bucket name\./);
			expect(mocks.api.buckets.add).not.toHaveBeenCalled();
		});

		it("AddBucketDialog adds the trimmed name and resets after it closes", async () => {
			const user = userEvent.setup();
			mocks.api.buckets.add.mockResolvedValue(ok({ id: "c1" }));
			const onAdded = vi.fn();
			harness((open, close) => <AddBucketDialog isOpen={open} connectionId="c1" onClose={close} onAdded={onAdded} />);
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			await user.type(screen.getByLabelText("Bucket name (required)"), " my-bucket ");
			await user.click(screen.getByRole("button", { name: "Add bucket" }));
			await waitFor(() => expect(onAdded).toHaveBeenCalledWith("my-bucket"));
			expect(mocks.api.buckets.add).toHaveBeenCalledWith({ connectionId: "c1", bucket: "my-bucket" });
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			expect((screen.getByLabelText("Bucket name (required)") as HTMLInputElement).value).toBe("");
		});

		it("CreateBucketDialog shows its validation messages as field errors", async () => {
			const user = userEvent.setup();
			render(
				<CreateBucketDialog
					open
					onOpenChange={vi.fn()}
					connectionId="c1"
					existingNames={["taken"]}
					onCreated={vi.fn()}
				/>,
			);
			await user.type(screen.getByLabelText("Bucket name (required)"), "AB");
			await user.click(screen.getByRole("button", { name: "Create bucket" }));
			await fieldAlert(/3 characters/);
			const input = screen.getByLabelText("Bucket name (required)");
			await user.clear(input);
			await user.type(input, "taken");
			await user.click(screen.getByRole("button", { name: "Create bucket" }));
			await fieldAlert("A bucket with this name is already listed");
			expect(mocks.api.buckets.create).not.toHaveBeenCalled();
		});

		it("NewFolderDialog shows field errors and does not call the api while invalid", async () => {
			const user = userEvent.setup();
			render(<NewFolderDialog isOpen connectionId="c1" bucket="b1" parent="" onClose={vi.fn()} onCreated={vi.fn()} />);
			const input = screen.getByLabelText("Folder name (required)");
			await user.type(input, "a/b");
			await user.click(screen.getByRole("button", { name: "Create folder" }));
			await fieldAlert("Folder name cannot contain slashes.");
			await user.clear(input);
			await user.type(input, "..");
			await user.click(screen.getByRole("button", { name: "Create folder" }));
			await fieldAlert("Invalid folder name.");
			expect(mocks.api.ops.createFolder).not.toHaveBeenCalled();
		});

		it("NewFolderDialog creates the trimmed folder once and resets after it closes", async () => {
			const user = userEvent.setup();
			let resolve!: (value: unknown) => void;
			mocks.api.ops.createFolder.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			const onCreated = vi.fn();
			harness((open, close) => (
				<NewFolderDialog
					isOpen={open}
					connectionId="c1"
					bucket="b1"
					parent="docs/"
					onClose={close}
					onCreated={onCreated}
				/>
			));
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			await user.type(screen.getByLabelText("Folder name (required)"), " reports ");
			await user.dblClick(screen.getByRole("button", { name: "Create folder" }));
			expect(mocks.api.ops.createFolder).toHaveBeenCalledTimes(1);
			expect(mocks.api.ops.createFolder).toHaveBeenCalledWith({
				connectionId: "c1",
				bucket: "b1",
				parent: "docs/",
				name: "reports",
			});
			resolve(ok({ key: "docs/reports/" }));
			await waitFor(() => expect(onCreated).toHaveBeenCalledWith("reports"));
			await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
			await user.click(screen.getByRole("button", { name: "Open test dialog" }));
			expect((screen.getByLabelText("Folder name (required)") as HTMLInputElement).value).toBe("");
		});

		it("ConnectionDialog sends one request on a double submit", async () => {
			const user = userEvent.setup();
			let resolve!: (value: unknown) => void;
			mocks.api.connections.create.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			render(<ConnectionDialog isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
			await user.type(screen.getByLabelText("Connection name (required)"), "Prod");
			await user.type(screen.getByLabelText("AWS Profile (required)"), "default");
			await user.dblClick(screen.getByRole("button", { name: "Save connection" }));
			expect(mocks.api.connections.create).toHaveBeenCalledTimes(1);
			resolve(ok({ id: "c1", name: "Prod" }));
		});

		it("AddBucketDialog sends one request on a double submit", async () => {
			const user = userEvent.setup();
			let resolve!: (value: unknown) => void;
			mocks.api.buckets.add.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			render(<AddBucketDialog isOpen connectionId="c1" onClose={vi.fn()} onAdded={vi.fn()} />);
			await user.type(screen.getByLabelText("Bucket name (required)"), "my-bucket");
			await user.dblClick(screen.getByRole("button", { name: "Add bucket" }));
			expect(mocks.api.buckets.add).toHaveBeenCalledTimes(1);
			resolve(ok({ id: "c1" }));
		});

		it("OpenUrlDialog sends one request on a double submit", async () => {
			const user = userEvent.setup();
			let resolve!: (value: unknown) => void;
			mocks.api.stream.openUrl.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			render(<OpenUrlDialog isOpen connections={[]} onClose={vi.fn()} onSuccess={vi.fn()} />);
			await user.type(screen.getByLabelText("URL (required)"), "https://x.example/a.mp4");
			await user.dblClick(screen.getByRole("button", { name: "Open", exact: true }));
			expect(mocks.api.stream.openUrl).toHaveBeenCalledTimes(1);
			resolve(ok({ url: "http://127.0.0.1:1/x", contentType: "video/mp4", size: 3 }));
		});
	});
});
