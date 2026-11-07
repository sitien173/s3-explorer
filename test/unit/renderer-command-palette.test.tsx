// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: {
		connections: { list: vi.fn() },
		buckets: { list: vi.fn() },
	},
}));

vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (result: any) => result.data,
}));

import { CommandPalette, type CommandPaletteProps } from "../../src/renderer/src/components/CommandPalette";
import { AlertDialog } from "../../src/renderer/src/components/ui/alert-dialog";
import { useShellStore } from "../../src/renderer/src/store";

const defaultProps: CommandPaletteProps = {
	onUpload: vi.fn(),
	onNewFolder: vi.fn(),
	onOpenUrl: vi.fn(),
	onRefresh: vi.fn(),
	onAddConnection: vi.fn(),
	onToggleTransfers: vi.fn(),
	onNavigate: vi.fn(),
	onSelectBucket: vi.fn(),
};

afterEach(() => {
	cleanup();
	useShellStore.getState().reset();
	vi.clearAllMocks();
});

beforeEach(() => {
	mocks.api.connections.list.mockResolvedValue({
		ok: true,
		data: [{ id: "conn-1", name: "Main Connection", kind: "manual" }],
	});
	mocks.api.buckets.list.mockResolvedValue({
		ok: true,
		data: {
			buckets: [
				{ name: "bucket-alpha", pinned: false },
				{ name: "bucket-beta", pinned: false },
			],
			listDenied: false,
		},
	});
});

describe("CommandPalette", () => {
	it("opens on Ctrl+K and Cmd+K, and closes on a second press or Escape", async () => {
		const user = userEvent.setup();
		render(
			<div>
				<button type="button">Opener</button>
				<CommandPalette {...defaultProps} />
			</div>,
		);

		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();
		expect(useShellStore.getState().paletteOpen).toBe(true);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
		});
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", metaKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();
		expect(useShellStore.getState().paletteOpen).toBe(true);

		await user.keyboard("{Escape}");
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
		});
		expect(useShellStore.getState().paletteOpen).toBe(false);
	});

	it("is ignored while a dialog or Quick Look is open", () => {
		render(<CommandPalette {...defaultProps} />);

		useShellStore.getState().openDialog({ kind: "rename" });
		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(useShellStore.getState().paletteOpen).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();

		useShellStore.getState().closeDialog();
		useShellStore.getState().setViewerTarget({
			kind: "s3",
			connectionId: "conn-1",
			bucket: "bucket-alpha",
			key: "video.mp4",
		});
		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(useShellStore.getState().paletteOpen).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
	});

	it("is ignored when an AlertDialog in the DOM is open that is not in the store", () => {
		render(
			<div>
				<AlertDialog isOpen={true} title="Non-store Alert" onClose={() => {}}>
					Alert Content
				</AlertDialog>
				<CommandPalette {...defaultProps} />
			</div>,
		);

		expect(useShellStore.getState().dialog).toBeNull();
		expect(screen.getByRole("alertdialog")).toBeTruthy();

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(useShellStore.getState().paletteOpen).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
	});

	it("is ignored when focus is in a text input other than its own", () => {
		render(
			<div>
				<input data-testid="external-input" type="text" />
				<CommandPalette {...defaultProps} />
			</div>,
		);

		const input = screen.getByTestId("external-input");
		input.focus();
		expect(document.activeElement).toBe(input);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(useShellStore.getState().paletteOpen).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
	});

	it("types a bucket name and pressing Enter opens that bucket", async () => {
		const user = userEvent.setup();
		const onSelectBucket = vi.fn();
		useShellStore.getState().selectConnection("conn-1");

		render(<CommandPalette {...defaultProps} onSelectBucket={onSelectBucket} />);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

		await screen.findByRole("option", { name: /bucket-alpha/i });

		const searchInput = screen.getByRole("combobox");
		await user.type(searchInput, "bucket-beta");

		await user.keyboard("{Enter}");

		expect(onSelectBucket).toHaveBeenCalledWith("conn-1", "bucket-beta");
		await waitFor(() => {
			expect(useShellStore.getState().paletteOpen).toBe(false);
		});
	});

	it("selects the bucket on exact bucket-name match when a bucket and prefix are open", async () => {
		const user = userEvent.setup();
		const onSelectBucket = vi.fn();
		useShellStore.getState().selectConnection("conn-1");
		useShellStore.getState().selectBucket("conn-1", "bucket-alpha");
		useShellStore.getState().navigate("seeded/");

		render(<CommandPalette {...defaultProps} onSelectBucket={onSelectBucket} />);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

		const searchInput = screen.getByRole("combobox");
		await user.type(searchInput, "bucket-alpha");

		await user.keyboard("{Enter}");

		expect(onSelectBucket).toHaveBeenCalledWith("conn-1", "bucket-alpha");
		await waitFor(() => {
			expect(useShellStore.getState().paletteOpen).toBe(false);
		});
	});

	it("matches items on group name such as 'actions' without showing Empty", async () => {
		const user = userEvent.setup();
		useShellStore.getState().selectConnection("conn-1");
		useShellStore.getState().selectBucket("conn-1", "bucket-alpha");

		render(<CommandPalette {...defaultProps} />);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

		const searchInput = screen.getByRole("combobox");
		await user.type(searchInput, "actions");

		expect(screen.queryByText("No matching commands")).toBeNull();
		expect(screen.getByRole("option", { name: "Upload" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "Open URL" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "New folder" })).toBeTruthy();
	});

	it("shows Upload, New folder and Refresh items only when currentBucket is set", async () => {
		useShellStore.getState().selectConnection("conn-1");
		const { rerender } = render(<CommandPalette {...defaultProps} />);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

		expect(screen.queryByRole("option", { name: "Upload" })).toBeNull();
		expect(screen.queryByRole("option", { name: "New folder" })).toBeNull();
		expect(screen.queryByRole("option", { name: "Refresh" })).toBeNull();
		expect(screen.getByRole("option", { name: "Open URL" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "Add connection" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "Transfers" })).toBeTruthy();

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
		});

		useShellStore.getState().selectBucket("conn-1", "bucket-alpha");
		rerender(<CommandPalette {...defaultProps} />);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();

		expect(await screen.findByRole("option", { name: "Upload" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "New folder" })).toBeTruthy();
		expect(screen.getByRole("option", { name: "Refresh" })).toBeTruthy();
	});

	it("calls the appropriate handler for each action", async () => {
		const user = userEvent.setup();
		const onUpload = vi.fn();
		const onOpenUrl = vi.fn();
		const onNewFolder = vi.fn();
		const onRefresh = vi.fn();
		const onAddConnection = vi.fn();
		const onToggleTransfers = vi.fn();

		useShellStore.getState().selectConnection("conn-1");
		useShellStore.getState().selectBucket("conn-1", "bucket-alpha");

		render(
			<CommandPalette
				{...defaultProps}
				onUpload={onUpload}
				onOpenUrl={onOpenUrl}
				onNewFolder={onNewFolder}
				onRefresh={onRefresh}
				onAddConnection={onAddConnection}
				onToggleTransfers={onToggleTransfers}
			/>,
		);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const uploadOption = await screen.findByRole("option", { name: "Upload" });
		await user.click(uploadOption);
		expect(onUpload).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const openUrlOption = await screen.findByRole("option", { name: "Open URL" });
		await user.click(openUrlOption);
		expect(onOpenUrl).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const newFolderOption = await screen.findByRole("option", { name: "New folder" });
		await user.click(newFolderOption);
		expect(onNewFolder).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const refreshOption = await screen.findByRole("option", { name: "Refresh" });
		await user.click(refreshOption);
		expect(onRefresh).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const addConnOption = await screen.findByRole("option", { name: "Add connection" });
		await user.click(addConnOption);
		expect(onAddConnection).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const transfersOption = await screen.findByRole("option", { name: "Transfers" });
		await user.click(transfersOption);
		expect(onToggleTransfers).toHaveBeenCalled();
		expect(useShellStore.getState().paletteOpen).toBe(false);
	});

	it("returns focus to the opener on close", async () => {
		const user = userEvent.setup();
		render(
			<div>
				<button type="button" data-testid="opener-button">
					Open Palette Button
				</button>
				<CommandPalette {...defaultProps} />
			</div>,
		);

		const opener = screen.getByTestId("opener-button");
		opener.focus();
		expect(document.activeElement).toBe(opener);

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		const dialog = await screen.findByRole("dialog", { name: "Command palette" });
		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true);
		});

		await user.keyboard("{Escape}");
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
		});

		await waitFor(() => {
			expect(document.activeElement).toBe(opener);
		});
	});

	it("removes keydown listener on unmount", () => {
		const { unmount } = render(<CommandPalette {...defaultProps} />);
		unmount();

		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		expect(useShellStore.getState().paletteOpen).toBe(false);
		expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
	});
});
