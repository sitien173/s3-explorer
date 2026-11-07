// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useInfiniteQuery } from "@tanstack/react-query";
import { render } from "./render-with-query";
import { objectsQuery } from "../../src/renderer/src/queries";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
	useDefaultLayout,
} from "../../src/renderer/src/components/ui/resizable";
import { Toolbar } from "../../src/renderer/src/components/Toolbar";
import { Breadcrumb } from "../../src/renderer/src/components/Breadcrumb";
import { TransfersDrawer } from "../../src/renderer/src/components/TransfersDrawer";
import { RenameDialog } from "../../src/renderer/src/components/RenameDialog";
import { ConfirmDeleteDialog } from "../../src/renderer/src/components/ConfirmDeleteDialog";

const mocks = vi.hoisted(() => ({
	api: {
		connections: { list: vi.fn() },
		objects: { list: vi.fn() },
		buckets: { list: vi.fn(), pin: vi.fn(), unpin: vi.fn(), create: vi.fn(), delete: vi.fn() },
		ops: {
			rename: vi.fn(),
			onProgress: vi.fn(() => () => {}),
			countPrefix: vi.fn(),
			delete: vi.fn(),
			deletePrefix: vi.fn(),
			createFolder: vi.fn(),
		},
		transfers: {
			onProgress: vi.fn(() => () => {}),
			onDone: vi.fn(() => () => {}),
			onError: vi.fn(() => () => {}),
			pathsForFiles: vi.fn(() => []),
		},
	},
}));
vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (result: any) => result.data,
}));
const toastMocks = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("sonner", async (importOriginal) => {
	const actual = await importOriginal<typeof import("sonner")>();
	return {
		...actual,
		toast: Object.assign((...args: unknown[]) => (actual.toast as any)(...args), actual.toast, {
			warning: toastMocks.warning,
		}),
	};
});
import { Sidebar } from "../../src/renderer/src/components/Sidebar";
import Shell from "../../src/renderer/src/Shell";
import { useShellStore } from "../../src/renderer/src/store";

const sidebarProps = {
	selectedConnectionId: null,
	selectedBucket: null,
	onSelectConnection: vi.fn(),
	onSelectBucket: vi.fn(),
	onOpenAddConnection: vi.fn(),
	onOpenEditConnection: vi.fn(),
	onBucketDeleted: vi.fn(),
};

afterEach(() => {
	cleanup();
	useShellStore.getState().reset();
	vi.clearAllMocks();
});

function PersistLayout({ onLayout }: { onLayout: (defaultLayout: unknown, onLayoutChanged: unknown) => void }) {
	const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "shell-test", panelIds: ["left", "right"] });
	onLayout(defaultLayout, onLayoutChanged);
	return (
		<ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
			<ResizablePanel id="left" defaultSize={50}>
				Left
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="right" defaultSize={50}>
				Right
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function DrawerHarness() {
	const [open, setOpen] = React.useState(false);
	return (
		<TransfersDrawer
			transfers={[
				{
					transferId: "t1",
					kind: "upload",
					bucket: "b",
					key: "folder/file.txt",
					loaded: 1,
					total: 2,
					status: "running",
				},
			]}
			isOpen={open}
			onToggle={() => setOpen((value) => !value)}
			onCancel={() => {}}
		/>
	);
}

function MockSidebar({ selectedConnectionId, onSelectBucket, onBucketDeleted }: any) {
	return (
		<div>
			<span data-testid="selected-connection">{selectedConnectionId ?? "none"}</span>
			<button onClick={() => onSelectBucket("c1", "b1")}>pick b1</button>
			<button onClick={() => onBucketDeleted("c1", "b1")}>delete b1</button>
			<button onClick={() => onBucketDeleted("c1", "other")}>delete other bucket</button>
			<button onClick={() => onBucketDeleted("c2", "b1")}>delete other connection</button>
		</div>
	);
}

const DOCS_ROW = { kind: "object", name: "a.txt", key: "docs/a.txt", size: 1 } as const;

// Keeps a listing for the open prefix and for a sibling prefix active, so invalidation shows up as list calls.
function MockObjectTable({
	connectionId,
	bucket,
	prefix,
	onNavigate,
	onSelectionChange,
	onSelectRow,
	onGridAction,
}: any) {
	useInfiniteQuery(objectsQuery({ connectionId, bucket, prefix }));
	useInfiniteQuery(objectsQuery({ connectionId, bucket, prefix: "sibling/" }));
	return (
		<div>
			<div data-testid="table">{bucket}</div>
			<button onClick={() => onNavigate("docs/")}>go docs</button>
			<button
				onClick={() => {
					onSelectRow(DOCS_ROW);
					onSelectionChange({ selected: [DOCS_ROW.key], active: DOCS_ROW.key, anchor: DOCS_ROW.key });
				}}
			>
				select row
			</button>
			<button onClick={() => onGridAction("rename", DOCS_ROW)}>grid rename</button>
			<button onClick={() => onGridAction("delete", DOCS_ROW)}>grid delete</button>
		</div>
	);
}

function MockToolbar({ onNewFolder }: any) {
	return <button onClick={onNewFolder}>toolbar new folder</button>;
}

function MockRenameDialog({ isOpen, onSuccess }: any) {
	return isOpen ? <button onClick={() => onSuccess(undefined, "docs/b.txt")}>confirm rename</button> : null;
}

function MockConfirmDeleteDialog({ isOpen, onSuccess }: any) {
	return isOpen ? <button onClick={() => onSuccess()}>confirm delete</button> : null;
}

function MockNothing() {
	return null;
}

describe("renderer shell", () => {
	it("persists panel sizes across remounts", async () => {
		localStorage.clear();
		let restored: unknown;
		let saveLayout: ((layout: Record<string, number>, meta: { isUserInteraction: boolean }) => void) | undefined;
		const onLayout = (defaultLayout: unknown, onLayoutChanged: unknown) => {
			restored = defaultLayout;
			saveLayout = onLayoutChanged as typeof saveLayout;
		};
		const first = render(<PersistLayout onLayout={onLayout} />);
		expect(document.querySelector("[data-group]")).toBeTruthy();
		saveLayout?.({ left: 65, right: 35 }, { isUserInteraction: true });
		first.unmount();
		render(<PersistLayout onLayout={onLayout} />);
		expect(restored).toEqual({ left: 65, right: 35 });
	});

	it("exposes the toolbar actions with accessible names and tooltips", async () => {
		vi.useFakeTimers();
		try {
			render(
				<Toolbar
					connectionId="c"
					bucket="b"
					prefix=""
					selectedItem={{ kind: "object", key: "a", name: "a", size: 1 } as never}
					onUpload={() => {}}
					onNewFolder={() => {}}
					onDownload={() => {}}
					onRename={() => {}}
					onDelete={() => {}}
					onOpenUrl={() => {}}
					onRefresh={() => {}}
				/>,
			);
			for (const name of ["Upload", "New folder", "Download", "Rename or move", "Delete", "Open URL", "Refresh"]) {
				const button = screen.getByRole("button", { name });
				expect(button.getAttribute("aria-label") || button.textContent).toBeTruthy();
				button.focus();
				await act(async () => {
					await vi.advanceTimersByTimeAsync(1000);
				});
				expect(screen.getByRole("tooltip").textContent).toContain(name);
				button.blur();
				await act(async () => {
					await vi.advanceTimersByTimeAsync(1000);
				});
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it("enables Delete for multi-selection and disables single-item actions", () => {
		render(
			<Toolbar
				connectionId="c"
				bucket="b"
				prefix=""
				selectedItem={{ kind: "object", key: "a", name: "a", size: 1 } as never}
				selectedCount={2}
				onUpload={() => {}}
				onNewFolder={() => {}}
				onDownload={() => {}}
				onRename={() => {}}
				onDelete={() => {}}
				onOpenUrl={() => {}}
				onRefresh={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Delete" }).hasAttribute("disabled")).toBe(false);
		expect(screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByRole("button", { name: "Rename or move" }).hasAttribute("disabled")).toBe(true);
	});

	it("renders the view mode segmented toggle with aria-pressed and fires onViewModeChange", () => {
		const onViewModeChange = vi.fn();
		const { rerender } = render(
			<Toolbar
				connectionId="c"
				bucket="b"
				prefix=""
				selectedItem={null}
				viewMode="list"
				onViewModeChange={onViewModeChange}
				onUpload={() => {}}
				onNewFolder={() => {}}
				onDownload={() => {}}
				onRename={() => {}}
				onDelete={() => {}}
				onOpenUrl={() => {}}
				onRefresh={() => {}}
			/>,
		);
		const listBtn = screen.getByRole("button", { name: "List view" });
		const gridBtn = screen.getByRole("button", { name: "Grid view" });
		expect(listBtn.getAttribute("aria-pressed")).toBe("true");
		expect(gridBtn.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(gridBtn);
		expect(onViewModeChange).toHaveBeenCalledWith("grid");

		rerender(
			<Toolbar
				connectionId="c"
				bucket="b"
				prefix=""
				selectedItem={null}
				viewMode="grid"
				onViewModeChange={onViewModeChange}
				onUpload={() => {}}
				onNewFolder={() => {}}
				onDownload={() => {}}
				onRename={() => {}}
				onDelete={() => {}}
				onOpenUrl={() => {}}
				onRefresh={() => {}}
			/>,
		);
		expect(listBtn.getAttribute("aria-pressed")).toBe("false");
		expect(gridBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("disables Delete when multi-selection contains folders", () => {
		render(
			<Toolbar
				connectionId="c"
				bucket="b"
				prefix=""
				selectedItem={null}
				selectedCount={2}
				hasFolderSelected
				onUpload={() => {}}
				onNewFolder={() => {}}
				onDownload={() => {}}
				onRename={() => {}}
				onDelete={() => {}}
				onOpenUrl={() => {}}
				onRefresh={() => {}}
			/>,
		);
		const deleteBtn = screen.getByRole("button", { name: "Delete" });
		expect(deleteBtn.hasAttribute("disabled")).toBe(true);
	});

	it("opens the sidebar bucket context menu with open and pin state actions", async () => {
		const userConnection = {
			id: "conn-1",
			name: "Local connection",
			kind: "manual",
			region: "us-east-1",
			endpoint: null,
			forcePathStyle: false,
			profile: null,
			accessKeyId: "AKIA",
			secretAccessKey: "secret",
			sessionToken: null,
		};
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [userConnection] });
		mocks.api.buckets.list.mockResolvedValue({
			ok: true,
			data: { buckets: [{ name: "bucket-one", pinned: true }], listDenied: false },
		});
		render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
		const bucket = await screen.findByRole("button", { name: "bucket-one" });
		fireEvent.contextMenu(bucket);
		expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
		expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeTruthy();
	});

	const manualConnection = {
		id: "conn-1",
		name: "Local connection",
		kind: "manual",
		region: "us-east-1",
		endpoint: null,
		forcePathStyle: false,
		profile: null,
		accessKeyId: "AKIA",
		secretAccessKey: "secret",
		sessionToken: null,
	};

	it("shows New bucket for an empty list and for a denied listing", async () => {
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [manualConnection] });
		mocks.api.buckets.list.mockResolvedValueOnce({ ok: true, data: { buckets: [], listDenied: false } });
		const view = render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
		expect(await screen.findByRole("button", { name: "New bucket" })).toBeTruthy();
		view.unmount();
		mocks.api.buckets.list.mockResolvedValueOnce({ ok: true, data: { buckets: [], listDenied: true } });
		render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
		expect(await screen.findByRole("button", { name: "New bucket" })).toBeTruthy();
	});

	it("creates a bucket, refreshes the list without a manual refresh, and shows the warning toast", async () => {
		const user = userEvent.setup();
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [manualConnection] });
		mocks.api.buckets.list
			.mockResolvedValueOnce({ ok: true, data: { buckets: [], listDenied: false } })
			.mockResolvedValue({ ok: true, data: { buckets: [{ name: "fresh-bucket", pinned: false }], listDenied: false } });
		mocks.api.buckets.create.mockResolvedValue({
			ok: true,
			data: { bucket: "fresh-bucket", warning: "Bucket created but could not be pinned" },
		});
		render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
		await user.click(await screen.findByRole("button", { name: "New bucket" }));
		await user.type(screen.getByLabelText("Bucket name (required)"), "fresh-bucket");
		await user.click(screen.getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByRole("button", { name: "fresh-bucket" })).toBeTruthy();
		expect(mocks.api.buckets.create).toHaveBeenCalledWith({ connectionId: "conn-1", bucket: "fresh-bucket" });
		expect(toastMocks.warning).toHaveBeenCalledWith("Bucket created but could not be pinned", expect.anything());
	});

	it("deletes a bucket from the context menu, refreshes, and calls onBucketDeleted", async () => {
		const user = userEvent.setup();
		const onBucketDeleted = vi.fn();
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [manualConnection] });
		mocks.api.buckets.list
			.mockResolvedValueOnce({
				ok: true,
				data: { buckets: [{ name: "bucket-one", pinned: false }], listDenied: false },
			})
			.mockResolvedValue({ ok: true, data: { buckets: [], listDenied: false } });
		mocks.api.buckets.delete.mockResolvedValue({
			ok: true,
			data: { bucket: "bucket-one", warning: "Pin cleanup failed" },
		});
		render(<Sidebar {...sidebarProps} onBucketDeleted={onBucketDeleted} selectedConnectionId="conn-1" />);
		fireEvent.contextMenu(await screen.findByRole("button", { name: "bucket-one" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete bucket" }));
		await user.type(await screen.findByLabelText(/Type the bucket name to confirm/), "bucket-one");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		await waitFor(() => expect(onBucketDeleted).toHaveBeenCalledWith("conn-1", "bucket-one"));
		expect(mocks.api.buckets.delete).toHaveBeenCalledWith({ connectionId: "conn-1", bucket: "bucket-one" });
		await waitFor(() => expect(screen.queryByRole("button", { name: "bucket-one" })).toBeNull());
		expect(toastMocks.warning).toHaveBeenCalledWith("Pin cleanup failed", expect.anything());
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "New bucket" })));
	});

	it("keeps the bucket listed and shows Bucket is not empty when delete fails", async () => {
		const user = userEvent.setup();
		const onBucketDeleted = vi.fn();
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [manualConnection] });
		mocks.api.buckets.list.mockResolvedValue({
			ok: true,
			data: { buckets: [{ name: "bucket-one", pinned: false }], listDenied: false },
		});
		mocks.api.buckets.delete.mockResolvedValue({
			ok: false,
			error: { code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" },
		});
		render(<Sidebar {...sidebarProps} onBucketDeleted={onBucketDeleted} selectedConnectionId="conn-1" />);
		fireEvent.contextMenu(await screen.findByRole("button", { name: "bucket-one" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete bucket" }));
		await user.type(await screen.findByLabelText(/Type the bucket name to confirm/), "bucket-one");
		await user.click(screen.getByRole("button", { name: "Delete bucket" }));
		expect(await screen.findByText("Bucket is not empty")).toBeTruthy();
		expect(onBucketDeleted).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "bucket-one", hidden: true })).toBeTruthy();
	});

	it("restores focus to the bucket trigger after cancelling Delete bucket from the context menu", async () => {
		const user = userEvent.setup();
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [manualConnection] });
		mocks.api.buckets.list.mockResolvedValue({
			ok: true,
			data: { buckets: [{ name: "bucket-one", pinned: false }], listDenied: false },
		});
		render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
		const bucketButton = await screen.findByRole("button", { name: "bucket-one" });
		const row = bucketButton.parentElement as HTMLElement;
		bucketButton.focus();
		fireEvent.contextMenu(bucketButton);
		const item = await screen.findByRole("menuitem", { name: "Delete bucket" });
		item.focus();
		await user.keyboard("{Enter}");
		await screen.findByRole("alertdialog", { name: "Delete bucket" });
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		await waitFor(() => expect(row.contains(document.activeElement)).toBe(true));
	});

	describe("App bucket deletion state", () => {
		async function renderApp() {
			vi.resetModules();
			vi.doMock("../../src/renderer/src/components/Sidebar", () => ({ Sidebar: MockSidebar }));
			vi.doMock("../../src/renderer/src/components/ObjectTable", () => ({ ObjectTable: MockObjectTable }));
			vi.doMock("../../src/renderer/src/components/SearchBar", () => ({ SearchBar: MockNothing }));
			vi.doMock("../../src/renderer/src/components/Toolbar", () => ({ Toolbar: MockToolbar }));
			vi.doMock("../../src/renderer/src/components/RenameDialog", () => ({ RenameDialog: MockRenameDialog }));
			vi.doMock("../../src/renderer/src/components/ConfirmDeleteDialog", () => ({
				ConfirmDeleteDialog: MockConfirmDeleteDialog,
			}));
			mocks.api.objects.list.mockResolvedValue({ ok: true, data: { folders: [], objects: [] } });
			Object.assign(mocks.api, { transfers: { onProgress: vi.fn(() => () => {}), onDone: vi.fn(() => () => {}) } });
			mocks.api.connections.list.mockResolvedValue({ ok: true, data: [] });
			const { default: App } = await import("../../src/renderer/src/App");
			return render(<App />);
		}
		afterEach(() => {
			vi.doUnmock("../../src/renderer/src/components/Sidebar");
			vi.doUnmock("../../src/renderer/src/components/ObjectTable");
			vi.doUnmock("../../src/renderer/src/components/SearchBar");
			vi.doUnmock("../../src/renderer/src/components/Toolbar");
			vi.doUnmock("../../src/renderer/src/components/RenameDialog");
			vi.doUnmock("../../src/renderer/src/components/ConfirmDeleteDialog");
			vi.resetModules();
		});

		it("returns to the no-bucket state and keeps the connection when the open bucket is deleted", async () => {
			const user = userEvent.setup();
			await renderApp();
			await user.click(screen.getByRole("button", { name: "pick b1" }));
			expect(screen.getByTestId("table").textContent).toBe("b1");
			await user.click(screen.getByRole("button", { name: "delete b1" }));
			expect(screen.getByText("No bucket selected")).toBeTruthy();
			expect(screen.getByTestId("selected-connection").textContent).toBe("c1");
		});

		describe("Quick Look selection wiring", () => {
			it("moves selection and focus to the row Quick Look last showed", async () => {
				const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
				Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
				Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
				try {
					const user = userEvent.setup();
					vi.resetModules();
					vi.doMock("../../src/renderer/src/components/Sidebar", () => ({ Sidebar: MockSidebar }));
					mocks.api.objects.list.mockResolvedValue({
						ok: true,
						data: {
							folders: [],
							objects: ["a.png", "b.png", "c.png"].map((key) => ({ key, size: 1, lastModified: "2026-01-01" })),
						},
					});
					Object.assign(mocks.api, {
						transfers: { onProgress: vi.fn(() => () => {}), onDone: vi.fn(() => () => {}) },
						stream: {
							open: vi.fn(async ({ key }: { key: string }) => ({
								ok: true,
								data: { url: `http://127.0.0.1/${key}`, contentType: "image/png", size: 1 },
							})),
						},
					});
					mocks.api.connections.list.mockResolvedValue({ ok: true, data: [] });
					const { default: App } = await import("../../src/renderer/src/App");
					render(<App />);
					await user.click(screen.getByRole("button", { name: "pick b1" }));
					const row = async (key: string) => screen.findByRole("row", { name: new RegExp(key) });

					await user.click(await row("a.png"));
					fireEvent.keyDown(screen.getByRole("grid"), { key: " " });
					const popup = await screen.findByRole("dialog");
					fireEvent.keyDown(popup, { key: "ArrowRight" });
					fireEvent.keyDown(popup, { key: "Escape" });
					await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

					const next = await row("b.png");
					await waitFor(() => expect(next.getAttribute("aria-selected")).toBe("true"));
					expect((await row("a.png")).getAttribute("aria-selected")).toBe("false");
					await waitFor(() => expect(document.activeElement).toBe(next));
				} finally {
					vi.doUnmock("../../src/renderer/src/components/Sidebar");
					if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
					else delete (HTMLElement.prototype as any).clientHeight;
					delete (HTMLElement.prototype as any).clientWidth;
				}
			});
		});

		describe("listing invalidation wiring", () => {
			const listCalls = (prefix: string) =>
				mocks.api.objects.list.mock.calls.filter(([request]) => request.prefix === prefix).length;

			async function openDocs() {
				const user = userEvent.setup();
				await renderApp();
				await user.click(screen.getByRole("button", { name: "pick b1" }));
				await user.click(screen.getByRole("button", { name: "go docs" }));
				await waitFor(() => expect(listCalls("docs/")).toBe(1));
				await waitFor(() => expect(listCalls("sibling/")).toBe(1));
				return user;
			}

			async function expectOnlyDocsRefetched() {
				await waitFor(() => expect(listCalls("docs/")).toBe(2));
				expect(listCalls("sibling/")).toBe(1);
			}

			it("refetches the parent listing, not a sibling, after a delete", async () => {
				const user = await openDocs();
				await user.click(screen.getByRole("button", { name: "select row" }));
				await user.click(screen.getByRole("button", { name: "grid delete" }));
				await user.click(screen.getByRole("button", { name: "confirm delete" }));
				await expectOnlyDocsRefetched();
			});

			it("refetches the parent listing, not a sibling, after a rename", async () => {
				const user = await openDocs();
				await user.click(screen.getByRole("button", { name: "select row" }));
				await user.click(screen.getByRole("button", { name: "grid rename" }));
				await user.click(screen.getByRole("button", { name: "confirm rename" }));
				await expectOnlyDocsRefetched();
			});

			it("refetches the parent listing, not a sibling, after a new folder", async () => {
				const user = await openDocs();
				mocks.api.ops.createFolder.mockResolvedValue({ ok: true, data: {} });
				await user.click(screen.getByRole("button", { name: "toolbar new folder" }));
				await user.type(await screen.findByLabelText("Folder name (required)"), "new");
				await user.click(screen.getByRole("button", { name: "Create folder" }));
				await expectOnlyDocsRefetched();
			});
		});

		it("leaves the selection unchanged when a different bucket or connection is deleted", async () => {
			const user = userEvent.setup();
			await renderApp();
			await user.click(screen.getByRole("button", { name: "pick b1" }));
			await user.click(screen.getByRole("button", { name: "delete other bucket" }));
			await user.click(screen.getByRole("button", { name: "delete other connection" }));
			expect(screen.getByTestId("table").textContent).toBe("b1");
		});
	});

	it("reports a failed rename through its one-shot failure callback", async () => {
		const user = userEvent.setup();
		mocks.api.ops.rename.mockRejectedValueOnce(new Error("private /mnt/path"));
		const onFailure = vi.fn();
		render(
			<RenameDialog
				isOpen
				connectionId="c"
				bucket="b"
				item={{ kind: "object", key: "old.txt", name: "old.txt", size: 1 }}
				onClose={() => {}}
				onSuccess={() => {}}
				onFailure={onFailure}
			/>,
		);
		await user.clear(screen.getByLabelText("Target key (required)"));
		await user.type(screen.getByLabelText("Target key (required)"), "new.txt");
		await user.click(screen.getByRole("button", { name: "Rename" }));
		await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
	});

	it("reports a failed delete through its one-shot failure callback", async () => {
		const user = userEvent.setup();
		mocks.api.ops.delete.mockRejectedValueOnce(new Error("private /mnt/path"));
		const onFailure = vi.fn();
		render(
			<ConfirmDeleteDialog
				isOpen
				connectionId="c"
				bucket="b"
				item={{ kind: "object", key: "old.txt", name: "old.txt", size: 1 }}
				onClose={() => {}}
				onSuccess={() => {}}
				onFailure={onFailure}
			/>,
		);
		await user.click(await screen.findByRole("button", { name: "Delete", exact: true }));
		await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
	});

	it("opens the transfers Sheet with a scrollable list and a named close action", async () => {
		const user = userEvent.setup();
		render(<DrawerHarness />);
		await user.click(screen.getByRole("button", { name: "Expand transfers" }));
		expect(await screen.findByRole("dialog", { name: "Transfers" })).toBeTruthy();
		const scrollContainer = screen.getByTestId("transfers-scroll-container");
		expect(scrollContainer.className).toContain("overflow-y-auto");
		expect(screen.getByRole("button", { name: "Close transfers" })).toBeTruthy();
	});

	it("renders the real Sidebar connection button and its empty state", async () => {
		const userConnection = {
			id: "conn-1",
			name: "Local connection",
			kind: "manual",
			region: "us-east-1",
			endpoint: null,
			forcePathStyle: false,
			profile: null,
			accessKeyId: "AKIA",
			secretAccessKey: "secret",
			sessionToken: null,
		};
		mocks.api.connections.list.mockResolvedValueOnce({ ok: true, data: [userConnection] });
		const view = render(<Sidebar {...sidebarProps} />);
		expect(await screen.findByRole("button", { name: /^Local connection/ })).toBeTruthy();
		view.unmount();
		mocks.api.connections.list.mockResolvedValueOnce({ ok: true, data: [] });
		render(<Sidebar {...sidebarProps} />);
		expect(await screen.findByText("No connections configured.")).toBeTruthy();
		render(<Breadcrumb bucket="bucket" prefix="" onNavigate={() => {}} />);
		expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
	});

	describe("unified toolbar and drag regions", () => {
		const originalUserAgent = navigator.userAgent;

		afterEach(() => {
			Object.defineProperty(navigator, "userAgent", { value: originalUserAgent, configurable: true });
			vi.restoreAllMocks();
			vi.resetModules();
		});

		it("configures Toolbar as a drag region with no-drag controls and reserves space for overlay controls on Linux/Windows", async () => {
			vi.resetModules();
			vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (X11; Linux x86_64)");
			const { Toolbar } = await import("../../src/renderer/src/components/Toolbar");
			render(
				<Toolbar
					connectionId="c"
					bucket="b"
					prefix=""
					selectedItem={null}
					breadcrumb={<Breadcrumb bucket="b" prefix="" onNavigate={() => {}} />}
					search={<div data-testid="search-bar">Search</div>}
					onUpload={() => {}}
					onNewFolder={() => {}}
					onDownload={() => {}}
					onRename={() => {}}
					onDelete={() => {}}
					onOpenUrl={() => {}}
					onRefresh={() => {}}
				/>,
			);

			const toolbar = screen.getByRole("toolbar", { name: "Bucket operations" });
			expect(toolbar.className).toContain("app-drag");
			expect(toolbar.className).toContain("app-overlay-inset");

			expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
			expect(screen.getByTestId("search-bar")).toBeTruthy();

			for (const name of ["Upload", "New folder", "Download", "Rename or move", "Delete", "Open URL", "Refresh"]) {
				const button = screen.getByRole("button", { name });
				expect(button.className).toContain("app-no-drag");
			}
		});

		it("configures Sidebar top strip as a drag region with no-drag controls and reserves left inset on macOS", async () => {
			vi.resetModules();
			vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
			const { Sidebar: MacSidebar } = await import("../../src/renderer/src/components/Sidebar");
			mocks.api.connections.list.mockResolvedValueOnce({ ok: true, data: [] });
			render(<MacSidebar {...sidebarProps} />);

			const addBtn = await screen.findByRole("button", { name: "Add connection" });
			expect(addBtn.className).toContain("app-no-drag");

			const topStrip = addBtn.parentElement;
			expect(topStrip?.className).toContain("app-drag");
			expect(topStrip?.className).toContain("pl-[78px]");
		});
	});

	describe("CommandPalette in Shell", () => {
		it("opens New folder dialog when selected from the command palette", async () => {
			const user = userEvent.setup();
			mocks.api.connections.list.mockResolvedValue({
				ok: true,
				data: [{ id: "conn-1", name: "Conn", kind: "manual" }],
			});
			mocks.api.buckets.list.mockResolvedValue({
				ok: true,
				data: { buckets: [{ name: "bucket-alpha", pinned: false }], listDenied: false },
			});
			mocks.api.objects.list.mockResolvedValue({
				ok: true,
				data: { folders: [], objects: [] },
			});

			useShellStore.getState().selectConnection("conn-1");
			useShellStore.getState().selectBucket("conn-1", "bucket-alpha");

			render(<Shell />);

			fireEvent.keyDown(window, { key: "k", ctrlKey: true });
			expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

			const newFolderOption = await screen.findByRole("option", { name: "New folder" });
			await user.click(newFolderOption);

			expect(useShellStore.getState().dialog).toEqual({ kind: "newFolder" });
			expect(await screen.findByRole("dialog", { name: "New folder" })).toBeTruthy();
		});

		it("switches between ObjectTable and ObjectGrid according to viewMode", async () => {
			mocks.api.connections.list.mockResolvedValue({
				ok: true,
				data: [{ id: "conn-1", name: "Alpha", kind: "manual" }],
			});
			mocks.api.buckets.list.mockResolvedValue({
				ok: true,
				data: { buckets: [{ name: "bucket-alpha" }], listDenied: false },
			});
			mocks.api.objects.list.mockResolvedValue({
				ok: true,
				data: { folders: [], objects: [{ key: "photo.jpg", size: 1024, lastModified: "2026-01-01" }] },
			});

			useShellStore.getState().selectConnection("conn-1");
			useShellStore.getState().selectBucket("conn-1", "bucket-alpha");
			useShellStore.getState().setViewMode("list");

			render(<Shell />);

			expect(await screen.findByRole("columnheader", { name: "Name" })).toBeTruthy();
			expect(screen.queryByRole("gridcell")).toBeNull();

			const gridBtn = screen.getByRole("button", { name: "Grid view" });
			fireEvent.click(gridBtn);
			expect(useShellStore.getState().viewMode).toBe("grid");

			expect(await screen.findByRole("gridcell")).toBeTruthy();
			expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull();

			const listBtn = screen.getByRole("button", { name: "List view" });
			fireEvent.click(listBtn);
			expect(useShellStore.getState().viewMode).toBe("list");

			expect(await screen.findByRole("columnheader", { name: "Name" })).toBeTruthy();
		});
	});
});
