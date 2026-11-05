<!-- refract-shared-version: 2.4.0 -->

# Phase 5 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-redesign/phase-05/notes.md, fill the
heading, then append one `## Task <M>` block per task (and additional batch
sections on resumed `FIX:` rounds). Keep the file; never overwrite earlier task
blocks. Empty sub-sections = `- none`. Every task gets a block even if all
`none`.
-->

## Task 1

### Decisions made
- Sanitizer `sanitizeToastText` scrubs AWS access keys, presigned URL query tokens, and Windows/Unix filesystem root paths, while preserving standard S3 keys.
- `toasts.ts` exposes named builder functions, a `toastBuilders` map object, and `notify` (pure wrapper function plus convenience dispatchers).

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- Dynamic import is used in `test/unit/renderer-toasts.test.ts` to cleanly satisfy TypeScript composite project boundary checks between `tsconfig.node.json` and `tsconfig.web.json`.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/renderer-toasts.test.ts` -> `AssertionError: expected '' to contain 'sunset.jpg'` (9 failed, 1 passed of 10 tests)
  - GREEN: `pnpm vitest run test/unit/renderer-toasts.test.ts` -> `Test Files 1 passed (1), Tests 10 passed (10)`
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Added `src/renderer/src/components/ui/sonner.tsx` wrapping `sonner` with TDS semantic surfaces (`--surface-neutral-01`, `--text-default`, `--border-subtle`, `--radius-modal`).
- Moved five one-shot operation errors from `setAppError` Alerts to toasts via `notify.operationFailed`:
  - `Failed to upload file` (in `handleUpload`)
  - `Failed to upload files` (in `handleUploadPaths`)
  - `Failed to open object` (in `handleOpenWithSystemApp`)
  - `Failed to download object` (in `handleDownload`)
  - `Failed to cancel transfer` (in `handleCancelTransfer`)
- Replaced the inline rejected upload count banner in `App.tsx` with `notify.rejectedUploads(data.rejectedCount)`.
- Wired transfer done / failed events in `api.transfers.onDone` per D-P5-2 (cancelled transfers raise no toast).
- Wired rename and delete successes and partial failures per D-P5-1, passing reopen callbacks to `notify.partialFailure`.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- Persistent session-only storage warning remains an `Alert` element at the top of the main pane.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/renderer-toasts-dom.test.tsx` -> verified DOM tests against Toaster and OperationReport reopening.
  - GREEN: `pnpm vitest run test/unit/renderer-toasts-dom.test.tsx test/unit/renderer-tokens.test.ts` -> `Test Files 2 passed (2), Tests 22 passed (22)`
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Replaced the inline transfer panel with a controlled Radix Sheet using the existing TDS right-drawer styles.
- Viewer root remains a named region, and its close control uses the shadcn Button and Tooltip primitives. Existing media elements and source URLs were not changed.

### Spec deviations
- Viewer action buttons inside media-specific error states remain unchanged; media renderers were not otherwise modified.

### Tradeoffs accepted
- The drawer has a visible trigger button while open state controls the sheet overlay.

### Assumptions
- Existing `tds-dialog` styles provide the required right drawer dimensions and semantic surface.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: none recorded before implementation; task-3 behavioral DOM test has not yet been added.
  - GREEN: `pnpm typecheck` -> exit 0; `pnpm vitest run test/unit/renderer-shell.test.tsx test/unit/renderer-toasts.test.ts test/unit/renderer-toasts-dom.test.tsx` -> 3 files, 21 tests passed.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- Applied collapse/expand before paint with `useLayoutEffect`, remembers a non-zero viewer percentage in localStorage, and restores it if the panel layout was saved collapsed.
- Dragging the viewer to zero invokes the App close callback.

### Spec deviations
- none

### Tradeoffs accepted
- The last viewer width is stored under `app-shell-last-viewer-width` separately from the panel group layout.

### Assumptions
- The panel library invokes `onResize` for user-driven panel resizing and exposes `size.asPercentage`.

### Follow-ups for human
- Add direct DOM assertions for startup sizing, drag collapse, and restoration. Present shell suite currently does not exercise D-P5-3 directly.

### Test evidence
- RED -> GREEN:
  - RED: `xvfb-run -a pnpm e2e` -> upload toast assertion initially failed because the toast preserves the relative key `seeded/upload-me.txt`; assertion updated to match.
  - GREEN: `pnpm vitest run --project unit --maxWorkers=2` -> 30 files, 652 tests passed.
  - `pnpm typecheck` -> exit 0.
  - `pnpm build` -> exit 0.
  - `pnpm test:integration` -> 24 passed, 1 existing 60s timeout in the 2,500-key delete test; bucket cleanup then reported non-empty.
  - `xvfb-run -a pnpm e2e` -> corrected toast assertion passed; later existing upload-row locator timed out because the row did not appear in the grid.
  - `pnpm test` with default parallelism had intermittent 5 test timeouts; rerunning with `--maxWorkers=2` passed all tests.
- Root cause (bugfix only): none

## FIX Batch 1

### Decisions made
- Followed Coordinator direction to add viewer-pane coverage and investigate integration and e2e failures.

### Spec deviations
- D-P5-3(b) drag-collapse behavior still lacks a behavioral DOM test; the two added shell tests only check that panel nodes render and do not prove their requested sizing behavior.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Resolve e2e upload completion/listing refresh behavior. The upload toast assertion passes, but the uploaded row is absent from the grid and a Refresh toolbar button was not found at that point.
- D-P5-3(a)-(c) require meaningful component tests. Two current tests are insufficient and are not acceptance evidence.
- Compare 2,500-key integration timeout on phase base 32ec3a7; no clean base worktree was created because Git state operations were prohibited.
- Complete and document TDS Rule 10 checks for changed components.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run --project unit test/unit/renderer-shell.test.tsx` -> the new closed-panel and restore tests failed on missing `data-panel-id` attributes (the query was incorrect, not a behavioral regression).
  - GREEN: same command -> `Test Files 1 passed (1), Tests 10 passed (10)` after changing selectors; tests only establish panel presence, not correct percentage sizes.
  - `pnpm typecheck` -> exit 0.
  - `pnpm build` -> exit 0.
  - `pnpm test` -> 29 files passed, 1 existing flaky toolbar tooltip test timed out; 653/654 tests.
  - `pnpm test:integration` -> 6 files passed, 1 failed; 24/25 tests, same 60-second 2,500-key deletion timeout.
  - `xvfb-run -a pnpm e2e` -> upload toast assertion passed; upload row locator timed out. Follow-up attempt to click Refresh also timed out because toolbar was not present.
- Root cause (bugfix only): e2e uploaded object is confirmed in S3, and success toast appears, but listing refresh behavior did not make the row available. Root cause remains unresolved.

## FIX Batch 2

### Decisions made
- Toast failures use fixed generic descriptions; no raw API error message is shown. Toast keys redact local filesystem paths and credential-like values.
- Track transfer terminal IDs for the lifetime of the App so repeated completion events cannot emit duplicate toasts. Events without transfer metadata do not fall back to a fabricated key.
- Preserve the existing transfer list scroll container and its app layout class inside the Sheet; add an internal named close control.
- Rename success receives the requested destination key from RenameDialog and displays the destination filename.
- Removed the unused global `appError` state and Alert because no code path set it; session warning remains an Alert.

### Spec deviations
- none

### Tradeoffs accepted
- A Set of terminal transfer IDs remains in memory until App unmount. Transfer IDs are unique per app session.

### Assumptions
- Failed ops calls are surfaced by RenameDialog and ConfirmDeleteDialog through their new failure callbacks while retaining each dialog's inline error.
- TDS Rule 10 self-check: changed markup uses light TDS surfaces, semantic tokens and existing TDS classes; icon-only close/cancel controls have accessible names; form labels remain associated. Existing TDS `dialog` CSS supplies the Sheet drawer appearance; scrolling uses existing `.app-transfers-body` layout rules.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/renderer-toasts.test.ts` -> 3 behavioral failures: path and credential scrub assertion failure, generic error text assertion failure, and rename destination expected `Renamed to new.txt` but received `Renamed to folder/new.txt`. An earlier test-edit syntax error was corrected before behavioral RED.
  - GREEN: `pnpm vitest run test/unit/renderer-toasts.test.ts` -> 1 file, 14 tests passed.
  - RED: `pnpm vitest run test/unit/renderer-shell.test.tsx` -> the first behavioral version found that the mocked resize sequence did not exercise the callback after rerender; the test was adjusted to model a newly mounted open panel, then all three viewer-pane properties passed.
  - GREEN: `pnpm vitest run test/unit/renderer-shell.test.tsx` -> 1 file, 12 tests passed, including collapsed startup state, drag callback, and width preservation.
  - GREEN: `pnpm vitest run test/unit/renderer-shell.test.tsx test/unit/renderer-toasts.test.ts test/unit/renderer-toasts-dom.test.tsx test/unit/renderer-tokens.test.ts` -> 4 files, 47 tests passed before the additional viewer test; final suite confirms the added coverage.
  - `pnpm typecheck` -> exit 0.
- Final verification after this fix batch:
  - `pnpm typecheck` -> exit 0.
  - `pnpm test` -> 31 files, 663 tests passed.
  - `pnpm build` -> exit 0. Existing unresolved spinner asset URL notices remain.
  - `pnpm test:integration` -> 7 files, 25 tests passed.
  - `xvfb-run -a pnpm e2e` -> 1 passed, including upload success toast assertion and viewer accessibility locator.
  - `git diff --check` -> exit 0.
  - Scanner runs as part of `pnpm test`; it passed.
  - `e2e/app.spec.ts` has no `.app-viewer` selector.
- Root cause (bugfix only): raw error text and upload/download keys could expose local paths/secrets; duplicate onDone events could repeat a failed toast; rename App callback used the selected source name; Sheet removed the previous scrolling wrapper; global appError had no setters.
