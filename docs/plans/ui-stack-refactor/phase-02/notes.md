<!-- refract-shared-version: 2.5.0 -->

# Phase 2 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-02/notes.md, fill the
heading, then append one `

## Confirmed Base UI 1.9.0 APIs

Sources: `npx ctx7@latest docs /mui/base-ui/v1.9.0` (2 commands) and type declarations under `node_modules/@base-ui/react` (version 1.9.0 confirmed in its package.json).

- `Dialog.Popup` and `AlertDialog.Popup`: `finalFocus?: boolean | RefObject<HTMLElement | null> | ((closeType: InteractionType) => boolean | void | HTMLElement | null)`; same shape for `initialFocus`. Data attributes: `data-open`, `data-closed`, `data-nested`, `data-nested-dialog-open`, `data-starting-style`, `data-ending-style`.
- Structure: `Root > Portal > (Backdrop, Popup)` as siblings. `Backdrop` takes `forceRender`. `Title`, `Description`, `Close` (`nativeButton`, `render`) exist on both Dialog and AlertDialog.
- `render?: ReactElement | ((props, state) => ReactElement)` on every part.
- `useRender({ render, ref, state, stateAttributesMapping, props, enabled, defaultTagName })` returns a `ReactElement`. Types: `useRender.ComponentProps<"button">` adds `render`. Imported from `@base-ui/react/use-render`.
- `ContextMenu` parts: `Root` (accepts `open`, `onOpenChange(open, details)`), `Trigger`, `Portal`, `Positioner`, `Popup`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `SubmenuRoot`, `SubmenuTrigger`, `Separator`. `Item` takes `onClick`, `closeOnClick`, `disabled`, `label`. There is no `SubContent` part.
- `Tooltip` parts: `Provider` (`delay`, `closeDelay`, `timeout`), `Root`, `Trigger` (`render`, `delay`, `closeDelay`, `closeOnClick`, `disabled`), `Portal`, `Positioner`, `Popup`, `Arrow`, `Viewport`. Trigger data attributes: `data-popup-open`, `data-trigger-disabled`.
- ctx7 did not return the ContextMenu Positioner or Item props; those were read from `.d.ts` files.

## Task 1

### Decisions made
- `@base-ui/react@1.9.0` was already pinned exactly in `package.json` and the lockfile by the previous worker. Verified: installed `node_modules/@base-ui/react/package.json` reports 1.9.0. `pnpm-workspace.yaml` is unchanged, so no `minimumReleaseAgeExclude` entries were added.
- `Button` uses `useRender` with `defaultTagName: "button"` and forwards `ref` explicitly (React 19 passes `ref` as a prop).
- Dialog, AlertDialog, and Sheet keep the `tds-dialog` wrapper div inside the Portal. Backdrop is `absolute inset-0` and Popup is `relative`, so they are siblings and the wrapper flex layout centers or edge-aligns the Popup. The alignment and padding that `.tds-dialog--* .tds-dialog__backdrop` applied now come from Tailwind utilities on the wrapper (`items-center justify-center p-6` for the dialogs; per-side utilities in `sheet.tsx`), because the CSS files may change selectors only. `p-6` equals 24px; `--spacing-24` is rejected by `renderer-tokens.test.ts` in TSX.
- The TDS CSS contains no Radix `data-state` selectors (the open look is static `tds-dialog--open` classes), so no CSS file changed.
- `Dialog.Close` and `SheetClose` render `Button` through `render={<Button .../>}`.

### Spec deviations
- none

### Tradeoffs accepted
- `ContextMenuSubContent` is not exported anymore, because Base UI has no such part. It had no callers. Other unused wrapper exports map to `SubmenuRoot`, `SubmenuTrigger`, and so on under their old names.
- Initial focus inside AlertDialog follows Base UI (first tabbable), not Radix (Cancel). No test depended on it.

### Assumptions
- Visual output is unchanged. Not checked in a browser; the Coordinator's e2e run is the only rendering check.

### Follow-ups for human
- Check the dialog, sheet, and tooltip look once in a real window.

### Test evidence
- RED -> GREEN:
  - RED: n/a, behavior-preserving port covered by existing characterization tests.
  - GREEN: `pnpm typecheck` -> exit 0. After the port the suite showed 4 failures, all fixed in Tasks 2 and 3 (see below), and a `renderer-tokens` failure for `--spacing-24`, fixed by `p-6`.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Both module-level `focusin` trackers are deleted. A shared `useFinalFocus(isOpen)` hook in `ui/dialog.tsx` (imported by `ui/alert-dialog.tsx`) records `document.activeElement` in a layout effect when `isOpen` turns true. The `finalFocus` function it returns gives that element when it is connected, not `document.body`, and not disabled. Otherwise it returns `document.querySelector('[role="grid"]')`.
- Sheet keeps Base UI default focus return; the Transfers button is a stable opener.

### Spec deviations
- none

### Tradeoffs accepted
- The grid fallback uses a document-level `[role="grid"]` query, so it assumes one grid on screen.

### Assumptions
- The opener is the focused element when the dialog opens. From a context-menu item that element is unmounted at close, so the grid fallback applies.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2` after the port with the test still `it.fails` -> `Error: Expect test to fail` in `renderer-dialogs.test.tsx` (the focus test already passed, proving the behavior is fixed).
  - GREEN: `pnpm test --maxWorkers=2 test/unit/renderer-dialogs.test.tsx` -> 23 passed. The Phase 1 test is plain `it` with `{ timeout: 15000 }` and restores the `clientHeight` and `clientWidth` descriptors in `try/finally`. New test: "returns focus to the grid when the opener is unmounted while the dialog is open".
- Root cause (bugfix only): none

## Task 3

### Decisions made
- `asChild` became `render` on `TooltipTrigger`, `SheetClose`, and `ContextMenuTrigger`. `onSelect` became `onClick` on every `ContextMenuItem`.
- `ContextMenuTrigger` in `ObjectTable.tsx` now takes the grid props (`role="grid"`, `tabIndex`, `onKeyDown`, `onContextMenu`, `className`) directly and renders the grid div itself. The Sidebar bucket row uses `render={<div .../>}` with the row children passed as Trigger children.
- Context-menu row state stays in React state (`contextRow`, `contextOpen`). The Shift+F10 and ContextMenu key path still dispatches a synthetic `contextmenu` event and works unchanged.
- `TooltipContent` adds `role="tooltip"` to `Tooltip.Popup`, because Base UI 1.9.0 does not set that role and `renderer-shell.test.tsx` and the accessible-role invariant need it.

### Spec deviations
- none

### Tradeoffs accepted
- Base UI positions the context menu a few pixels up and left of the pointer, so the locator in `renderer-object-table.test.tsx` changed from `translate(12Xpx, 80px)` to `translate(12Xpx, (75-80)px)`. The wrapper is now the Positioner, which is still `menu.parentElement`.

### Assumptions
- none

### Follow-ups for human
- `test/unit/transfers.test.ts` failed once in a full parallel run with `ReferenceError: window is not defined` and passed in the next full run and alone. It touches no changed file. Treat as a pre-existing load flake.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2` -> `exposes the toolbar actions...: Unable to find an accessible element with the role "tooltip"` and `anchors context menu...: expected 'position: fixed; ... transform: translate(122px, 75px);' to match /transform:\s*translate\(12\dpx,\s*80px\)/`.
  - GREEN: `pnpm test --maxWorkers=2 test/unit/renderer-shell.test.tsx test/unit/transfers.test.ts` -> 43 passed; `renderer-object-table.test.tsx` passes with the updated locator.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- `pnpm remove radix-ui` removed `radix-ui` 1.8.1 and 69 packages. `pnpm-workspace.yaml` is unchanged.

### Spec deviations
- none

### Tradeoffs accepted
- The test title "ConnectionDialog preserves e2e labels and buttons and Radix keyboard behavior" still says Radix. Left alone to keep the diff on request.

### Assumptions
- none

### Follow-ups for human
- Coordinator runs `xvfb-run -a pnpm e2e`. No e2e locator was changed. Context-menu and dialog locators in `e2e/app.spec.ts` rely on roles and names, which are preserved.

### Test evidence
- RED -> GREEN:
  - RED: n/a, removal of a dependency with no importers.
  - GREEN: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test --maxWorkers=2` -> 31 files, 741 passed, 0 failed, 0 expected fails; `pnpm build` exit 0; `grep -rn "radix-ui" src package.json` and `grep -rn "asChild\|onCloseAutoFocus" src/renderer` print nothing.
- Root cause (bugfix only): none

## Task FIX-1

### Decisions made
- `useFinalFocus` now restores to the opener only when `canRefocus` passes: connected, not `document.body`, not `:disabled` (covers disabled ancestor fieldsets), not inside `[inert]` or `[hidden]`, computed `visibility` not `hidden`, and no ancestor with computed `display: none`. Otherwise it returns `[role="grid"]`.
- `Sheet` is now a wrapper over `Dialog.Root` that calls `useFinalFocus(Boolean(open))` and passes the result to `SheetContent` through context, which sets `finalFocus` on the Popup.
- The old single detached-opener test is replaced by a `describe.each` over Dialog, AlertDialog, and Sheet. Each case opens the modal, asserts focus is inside it, changes the opener in a separate `act` update, closes with Escape, and asserts the grid is focused. Cases: unmounted, hidden, inert, disabled ancestor fieldset.

### Spec deviations
- none

### Tradeoffs accepted
- `Sheet` reads open state from the `open` prop only. Uncontrolled `defaultOpen` use would not record an opener. The only caller, `TransfersDrawer`, is controlled.
- The display check walks ancestors with `getComputedStyle`, because jsdom has no layout and `getClientRects` is unreliable there.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: with `canRefocus` temporarily replaced by the old check, `pnpm test --maxWorkers=2 test/unit/renderer-dialogs.test.tsx` -> 9 failed (hidden, inert, and disabled-fieldset cases for Dialog, AlertDialog, and Sheet), 25 passed. Code restored afterwards.
  - GREEN: `pnpm test --maxWorkers=2` -> 31 files, 752 passed, 0 failed. `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm build` exit 0.
- Root cause (bugfix only): the old check read only the opener's own `disabled` property and `isConnected`, so a connected opener that was hidden, inert, or disabled by an ancestor passed the check and `focus()` silently did nothing. The earlier detached test removed the opener in the same update that opened the dialog, so it only exercised the `document.body` fallback.
