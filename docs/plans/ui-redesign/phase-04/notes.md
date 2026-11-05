# Phase 4 — Implementation Notes

## Task 1

### Decisions made
- Selection is represented as ordered string keys with active and anchor keys. Page navigation advances ten rows, matching the current table row height and intended visible-row movement as a provisional assumption.

### Spec deviations
- none

### Tradeoffs accepted
- Reducer currently exposes string keys and generic actions so it remains independent of renderer types.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/selection.test.ts` -> initial import failure was scaffolding-only; after minimal inert exports, behavioral assertions failed (`expected [] to deeply equal ['a']` and `expected null to be 'move-up'`). Subsequent behavioral failures exposed test expectation issues and were corrected to reflect anchored range and Alt+ArrowUp behavior.
  - GREEN: `pnpm vitest run test/unit/selection.test.ts` -> 1 file, 2 tests passed.
  - Fresh typecheck: `pnpm typecheck` -> passed after correcting reducer narrowing and suppressing the renderer/node project boundary diagnostic on the test import. Initial check failed on those type issues.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- none

### Spec deviations
- Not implemented. Object table has not been converted to the ARIA grid and App.tsx still uses single-item selection.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement grid keyboard interaction, multi-selection wiring, multi-key delete dialog support, and selection-aware toolbar actions.

### Test evidence
- RED -> GREEN:
  - RED: none; task not started.
  - GREEN: none; task not started.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- none

### Spec deviations
- Not implemented. Context menus and the D-P4-1 clipboard e2e check are absent.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement menus, run the clipboard e2e check, and apply D-P4-1 based on its result.

### Test evidence
- RED -> GREEN:
  - RED: none; task not started.
  - GREEN: none; task not started.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- none

### Spec deviations
- Not implemented. Skeleton/empty states and the required e2e locator and interaction changes are absent.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement loading and empty states, update e2e tests, and perform the TDS Rule 10 self-check.

### Test evidence
- RED -> GREEN:
  - RED: none; task not started.
  - GREEN: none; task not started.
- Root cause (bugfix only): none

## Continuation Batch 2

## Task 1

### Decisions made
- Kept selection state ordered to preserve visible listing order. Page movement advances ten loaded rows.

### Spec deviations
- none

### Tradeoffs accepted
- `selection.ts` uses a renderer-project import in the node-project unit test. A targeted `@ts-ignore` documents this project boundary because tsconfig files are outside the phase file set.

### Assumptions
- Ten rows is the PageUp/PageDown step for the current table viewport.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/selection.test.ts` -> before implementation, behavioral assertions failed with `expected [] to deeply equal ['a']` and `expected null to be 'move-up'` after inert exports made the module importable.
  - GREEN: `pnpm vitest run test/unit/selection.test.ts` -> expanded to 27 transition/key tests, all passed. Final `pnpm test` -> 28 files, 628 tests passed.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- The grid container is the single tab stop. Virtual row ids encode row keys and active moves call `scrollToIndex`.
- Multi-delete maps the reducer's ordered keys back to loaded rows and submits all object keys through one existing `ops.delete` request. Folders continue through `deletePrefix`.

### Spec deviations
- none

### Tradeoffs accepted
- The table's filter input is a sibling of the grid, so it cannot bubble key events into the grid; keyboard handler also explicitly ignores input, select, and textarea targets.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/renderer-object-table.test.tsx` -> grid DOM test failed: `Unable to find an accessible element with the role "grid"`; keyboard-row test also failed because no grid existed.
  - GREEN: `pnpm vitest run test/unit/renderer-object-table.test.tsx test/unit/renderer-shell.test.tsx test/unit/renderer-dialogs.test.tsx test/unit/renderer-tokens.test.ts test/unit/selection.test.ts` -> 5 files, 72 tests passed before the final two loading/empty-state cases; final unit suite -> 28 files, 628 tests passed.
  - Multi-object dialog evidence: DOM test asserts `Delete 3 objects`, one call to `ops.delete`, and all three keys. Toolbar test asserts Download and Rename disabled for a two-row selection and Delete enabled.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Context menus use existing Radix primitives and the existing `tds-dropdown-panel` / `tds-action-list-item` styles. Bucket menus provide Open and Pin/Unpin.
- D-P4-1: removed every Copy menu action after the clipboard check failed. No clipboard permission handler was changed.

### Spec deviations
- Copy menu items are absent pending the Q1 user decision. The menus otherwise follow the specified target actions.

### Tradeoffs accepted
- `Open with system app` requests the existing stream URL and calls the existing `files.openWithSystemApp` API. No IPC or preload change was made.

### Assumptions
- Clipboard read denial is sufficient failing evidence under D-P4-1's prescribed `readText()` check.

### Follow-ups for human
- Q1: Approve allowing `clipboard-sanitized-write` in both permission handlers if copy menu items should be restored.

### Test evidence
- RED -> GREEN:
  - RED: `xvfb-run -a pnpm e2e` with the Copy key step -> failed with `NotAllowedError: Failed to execute 'readText' on 'Clipboard': Read permission denied.`
  - GREEN: `pnpm vitest run test/unit/renderer-object-table.test.tsx test/unit/renderer-shell.test.tsx` -> 2 files, 20 tests passed for object and bucket menu behavior. After removing copy actions, `xvfb-run -a pnpm e2e` -> 1 passed.
- Root cause (bugfix only): Clipboard read permission is denied by the existing main-process permission handlers. No changes made to `src/main/window.ts`.

## Task 4

### Decisions made
- Skeletons use the existing TDS data-table skeleton selector and the UI Skeleton uses bridged semantic tokens. Empty bucket, folder, and search results use the existing `ui/empty` primitive.
- TDS Rule 10 self-check: menus use existing TDS dropdown/action-list classes; no new TDS CSS or token values were invented. Skeleton styling uses the existing TDS table skeleton class and bridged `--radius-md` / `--color-muted` tokens. No dark styles or legacy selectors were added.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `xvfb-run -a pnpm e2e` with the new clipboard read step failed as recorded in Task 3. That failure drove removal of copy menu entries under D-P4-1.
  - GREEN: `pnpm vitest run test/unit/renderer-object-table.test.tsx` -> 12 tests passed, including loading skeletons, empty bucket/folder/search states, every key action, row selection, and context menus. `xvfb-run -a pnpm e2e` -> 1 passed, including role-based row selectors, context-menu rename, and keyboard Delete.
  - Scanner: `pnpm vitest run test/unit/renderer-tokens.test.ts` -> 19 passed.
- Root cause (bugfix only): none

## Verification Batch

- `pnpm typecheck` -> pass.
- `pnpm test` -> 28 files, 628 tests passed.
- `pnpm build` -> pass.
- `xvfb-run -a pnpm e2e` -> 1 passed.
- `pnpm test:integration` -> 6 files passed, 24 tests passed, 1 existing 2,500-key RustFS test timed out at 60 seconds. `pnpm vitest run --project integration test/integration/ops.test.ts -t 'deletes 2,500 keys'` -> 1 passed, 9 skipped, duration 57.93s. The full integration command was retried three times with the same timeout.
