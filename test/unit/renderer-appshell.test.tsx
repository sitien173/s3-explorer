// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const panels = vi.hoisted(() => ({
  handle: { collapse: vi.fn(), expand: vi.fn() },
  viewerProps: null as null | { onResize: (size: { asPercentage: number }) => void },
  groupLayout: undefined as Record<string, number> | undefined,
}));

vi.mock("../../src/renderer/src/components/ui/resizable", async () => {
  const actual = await vi.importActual<typeof import("../../src/renderer/src/components/ui/resizable")>("../../src/renderer/src/components/ui/resizable");
  return {
    useDefaultLayout: actual.useDefaultLayout,
    ResizableHandle: () => null,
    ResizablePanelGroup: ({ defaultLayout, children }: any) => {
      panels.groupLayout = defaultLayout;
      return <div>{children}</div>;
    },
    ResizablePanel: ({ id, panelRef, onResize, children }: any) => {
      if (id === "viewer") {
        panels.viewerProps = { onResize };
        if (panelRef) panelRef.current = panels.handle;
      }
      return <div>{children}</div>;
    },
  };
});

import { AppShell } from "../../src/renderer/src/components/AppShell";

const shell = (viewerOpen: boolean, onViewerClose = vi.fn()) => (
  <AppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} viewer={<div>Viewer</div>} viewerOpen={viewerOpen} onViewerClose={onViewerClose} />
);

beforeEach(() => {
  localStorage.clear();
  panels.handle.collapse.mockClear();
  panels.handle.expand.mockClear();
});
afterEach(() => cleanup());

it("collapses a closed viewer in a layout effect and expands it when opened", () => {
  const order: string[] = [];
  panels.handle.collapse.mockImplementation(() => order.push("collapse"));
  function PaintProbe() {
    React.useEffect(() => { order.push("passive effect"); }, []);
    return null;
  }
  const view = render(<><PaintProbe />{shell(false)}</>);
  expect(order).toEqual(["collapse", "passive effect"]);
  view.rerender(<><PaintProbe />{shell(true)}</>);
  expect(panels.handle.expand).toHaveBeenCalledTimes(1);
});

it("closes the viewer when the user drags its panel to collapsed", () => {
  const onViewerClose = vi.fn();
  const view = render(shell(true, onViewerClose));
  panels.viewerProps?.onResize({ asPercentage: 0 });
  expect(onViewerClose).toHaveBeenCalledTimes(1);
  view.rerender(shell(false, onViewerClose));
  panels.viewerProps?.onResize({ asPercentage: 0 });
  expect(onViewerClose).toHaveBeenCalledTimes(1);
});

it("keeps the last open viewer width and seeds it when the saved layout is collapsed", () => {
  const view = render(shell(true));
  panels.viewerProps?.onResize({ asPercentage: 27 });
  panels.viewerProps?.onResize({ asPercentage: 0 });
  expect(localStorage.getItem("app-shell-last-viewer-width")).toBe("27");
  view.unmount();
  localStorage.setItem("react-resizable-panels:app-shell", JSON.stringify({ sidebar: 22, main: 78, viewer: 0 }));
  render(shell(false));
  expect(panels.groupLayout).toEqual({ sidebar: 22, main: 51, viewer: 27 });
});
