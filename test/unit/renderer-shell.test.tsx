// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useDefaultLayout } from "../../src/renderer/src/components/ui/resizable";
import { Toolbar } from "../../src/renderer/src/components/Toolbar";
import { Breadcrumb } from "../../src/renderer/src/components/Breadcrumb";
import { AppShell } from "../../src/renderer/src/components/AppShell";
import { TransfersDrawer } from "../../src/renderer/src/components/TransfersDrawer";
import { RenameDialog } from "../../src/renderer/src/components/RenameDialog";
import { ConfirmDeleteDialog } from "../../src/renderer/src/components/ConfirmDeleteDialog";

const mocks = vi.hoisted(() => ({ api: { connections: { list: vi.fn() }, buckets: { list: vi.fn(), pin: vi.fn(), unpin: vi.fn() }, ops: { rename: vi.fn(), onProgress: vi.fn(() => () => {}), countPrefix: vi.fn(), delete: vi.fn(), deletePrefix: vi.fn() } } }));
vi.mock("../../src/renderer/src/api", () => ({ api: mocks.api, unwrap: (result: any) => result.data }));
import { Sidebar } from "../../src/renderer/src/components/Sidebar";

const sidebarProps = { selectedConnectionId: null, selectedBucket: null, onSelectConnection: vi.fn(), onSelectBucket: vi.fn(), onOpenAddConnection: vi.fn(), onOpenEditConnection: vi.fn() };

afterEach(() => cleanup());

describe("renderer shell", () => {
  it("keeps sidebar size stable while restoring and opening the viewer", async () => {
    localStorage.clear();
    localStorage.setItem("react-resizable-panels:app-shell", JSON.stringify({ "sidebar,main,viewer": { layout: [22, 48, 30] } }));
    const renderShell = (viewerOpen: boolean) => render(
      <AppShell
        sidebar={<div>Sidebar</div>}
        main={<div>Main</div>}
        viewer={<div>Viewer</div>}
        viewerOpen={viewerOpen}
      />,
    );
    const first = renderShell(false);
    const initialSidebar = Array.from(document.querySelectorAll("[data-panel]")).find((panel) => panel.textContent?.includes("Sidebar"));
    expect(initialSidebar).toBeTruthy();
    const initialSize = initialSidebar?.getAttribute("style");
    expect(initialSize).toBeTruthy();
    const rawLayout = localStorage.getItem("react-resizable-panels:app-shell");
    expect(rawLayout).toContain('"layout":[22,48,30]');
    first.unmount();
    const second = renderShell(false);
    const restoredSidebar = Array.from(document.querySelectorAll("[data-panel]")).find((panel) => panel.textContent?.includes("Sidebar"));
    expect(restoredSidebar?.getAttribute("style")).toBe(initialSize);
    second.rerender(<AppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} viewer={<div>Viewer</div>} viewerOpen />);
    expect(screen.getByText("Viewer")).toBeTruthy();
    const currentSidebar = Array.from(document.querySelectorAll("[data-panel]")).find((panel) => panel.textContent?.includes("Sidebar"));
    expect(currentSidebar?.getAttribute("style")).toBe(initialSize);
  });
  it("applies viewer pane state before paint, synchronizes drag collapse, and preserves its last width", async () => {
    vi.resetModules();
    vi.doMock("../../src/renderer/src/components/ui/resizable", () => ({
      ResizablePanelGroup: ({ children, defaultLayout }: any) => <div data-testid="mock-group" data-layout={JSON.stringify(defaultLayout)}>{children}</div>,
      ResizableHandle: () => null,
      useDefaultLayout: () => ({ defaultLayout: { viewer: 0, main: 70 }, onLayoutChanged: vi.fn() }),
      ResizablePanel: ({ id, defaultSize, panelRef, onResize, children }: any) => {
        const [collapsed, setCollapsed] = React.useState(false);
        React.useLayoutEffect(() => {
          if (panelRef) panelRef.current = { collapse: () => setCollapsed(true), expand: () => setCollapsed(false) };
        }, [panelRef]);
        return <div data-testid={`${id}-panel`} data-collapsed={collapsed} data-default-size={defaultSize}>
          {id === "viewer" && <button onClick={() => onResize({ asPercentage: 0 })}>Drag closed</button>}
          {id === "viewer" && <button onClick={() => onResize({ asPercentage: 27 })}>Resize viewer</button>}
          {children}
        </div>;
      },
    }));
    const { AppShell: MockedAppShell } = await import("../../src/renderer/src/components/AppShell");
    localStorage.setItem("app-shell-last-viewer-width", "20");
    const closedByDrag = vi.fn();
    const view = render(<MockedAppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} viewer={<div>Viewer</div>} viewerOpen={false} onViewerClose={closedByDrag} />);
    expect(screen.getByTestId("viewer-panel").getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByTestId("viewer-panel").getAttribute("data-default-size")).toBe("30%");
    expect(JSON.parse(screen.getByTestId("mock-group").getAttribute("data-layout") ?? "{}").viewer).toBe(20);
    view.unmount();
    render(<MockedAppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} viewer={<div>Viewer</div>} viewerOpen onViewerClose={closedByDrag} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Resize viewer" }));
    expect(localStorage.getItem("app-shell-last-viewer-width")).toBe("27");
    await userEvent.setup().click(screen.getByRole("button", { name: "Drag closed" }));
    expect(closedByDrag).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("app-shell-last-viewer-width")).toBe("27");
    vi.doUnmock("../../src/renderer/src/components/ui/resizable");
    vi.resetModules();
  });

  it("persists panel sizes across remounts", async () => {
    localStorage.clear();
    let restored: unknown;
    let saveLayout: ((layout: Record<string, number>, meta: { isUserInteraction: boolean }) => void) | undefined;
    function Layout() {
      const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "shell-test", panelIds: ["left", "right"] });
      restored = defaultLayout;
      saveLayout = onLayoutChanged as typeof saveLayout;
      return <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}><ResizablePanel id="left" defaultSize={50}>Left</ResizablePanel><ResizableHandle /><ResizablePanel id="right" defaultSize={50}>Right</ResizablePanel></ResizablePanelGroup>;
    }
    const first = render(<Layout />);
    expect(document.querySelector("[data-group]")).toBeTruthy();
    saveLayout?.({ left: 65, right: 35 }, { isUserInteraction: true });
    first.unmount();
    render(<Layout />);
    expect(restored).toEqual({ left: 65, right: 35 });
  });

  it("exposes the toolbar actions with accessible names and tooltips", async () => {
    vi.useFakeTimers();
    try {
      render(<Toolbar connectionId="c" bucket="b" prefix="" selectedItem={{ kind: "object", key: "a", name: "a", size: 1 } as never} onUpload={() => {}} onNewFolder={() => {}} onDownload={() => {}} onRename={() => {}} onDelete={() => {}} onOpenUrl={() => {}} onRefresh={() => {}} />);
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
    render(<Toolbar connectionId="c" bucket="b" prefix="" selectedItem={{ kind: "object", key: "a", name: "a", size: 1 } as never} selectedCount={2} onUpload={() => {}} onNewFolder={() => {}} onDownload={() => {}} onRename={() => {}} onDelete={() => {}} onOpenUrl={() => {}} onRefresh={() => {}} />);
    expect(screen.getByRole("button", { name: "Delete" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Rename or move" }).hasAttribute("disabled")).toBe(true);
  });

  it("disables Delete when multi-selection contains folders", () => {
    render(<Toolbar connectionId="c" bucket="b" prefix="" selectedItem={null} selectedCount={2} hasFolderSelected onUpload={() => {}} onNewFolder={() => {}} onDownload={() => {}} onRename={() => {}} onDelete={() => {}} onOpenUrl={() => {}} onRefresh={() => {}} />);
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn.hasAttribute("disabled")).toBe(true);
  });

  it("opens the sidebar bucket context menu with open and pin state actions", async () => {
    const userConnection = { id: "conn-1", name: "Local connection", kind: "manual", region: "us-east-1", endpoint: null, forcePathStyle: false, profile: null, accessKeyId: "AKIA", secretAccessKey: "secret", sessionToken: null };
    mocks.api.connections.list.mockResolvedValue({ ok: true, data: [userConnection] });
    mocks.api.buckets.list.mockResolvedValue({ ok: true, data: { buckets: [{ name: "bucket-one", pinned: true }], listDenied: false } });
    render(<Sidebar {...sidebarProps} selectedConnectionId="conn-1" />);
    const bucket = await screen.findByRole("button", { name: "bucket-one" });
    fireEvent.contextMenu(bucket);
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
    expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeTruthy();
  });

  it("omits the viewer panel when closed and removes it after closing", async () => {
    function Shell() {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>Show viewer</button><ResizablePanelGroup orientation="horizontal"><ResizablePanel id="sidebar">Sidebar</ResizablePanel><ResizablePanel id="main">Main</ResizablePanel>{open && <ResizablePanel id="viewer"><button onClick={() => setOpen(false)}>Close viewer</button></ResizablePanel>}</ResizablePanelGroup></>;
    }
    const user = userEvent.setup();
    render(<Shell />);
    expect(document.querySelector('[data-panel-id="viewer"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show viewer" }));
    expect(screen.getByText("Close viewer")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close viewer" }));
    await waitFor(() => expect(document.querySelector('[data-panel-id="viewer"]')).toBeNull());
  });

  it("reports a failed rename through its one-shot failure callback", async () => {
    const user = userEvent.setup();
    mocks.api.ops.rename.mockRejectedValueOnce(new Error("private /mnt/path"));
    const onFailure = vi.fn();
    render(<RenameDialog isOpen connectionId="c" bucket="b" item={{ kind: "object", key: "old.txt", name: "old.txt", size: 1 }} onClose={() => {}} onSuccess={() => {}} onFailure={onFailure} />);
    await user.clear(screen.getByLabelText("Target key (required)"));
    await user.type(screen.getByLabelText("Target key (required)"), "new.txt");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
  });

  it("reports a failed delete through its one-shot failure callback", async () => {
    const user = userEvent.setup();
    mocks.api.ops.delete.mockRejectedValueOnce(new Error("private /mnt/path"));
    const onFailure = vi.fn();
    render(<ConfirmDeleteDialog isOpen connectionId="c" bucket="b" item={{ kind: "object", key: "old.txt", name: "old.txt", size: 1 }} onClose={() => {}} onSuccess={() => {}} onFailure={onFailure} />);
    await user.click(await screen.findByRole("button", { name: "Delete", exact: true }));
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
  });

  it("opens the transfers Sheet with a scrollable list and a named close action", async () => {
    const user = userEvent.setup();
    function DrawerHarness() {
      const [open, setOpen] = React.useState(false);
      return <TransfersDrawer transfers={[{ transferId: "t1", kind: "upload", bucket: "b", key: "folder/file.txt", loaded: 1, total: 2, status: "running" }]} isOpen={open} onToggle={() => setOpen((value) => !value)} onCancel={() => {}} />;
    }
    render(<DrawerHarness />);
    await user.click(screen.getByRole("button", { name: "Expand transfers" }));
    expect(await screen.findByRole("dialog", { name: "Transfers" })).toBeTruthy();
    const scrollContainer = screen.getByTestId("transfers-scroll-container");
    expect(scrollContainer.className).toContain("app-transfers-body");
    expect(screen.getByRole("button", { name: "Close transfers" })).toBeTruthy();
  });

  it("renders the real Sidebar connection button and its empty state", async () => {
    const userConnection = { id: "conn-1", name: "Local connection", kind: "manual", region: "us-east-1", endpoint: null, forcePathStyle: false, profile: null, accessKeyId: "AKIA", secretAccessKey: "secret", sessionToken: null };
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
});
