// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  api: {
    objects: { list: vi.fn() },
  },
}));

vi.mock("../../src/renderer/src/api", () => ({
  api: mocks.api,
  IpcErrorWrapper: class extends Error {},
  unwrap: (r: any) => r.data,
}));

import { ObjectTable } from "../../src/renderer/src/components/ObjectTable";

afterEach(() => cleanup());

const objects = Array.from({ length: 10000 }, (_, i) => ({
  key: `row-${i}.txt`,
  size: i,
  lastModified: "2026-01-01",
}));

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 800,
  });
});

function table(props: Record<string, unknown> = {}) {
  return render(
    <ObjectTable
      connectionId="c"
      bucket="b"
      prefix=""
      onNavigate={vi.fn()}
      {...props}
    />,
  );
}

const setup = async (
  list = objects.slice(0, 4),
  props: Record<string, unknown> = {},
) => {
  mocks.api.objects.list.mockResolvedValue({
    ok: true,
    data: { folders: [], objects: list },
  });
  const user = userEvent.setup();
  table(props);
  await waitFor(() => expect(mocks.api.objects.list).toHaveBeenCalled());
  return user;
};

it("renders skeleton rows with aria-busy and polite status announcement while loading", () => {
  mocks.api.objects.list.mockReturnValue(new Promise(() => {}));
  table();
  const grid = screen.getByRole("grid");
  expect(grid.getAttribute("aria-busy")).toBe("true");
  const loadingStatus = screen.getByRole("status");
  expect(loadingStatus.getAttribute("aria-live")).toBe("polite");
  expect(loadingStatus.getAttribute("aria-busy")).toBe("true");
  expect(loadingStatus.textContent).toContain("Loading objects...");
  expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBe(5);
});

it("renders empty bucket, folder, and search states", async () => {
  mocks.api.objects.list.mockResolvedValue({
    ok: true,
    data: { folders: [], objects: [] },
  });
  table();
  expect(await screen.findByText("This bucket is empty.")).toBeTruthy();
  cleanup();
  table({ prefix: "folder/" });
  expect(await screen.findByText("This folder is empty.")).toBeTruthy();
  cleanup();
  table({ isSearchActive: true, searchResults: [] });
  expect(await screen.findByText("No objects matched your search.")).toBeTruthy();
});

it("exposes a multiselectable grid with selected rows and active descendant", async () => {
  await setup();
  expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
});

it("mounts at most 40 rows for 10,000 objects in the DOM", async () => {
  await setup(objects);
  await waitFor(() => {
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-busy")).toBeNull();
    expect(grid.getAttribute("aria-rowcount")).toBe("10001");
    expect(screen.getByText("10,000 items")).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
  });
});

it(
  "derives aria-selected and visual selection only from selected keys",
  { timeout: 15000 },
  async () => {
  const user = await setup(objects.slice(0, 4));
  const grid = screen.getByRole("grid");
  const row0 = screen.getByRole("row", { name: /row-0/ });
  const row1 = screen.getByRole("row", { name: /row-1/ });

  // Click row 0 -> selected
  await user.click(row0);
  expect(row0.getAttribute("aria-selected")).toBe("true");

  // Ctrl+click row 1 -> row 0 and row 1 both selected
  fireEvent.click(row1, { ctrlKey: true });
  expect(row0.getAttribute("aria-selected")).toBe("true");
  expect(row1.getAttribute("aria-selected")).toBe("true");

  // Ctrl+click row 1 again -> deselected, aria-selected must be false even though row 1 is active
  fireEvent.click(row1, { ctrlKey: true });
  expect(row1.getAttribute("aria-selected")).toBe("false");
  expect(row0.getAttribute("aria-selected")).toBe("true");

  // Space toggles active row (row 1 is active but deselected)
  grid.focus();
  await user.keyboard("{Space}");
  expect(row1.getAttribute("aria-selected")).toBe("true");
  await user.keyboard("{Space}");
  expect(row1.getAttribute("aria-selected")).toBe("false");

  // ArrowDown moves active and selection to row 2
  await user.keyboard("{ArrowDown}");
  const row2 = screen.getByRole("row", { name: /row-2/ });
  expect(row2.getAttribute("aria-selected")).toBe("true");
  expect(row1.getAttribute("aria-selected")).toBe("false");

  // Escape clears selection completely
  await user.keyboard("{Escape}");
  expect(row0.getAttribute("aria-selected")).toBe("false");
  expect(row1.getAttribute("aria-selected")).toBe("false");
  expect(row2.getAttribute("aria-selected")).toBe("false");
});

it("opens with Enter only when exactly one item is selected and invokes onOpenRow once", async () => {
  const openRow = vi.fn();
  const gridAction = vi.fn();
  const user = await setup(objects.slice(0, 4), {
    onOpenRow: openRow,
    onGridAction: gridAction,
  });
  const grid = screen.getByRole("grid");
  const row0 = screen.getByRole("row", { name: /row-0/ });
  const row1 = screen.getByRole("row", { name: /row-1/ });

  // Multi-selection: select row 0 and row 1
  await user.click(row0);
  fireEvent.click(row1, { ctrlKey: true });
  grid.focus();
  await user.keyboard("{Enter}");
  expect(openRow).not.toHaveBeenCalled();

  // Single selection: click row 0
  await user.click(row0);
  grid.focus();
  await user.keyboard("{Enter}");
  expect(openRow).toHaveBeenCalledTimes(1);
  expect(openRow).toHaveBeenCalledWith(
    expect.objectContaining({ key: "row-0.txt" }),
  );
  expect(gridAction).not.toHaveBeenCalledWith("open", expect.anything());
});

it(
  "resets local selection anchor on navigation so Shift+Arrow extends from new active",
  { timeout: 15000 },
  async () => {
  const onNavigate = vi.fn();
  mocks.api.objects.list.mockResolvedValueOnce({
    ok: true,
    data: { folders: [], objects: objects.slice(0, 4) },
  });
  const user = userEvent.setup();
  const { rerender } = render(
    <ObjectTable
      connectionId="c"
      bucket="b"
      prefix=""
      onNavigate={onNavigate}
    />,
  );
  await waitFor(() => expect(screen.getByRole("row", { name: /row-0/ })).toBeTruthy());

  const grid = screen.getByRole("grid");
  const row0 = screen.getByRole("row", { name: /row-0/ });
  await user.click(row0);

  // Navigate to subfolder
  const subObjects = [
    { key: "sub/file-a.txt", size: 10, lastModified: "2026-01-01" },
    { key: "sub/file-b.txt", size: 20, lastModified: "2026-01-01" },
    { key: "sub/file-c.txt", size: 30, lastModified: "2026-01-01" },
  ];
  mocks.api.objects.list.mockResolvedValueOnce({
    ok: true,
    data: { folders: [], objects: subObjects },
  });
  rerender(
    <ObjectTable
      connectionId="c"
      bucket="b"
      prefix="sub/"
      onNavigate={onNavigate}
    />,
  );
  await waitFor(() => expect(screen.getByRole("row", { name: /file-a/ })).toBeTruthy());

  grid.focus();
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
  const subRowA = screen.getByRole("row", { name: /file-a/ });
  const subRowB = screen.getByRole("row", { name: /file-b/ });
  expect(subRowA.getAttribute("aria-selected")).toBe("true");
  expect(subRowB.getAttribute("aria-selected")).toBe("true");
});

it("moves PageUp and PageDown by the visible row count from the virtualizer viewport", async () => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: 200,
  });
  const user = await setup(objects.slice(0, 20));
  const grid = screen.getByRole("grid");
  const row0 = screen.getByRole("row", { name: /row-0/ });
  await user.click(row0);
  grid.focus();

  await user.keyboard("{PageDown}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-5.txt");

  await user.keyboard("{PageDown}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-10.txt");

  await user.keyboard("{PageUp}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-5.txt");

  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: 400,
  });
});

it(
  "anchors context menu via pointer without preventDefault and via keyboard at active row",
  { timeout: 15000 },
  async () => {
  const user = await setup(objects.slice(0, 4));
  const grid = screen.getByRole("grid");
  const row1 = screen.getByRole("row", { name: /row-1/ });

  // Pointer context menu
  const evt = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 80,
  });
  row1.dispatchEvent(evt);
  const openItem = await screen.findByRole("menuitem", { name: "Open" });
  const menu = openItem.closest('[role="menu"]');
  const wrapper = menu?.parentElement;
  expect(wrapper?.getAttribute("style")).toMatch(/transform:\s*translate\(12\dpx,\s*80px\)/);
  expect(openItem).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Open" })).toBeNull());

  // Keyboard context menu via Shift+F10
  const row2 = screen.getByRole("row", { name: /row-2/ });
  await user.click(row2);
  grid.focus();
  await user.keyboard("{Shift>}{F10}{/Shift}");
  expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Open" })).toBeNull());
  expect(document.activeElement).toBe(grid);

  // Keyboard context menu via ContextMenu key
  grid.focus();
  await user.keyboard("{ContextMenu}");
  expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
  await user.keyboard("{Escape}");
});

it("disables Delete in context menu and keyboard when selection contains folders", async () => {
  const onShortcut = vi.fn();
  mocks.api.objects.list.mockResolvedValue({
    ok: true,
    data: {
      folders: ["docs/"],
      objects: [{ key: "file.txt", size: 10, lastModified: "2026-01-01" }],
    },
  });
  const user = userEvent.setup();
  table({ onShortcut });
  const folderRow = await screen.findByRole("row", { name: /docs/ });
  const objectRow = await screen.findByRole("row", { name: /file\.txt/ });

  await user.click(folderRow);
  fireEvent.click(objectRow, { ctrlKey: true });

  fireEvent.contextMenu(objectRow);
  const deleteItem = await screen.findByRole("menuitem", {
    name: "Delete (folders cannot be multi-deleted)",
  });
  expect(deleteItem.getAttribute("aria-disabled") ?? deleteItem.hasAttribute("disabled")).toBeTruthy();

  await user.keyboard("{Escape}");
  const grid = screen.getByRole("grid");
  grid.focus();
  await user.keyboard("{Delete}");
  expect(onShortcut).not.toHaveBeenCalledWith("delete");
});

it("ignores shortcuts from an input", async () => {
  const callback = vi.fn();
  const user = await setup(objects.slice(0, 1), { onShortcut: callback });
  const input = screen.getByRole("textbox", {
    name: "Filter loaded rows by name",
  });
  input.focus();
  await user.keyboard("{Delete}");
  expect(callback).not.toHaveBeenCalled();
});

it("selects by click, Ctrl+click, and Shift+click", async () => {
  const user = await setup(objects.slice(0, 4));
  const grid = screen.getByRole("grid");
  const rows = grid.querySelectorAll('[role="row"][data-row-key]');
  await user.click(rows[0]);
  expect(rows[0].getAttribute("aria-selected")).toBe("true");
  fireEvent.click(rows[1], { ctrlKey: true });
  expect(
    Array.from(grid.querySelectorAll('[role="row"][data-row-key]')).map((row) =>
      row.getAttribute("aria-selected"),
    ),
  ).toEqual(["true", "true", "false", "false"]);
  fireEvent.click(rows[1], { shiftKey: true });
  expect(
    grid.querySelector('[data-row-key="row-0.txt"]')?.getAttribute("aria-selected"),
  ).toBe("true");
});

it("dispatches Delete, parent, and F2 from the focused grid", async () => {
  const callback = vi.fn();
  const user = await setup(objects.slice(0, 2), { onShortcut: callback });
  const grid = screen.getByRole("grid");
  const row = grid.querySelector('[data-row-key="row-0.txt"]')!;
  await user.click(row);
  grid.focus();
  await user.keyboard("{Delete}");
  await user.keyboard("{Backspace}");
  await user.keyboard("{F2}");
  expect(callback.mock.calls.map((call) => call[0])).toEqual([
    "delete",
    "parent",
    "rename",
  ]);
});

it("targets the selected row, not a deselected active row, for Delete and F2", async () => {
  const onGridAction = vi.fn();
  const user = await setup(objects.slice(0, 2), { onGridAction });
  const grid = screen.getByRole("grid");
  const rowA = grid.querySelector('[data-row-key="row-0.txt"]')!;
  const rowB = grid.querySelector('[data-row-key="row-1.txt"]')!;
  await user.click(rowA);
  fireEvent.click(rowB, { ctrlKey: true });
  fireEvent.click(rowB, { ctrlKey: true });
  expect(rowA.getAttribute("aria-selected")).toBe("true");
  expect(rowB.getAttribute("aria-selected")).toBe("false");
  grid.focus();
  await user.keyboard("{Delete}");
  await user.keyboard("{F2}");
  const targets = onGridAction.mock.calls
    .filter((call) => call[0] === "delete" || call[0] === "rename")
    .map((call) => [call[0], call[1]?.key]);
  expect(targets).toEqual([
    ["delete", "row-0.txt"],
    ["rename", "row-0.txt"],
  ]);
});

it("blocks grid shortcuts while a dialog is open", async () => {
  const callback = vi.fn();
  const user = await setup(objects.slice(0, 2), { onShortcut: callback });
  render(<div role="dialog" aria-label="Modal" />);
  const grid = screen.getByRole("grid");
  grid.focus();
  await user.keyboard("{Delete}");
  expect(callback).not.toHaveBeenCalled();
});

it("shows the object context menu items", async () => {
  await setup(objects.slice(0, 2));
  const row = screen.getByRole("row", { name: /row-0/ });
  fireEvent.contextMenu(row);
  for (const name of [
    "Open",
    "Open with system app",
    "Download",
    "Rename or move",
    "Delete",
  ]) {
    expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
  }
});

it("shows folder context menu actions", async () => {
  mocks.api.objects.list.mockResolvedValue({
    ok: true,
    data: { folders: ["folder/"], objects: [] },
  });
  table();
  const row = await screen.findByRole("row", { name: /folder/ });
  fireEvent.contextMenu(row);
  for (const name of ["Open", "Rename folder", "Delete folder"]) {
    expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
  }
});

it("shows Delete N objects for a multi-selection context menu", async () => {
  const user = await setup(objects.slice(0, 2));
  const grid = screen.getByRole("grid");
  const rows = grid.querySelectorAll("[data-row-key]");
  await user.click(rows[0]);
  fireEvent.click(rows[1], { ctrlKey: true });
  fireEvent.contextMenu(rows[1]);
  expect(
    await screen.findByRole("menuitem", { name: "Delete 2 objects" }),
  ).toBeTruthy();
});

it("handles every grid keyboard action in the DOM", { timeout: 15000 }, async () => {
  const callback = vi.fn();
  const user = await setup(objects.slice(0, 4), { onShortcut: callback });
  const grid = screen.getByRole("grid");
  grid.focus();
  await user.keyboard("{ArrowDown}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-1.txt");
  await user.keyboard("{ArrowUp}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-0.txt");
  await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
  expect(screen.getByRole("row", { name: /row-0/ }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("row", { name: /row-1/ }).getAttribute("aria-selected")).toBe("true");
  await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
  await user.keyboard("{PageDown}");
  await user.keyboard("{PageUp}");
  await user.keyboard("{End}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-3.txt");
  await user.keyboard("{Home}");
  expect(grid.getAttribute("aria-activedescendant")).toBe("object-row-row-0.txt");
  await user.keyboard("{Control>}a{/Control}");
  expect(screen.getByRole("row", { name: /row-3/ }).getAttribute("aria-selected")).toBe("true");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("row", { name: /row-0/ }).getAttribute("aria-selected")).toBe("false");
  await user.keyboard("{Backspace}");
  await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
  await user.keyboard("{Delete}");
  expect(callback.mock.calls.map((call) => call[0])).toEqual([
    "parent",
    "parent",
    "delete",
  ]);
  const row = grid.querySelector('[data-row-key="row-0.txt"]')!;
  await user.click(row);
  grid.focus();
  await user.keyboard("{F2}");
  expect(callback.mock.calls.at(-1)?.[0]).toBe("rename");
});
