<!-- refract-shared-version: 2.5.0 -->

# Phase 2 — Decision Notes

<!-- Worker appends one `## Task <M>` block per task using /home/ngosi/projects/refract/plugin/shared/notes-template.md. -->

## Task 1

### Decisions made
- Dialogs call `api.buckets.*` directly and branch on `res.ok`; `ok: false` shows `error.message` inline. A thrown error calls `notify(buildOperationFailedToast(...))` and keeps the dialog open.
- A ref guard (`busyRef`) plus disabled submit enforces one request on a double submit.
- `DeleteBucketDialog` snapshots connection and bucket in state on the `open` false to true transition only.

### Spec deviations
- none

### Tradeoffs accepted
- `react-hooks/exhaustive-deps` is disabled on the one effect in `DeleteBucketDialog` so prop changes while open do not retarget.

### Assumptions
- Dialog titles: "New bucket" and "Delete bucket". Create submit button: "Create bucket".

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-dialogs.test.tsx` with inert dialogs that render null -> `9 failed | 10 passed`; `Unable to find a label with the text of: Bucket name (required)` and `Unable to find an accessible element with the role "alertdialog" and name "Delete bucket"`.
  - GREEN: same command after implementation -> `19 passed (19)`.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Added `"warning"` to `ToastDescriptor.type` and a `toast.warning` case in `notify` in `src/renderer/src/toasts.ts`, because the spec requires a warning toast and `notify` had no warning type. Allowlist entries "Create bucket" and "Delete bucket" added.
- "New bucket" button sits at the top of the selected connection details, so it shows for empty lists and IAM-denied listings.
- After create or delete, the sidebar calls `loadBuckets(connectionId)` for the selected connection.

### Spec deviations
- `toasts.ts` change goes beyond the allowlist edit named in the file table (warning type). Needed for the required warning toast.

### Tradeoffs accepted
- none

### Assumptions
- `onBucketDeleted` is a required Sidebar prop; `sidebarProps` in the shell test gained a stub.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx` before Sidebar changes -> `5 failed | 13 passed`; `Unable to find role="button" and name "New bucket"`, `Unable to find role="menuitem" and name "Delete bucket"`.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx test/unit/renderer-dialogs.test.tsx` -> `37 passed (37)` after one test fix (`hidden: true` query because the open alertdialog hides the list from the accessibility tree).
- Root cause (bugfix only): none

## Task 3

### Decisions made
- `handleBucketDeleted` in `App.tsx` calls `handleSelectConnection(connId)` when both ids match the selection. That clears bucket, prefix, item, search results, search flag, and viewer target, and keeps the connection selected.
- App test mocks Sidebar, ObjectTable, SearchBar, and Toolbar and drives `onBucketDeleted` directly.

### Spec deviations
- none

### Tradeoffs accepted
- `searchResults`, `isSearchActive`, and `viewerTarget` clearing is verified through reuse of `handleSelectConnection`, not asserted individually.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx` -> `Unable to find an element with the text: No bucket selected` and `TypeError: onBucketDeleted is not a function`.
  - GREEN: `pnpm test` -> `Test Files 31 passed (31)`, `Tests 734 passed (734)`.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- README line lists "Delete bucket" and the "New bucket" button. Three unchecked manual AWS items added to `docs/manual-checklist.md`.

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
  - RED: n/a, docs only.
  - GREEN: `pnpm typecheck` exit 0; `pnpm test` 31 files, 734 passed; `pnpm build` exit 0; `xvfb-run -a pnpm e2e` 1 passed; `git diff --stat refs/plans/bucket-crud/phase-02/base -- src/main src/shared src/preload src/renderer/src/components/AddBucketDialog.tsx` prints nothing.
- Root cause (bugfix only): none

## FIX 1

### Decisions made
- Both dialogs gained `requestClose`, which ignores Escape, overlay, dismiss, and Cancel while `busyRef` is set. Close works again after the request settles.
- Focus test failed without code change, so `Sidebar.tsx` now tags each bucket name button with `data-bucket`, and on delete-dialog close focuses that button after a `setTimeout(0)` (after the dialog's own restore to the unmounted menu item). After a successful delete (`deletedRef`), focus goes to the "New bucket" button.

### Spec deviations
- none

### Tradeoffs accepted
- Focus restore uses a zero-delay timeout to run after `ui/alert-dialog.tsx` restore; `ui/*` was not changed.

### Assumptions
- Bucket "trigger" for focus is the bucket name button inside the row.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-dialogs.test.tsx test/unit/renderer-shell.test.tsx` -> `3 failed | 37 passed`; `expected "vi.fn()" to not be called at all, but actually been called 1 times` (Create), `... 2 times` (Delete), and `expected false to be true` (focus restore).
  - GREEN: same command -> `40 passed (40)`; full: `pnpm typecheck` exit 0, `pnpm test` 31 files 737 passed, `pnpm build` exit 0, `xvfb-run -a pnpm e2e` 1 passed. Forbidden-path diff (main, shared, preload, AddBucketDialog, ui) empty.
- Root cause (bugfix only): close handlers called `onOpenChange(false)` regardless of `busy`; focus target was the unmounted menu item.
