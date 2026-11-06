// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  api: {
    connections: { listProfiles: vi.fn(), create: vi.fn(), update: vi.fn(), testConnection: vi.fn() },
    buckets: { add: vi.fn(), create: vi.fn(), delete: vi.fn() },
    ops: { onProgress: vi.fn(() => () => {}), countPrefix: vi.fn(), deletePrefix: vi.fn(), delete: vi.fn(), renamePrefix: vi.fn(), rename: vi.fn() },
    stream: { openUrl: vi.fn() },
  },
}));
vi.mock("../../src/renderer/src/api", () => ({ api: mocks.api, unwrap: (r: any) => { if (!r.ok) throw new Error(r.error?.message); return r.data; } }));

import { ConnectionDialog } from "../../src/renderer/src/components/ConnectionDialog";
import { AddBucketDialog } from "../../src/renderer/src/components/AddBucketDialog";
import { CreateBucketDialog } from "../../src/renderer/src/components/CreateBucketDialog";
import { DeleteBucketDialog } from "../../src/renderer/src/components/DeleteBucketDialog";
import { RenameDialog } from "../../src/renderer/src/components/RenameDialog";
import { ConfirmDeleteDialog } from "../../src/renderer/src/components/ConfirmDeleteDialog";
import { OpenUrlDialog } from "../../src/renderer/src/components/OpenUrlDialog";
import { OperationReport } from "../../src/renderer/src/components/OperationReport";
import { Dialog } from "../../src/renderer/src/components/ui/dialog";

const ok = (data: unknown) => ({ ok: true as const, data });

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.connections.listProfiles.mockResolvedValue(ok([]));
  mocks.api.ops.countPrefix.mockResolvedValue(ok({ count: 0 }));
});

function harness(renderDialog: (open: boolean, close: () => void) => React.ReactNode) {
  const onClose = vi.fn();
  function Harness() {
    const [open, setOpen] = React.useState(false);
    const close = () => { onClose(); setOpen(false); };
    return <><button onClick={() => setOpen(true)}>Open test dialog</button>{renderDialog(open, close)}</>;
  }
  return { ...render(<Harness />), onClose };
}

async function expectModalKeyboardBehavior(user: ReturnType<typeof userEvent.setup>, role: "dialog" | "alertdialog", name: string, close: ReturnType<typeof vi.fn>) {
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
    expect(manualToggle.classList.contains("tds-btn--secondary")).toBe(true);
    expect(manualToggle.classList.contains("tds-btn--primary")).toBe(false);
    expect(profileToggle.classList.contains("tds-btn--md")).toBe(false);
    expect(manualToggle.classList.contains("tds-btn--md")).toBe(false);
    await user.click(manualToggle);
    for (const label of ["Connection name (required)", "Region (required)", "Access Key ID (required)", "Secret Access Key (required)", "Endpoint URL", "Force path-style URLs (required for MinIO / LocalStack)"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save connection" })).toBeTruthy();
    expect(modal.contains(document.activeElement)).toBe(true);
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("AddBucketDialog has its accessible name, fields, actions, and modal keyboard behavior", async () => {
    const user = userEvent.setup();
    const { onClose } = harness((open, close) => <AddBucketDialog isOpen={open} connectionId="c1" onClose={close} onAdded={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    const modal = screen.getByRole("dialog", { name: "Add bucket by name" });
    expect(screen.getByLabelText("Bucket name (required)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add bucket" })).toBeTruthy();
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
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
    render(<CreateBucketDialog open onOpenChange={vi.fn()} connectionId="c1" existingNames={["taken-bucket"]} onCreated={vi.fn()} />);
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
    render(<CreateBucketDialog open onOpenChange={onOpenChange} connectionId="c1" existingNames={[]} onCreated={onCreated} />);
    await user.type(screen.getByLabelText("Bucket name (required)"), " new-bucket ");
    await user.click(screen.getByRole("button", { name: "Create bucket" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-bucket", "Pin failed"));
    expect(mocks.api.buckets.create).toHaveBeenCalledWith({ connectionId: "c1", bucket: "new-bucket" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("CreateBucketDialog sends one request on a double submit", async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    mocks.api.buckets.create.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<CreateBucketDialog open onOpenChange={vi.fn()} connectionId="c1" existingNames={[]} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Bucket name (required)"), "new-bucket");
    await user.dblClick(screen.getByRole("button", { name: "Create bucket" }));
    expect(mocks.api.buckets.create).toHaveBeenCalledTimes(1);
    resolve(ok({ bucket: "new-bucket" }));
  });

  it("CreateBucketDialog shows an api error inline and stays open", async () => {
    const user = userEvent.setup();
    mocks.api.buckets.create.mockResolvedValue({ ok: false, error: { code: "BUCKET_EXISTS", message: "Bucket name is taken" } });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(<CreateBucketDialog open onOpenChange={onOpenChange} connectionId="c1" existingNames={[]} onCreated={onCreated} />);
    await user.type(screen.getByLabelText("Bucket name (required)"), "new-bucket");
    await user.click(screen.getByRole("button", { name: "Create bucket" }));
    expect(await screen.findByText("Bucket name is taken")).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("DeleteBucketDialog enables confirm only on an exact name match", async () => {
    const user = userEvent.setup();
    render(<DeleteBucketDialog open onOpenChange={vi.fn()} connectionName="Conn" connectionId="c1" bucket="My-Bucket" onDeleted={vi.fn()} />);
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
    mocks.api.buckets.delete.mockResolvedValue({ ok: false, error: { code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" } });
    const onDeleted = vi.fn();
    render(<DeleteBucketDialog open onOpenChange={vi.fn()} connectionName="Conn" connectionId="c1" bucket="b1" onDeleted={onDeleted} />);
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
    render(<DeleteBucketDialog open onOpenChange={vi.fn()} connectionName="Conn" connectionId="c1" bucket="b1" onDeleted={onDeleted} />);
    await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
    await user.click(screen.getByRole("button", { name: "Delete bucket" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("b1", "Cleanup failed"));
  });

  it("DeleteBucketDialog keeps its target when props change while open", async () => {
    const user = userEvent.setup();
    mocks.api.buckets.delete.mockResolvedValue(ok({ bucket: "b1" }));
    const onDeleted = vi.fn();
    const view = render(<DeleteBucketDialog open onOpenChange={vi.fn()} connectionName="Conn" connectionId="c1" bucket="b1" onDeleted={onDeleted} />);
    view.rerender(<DeleteBucketDialog open onOpenChange={vi.fn()} connectionName="Other" connectionId="c2" bucket="b2" onDeleted={onDeleted} />);
    await user.type(screen.getByLabelText(/Type the bucket name to confirm/), "b1");
    await user.click(screen.getByRole("button", { name: "Delete bucket" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("b1", undefined));
    expect(mocks.api.buckets.delete).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b1" });
  });

  it("CreateBucketDialog ignores dismissal while a request is pending and closes after it resolves", async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    mocks.api.buckets.create.mockReturnValue(new Promise((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(<CreateBucketDialog open onOpenChange={onOpenChange} connectionId="c1" existingNames={[]} onCreated={vi.fn()} />);
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
    mocks.api.buckets.delete.mockReturnValue(new Promise((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(<DeleteBucketDialog open onOpenChange={onOpenChange} connectionName="Conn" connectionId="c1" bucket="b1" onDeleted={onDeleted} />);
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
    const { onClose } = harness((open, close) => <RenameDialog isOpen={open} connectionId="c1" bucket="b1" item={item} onClose={close} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    const modal = screen.getByRole("dialog", { name: "Rename or move object" });
    expect(screen.getByLabelText("Target key (required)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
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
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Open test dialog</button><ConfirmDeleteDialog isOpen={open} connectionId="c1" bucket="b1" item={items[0]} items={items} onClose={() => setOpen(false)} onSuccess={onSuccess} /></>;
    }
    render(<Harness />);
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
    const itemB = { kind: "object" as const, name: "b.txt", key: "b.txt", size: 2 };
    mocks.api.ops.delete.mockResolvedValue(ok({ completed: ["a.txt"], remaining: [] }));
    const onSuccess = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      // Active item is itemB (or null), but selected items contains only itemA
      return <><button onClick={() => setOpen(true)}>Open test dialog</button><ConfirmDeleteDialog isOpen={open} connectionId="c1" bucket="b1" item={itemA} items={[itemA]} onClose={() => setOpen(false)} onSuccess={onSuccess} /></>;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    expect(screen.getByRole("alertdialog", { name: "Delete object" })).toBeTruthy();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeTruthy();
    expect(screen.getByText("a.txt")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.api.ops.delete).toHaveBeenCalledTimes(1));
    expect(mocks.api.ops.delete.mock.calls[0][0].keys).toEqual(["a.txt"]);
  });

  it("ConfirmDeleteDialog disables delete when multi-selection contains folders", async () => {
    const user = userEvent.setup();
    const folder = { kind: "folder" as const, name: "docs/", prefix: "docs/" };
    const object = { kind: "object" as const, name: "a.txt", key: "a.txt", size: 1 };
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Open test dialog</button><ConfirmDeleteDialog isOpen={open} connectionId="c1" bucket="b1" item={null} items={[folder, object]} onClose={() => setOpen(false)} onSuccess={vi.fn()} /></>;
    }
    render(<Harness />);
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
    const { onClose } = harness((open, close) => <ConfirmDeleteDialog isOpen={open} connectionId="c1" bucket="b1" item={item} onClose={close} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    const modal = screen.getByRole("alertdialog", { name: "Delete object" });
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(modal.contains(document.activeElement)).toBe(true);
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
  });

  it("OpenUrlDialog preserves e2e labels, signing value, action, and modal keyboard behavior", async () => {
    const user = userEvent.setup();
    const { onClose } = harness((open, close) => <OpenUrlDialog isOpen={open} connections={[]} onClose={close} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    const modal = screen.getByRole("dialog", { name: "Open URL" });
    expect(screen.getByLabelText("URL (required)")).toBeTruthy();
    expect((screen.getByLabelText("Signing connection") as HTMLSelectElement).value).toBe("anonymous");
    expect(screen.getByRole("button", { name: "Open", exact: true })).toBeTruthy();
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
  });

  it("OperationReport has its accessible name and close action with modal keyboard behavior", async () => {
    const user = userEvent.setup();
    const { onClose } = harness((open, close) => <OperationReport isOpen={open} completedCount={1} remainingKeys={[]} onClose={close} />);
    await user.click(screen.getByRole("button", { name: "Open test dialog" }));
    const modal = screen.getByRole("dialog", { name: "Operation report" });
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open test dialog" })));
  });

  it("new-folder dialog usage has its title, field, buttons, and modal keyboard behavior", async () => {
    const user = userEvent.setup();
    const { onClose } = harness((open, close) => <Dialog isOpen={open} title="New folder" onClose={close} footer={<><button onClick={close}>Cancel</button><button>Create folder</button></>}><label htmlFor="folder-name">Folder name (required)</label><input id="folder-name" /></Dialog>);
    const trigger = screen.getByRole("button", { name: "Open test dialog" });
    await user.click(trigger);
    const modal = screen.getByRole("dialog", { name: "New folder" });
    expect(screen.getByLabelText("Folder name (required)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create folder" })).toBeTruthy();
    expect(modal.contains(document.activeElement)).toBe(true);
    await user.tab(); expect(modal.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}"); expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
