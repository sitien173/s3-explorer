<!-- refract-shared-version: 2.4.0 -->

# Phase 5 — Journal: Toasts, transfers drawer, and viewer chrome

<!--
Phase Journal template. Copy to docs/plans/ui-redesign/phase-05/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-redesign/PLAN.md
- Implementation Profile: cost
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: <Refract job ID or n/a>
- Review Job: <Refract job ID or n/a>
- Started: 2026-11-05T15:58:44+07:00
- Finished: 2026-11-05T17:32:42+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 5 / Started: 2026-11-05T15:58:44+07:00 / Finished: 2026-11-05T16:50:00+07:00 / Plan dir: docs/plans/ui-redesign
## SUMMARY
Implemented toast builders and event wiring, the transfers Sheet, viewer chrome, pane-state changes, and accessible e2e viewer selectors; required viewer-pane DOM coverage and a passing e2e run remain unmet.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | docs/plans/ui-redesign/phase-05/notes.md | Task evidence and implementation notes |
| Modified | docs/plans/ui-redesign/phase-05/journal.md | Phase response |
| Modified | e2e/app.spec.ts | Named viewer region locators and upload toast assertion |
| Modified | package.json | Pinned sonner 2.0.8 |
| Modified | pnpm-lock.yaml | sonner lock entry |
| Modified | src/renderer/src/App.tsx | Toast outcome wiring and root Toaster |
| Modified | src/renderer/src/components/AppShell.tsx | Viewer panel state and width handling |
| Modified | src/renderer/src/components/TransfersDrawer.tsx | Radix Sheet drawer |
| Modified | src/renderer/src/components/Viewer.tsx | Named region and TDS primitive close action |
| Created | src/renderer/src/components/ui/sheet.tsx | shadcn Sheet primitive |
| Created | src/renderer/src/components/ui/sonner.tsx | TDS-styled Toaster |
| Created | src/renderer/src/toasts.ts | Sanitized pure toast builders and notify wrapper |
| Created | test/unit/renderer-toasts-dom.test.tsx | Toaster aria-live and partial-report action tests |
| Created | test/unit/renderer-toasts.test.ts | Toast builder tests |
## NOTES
- docs/plans/ui-redesign/phase-05/notes.md (## Task 1 through ## Task 4)
- Fresh unit rerun: 30 files, 652 tests passed with `--maxWorkers=2`; typecheck and build passed.
- Integration: 24/25 passed; 2,500-key deletion timed out after 60 seconds.
- e2e: toast assertion passed after text correction, then upload row locator timed out; e2e not passing.
- Required D-P5-3 DOM tests are not present. Default-parallel unit run had transient timeouts; constrained rerun passed.
## SPEC COMPLIANCE
- Meets Spec? NO — required D-P5-3(a)-(c) DOM tests are missing and e2e fails on the upload row locator.
## CLARIFICATIONS NEEDED
- May I stop this phase with the required D-P5-3 DOM tests absent and e2e failing at the post-upload row locator, or should work continue in a follow-up run?
## NEXT
BLOCKED

# EXTERNAL RESPONSE
## META
- Phase: 5 / Started: 2026-11-05T16:52:00+07:00 / Finished: 2026-11-05T17:02:00+07:00 / Plan dir: docs/plans/ui-redesign
## SUMMARY
Added preliminary viewer shell DOM checks and investigated the integration and upload e2e failures; phase acceptance remains incomplete because the required viewer behavior tests and e2e pass are still unmet.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | docs/plans/ui-redesign/phase-05/notes.md | Appended FIX Batch 1 evidence and unresolved follow-ups |
| Modified | docs/plans/ui-redesign/phase-05/journal.md | Appended this follow-up response |
| Modified | test/unit/renderer-shell.test.tsx | Added preliminary viewer panel mount and restore tests |
## NOTES
- docs/plans/ui-redesign/phase-05/notes.md (## FIX Batch 1)
- `pnpm typecheck` and `pnpm build` pass.
- `pnpm test`: 29 files passed, 1 flaky tooltip timeout; 653/654 tests.
- `pnpm test:integration`: 24/25; 2,500-key delete timed out at 60 seconds. Base comparison not performed.
- `xvfb-run -a pnpm e2e`: upload toast passed, but uploaded row locator timed out. Refresh control was not present.
- D-P5-3(a)-(c) acceptance DOM tests are not complete. The added tests are not adequate evidence of correct sizing, drag-collapse synchronization, or width persistence.
## SPEC COMPLIANCE
- Meets Spec? NO — required D-P5-3 behavior tests and passing e2e are unmet; unit and integration checks also have failures.
## CLARIFICATIONS NEEDED
- How should work proceed to diagnose the upload listing refresh failure and produce behavioral D-P5-3 tests? This run did not resolve either blocker.
## NEXT
BLOCKED

# EXTERNAL RESPONSE
## META
- Phase: 5 / Started: 2026-11-05T17:17:49+07:00 / Finished: 2026-11-05T17:32:42+07:00 / Plan dir: docs/plans/ui-redesign
## SUMMARY
Resolved the Phase 5 review findings for toast confidentiality and deduplication, operation failure wiring, rename naming, transfers scrolling, and viewer-pane behavior; all required checks pass.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | docs/plans/ui-redesign/phase-05/notes.md | Appended FIX Batch 2 decisions, RED/GREEN evidence, and final verification results |
| Modified | docs/plans/ui-redesign/phase-05/journal.md | Appended this completed implementation response and updated finish time |
| Modified | src/renderer/src/App.tsx | Deduplicated terminal transfer notifications, wired operation failure toasts, passed rename destination, removed unused appError Alert/state |
| Modified | src/renderer/src/components/AppShell.tsx | Constant viewer default size, preserved last width, synchronized drag collapse |
| Modified | src/renderer/src/components/ConfirmDeleteDialog.tsx | Added failure callback for delete/count failures |
| Modified | src/renderer/src/components/RenameDialog.tsx | Added failure callback and destination key to success callback |
| Modified | src/renderer/src/components/TransfersDrawer.tsx | Restored scroll container and added named Sheet close action |
| Modified | src/renderer/src/toasts.ts | Generic failure descriptions, path/secret-safe key formatting, transfer terminal deduplication helper |
| Modified | test/unit/renderer-shell.test.tsx | Added viewer-pane, transfer Sheet, and failure callback DOM checks |
| Modified | test/unit/renderer-toasts.test.ts | Added path/secret redaction, duplicate transfer, generic failure, and rename destination tests |
## NOTES
- docs/plans/ui-redesign/phase-05/notes.md (## FIX Batch 2)
- Fresh checks: typecheck passed; unit 31 files / 663 tests passed; build passed; integration 7 files / 25 tests passed; e2e 1 passed.
- `git diff --check` passed. Scanner passed through `pnpm test`. E2E contains no `.app-viewer` selector and asserts the upload success toast.
## SPEC COMPLIANCE
- Meets Spec? YES — Phase 5 acceptance checks, toast builder coverage, D-P5-3 DOM checks, scanner, and all five verification commands pass.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

<!-- Coordinator appends the independent review response here. -->

### Review cycle 1 (job f4c9a93c, sol-medium): FAIL

**Spec Status: FAIL**  
**Quality Status: FAIL**

### Blocking findings

1. **Viewer width is not restored — D-P5-3(c).**  
   `src/renderer/src/components/AppShell.tsx:37`  
   Changing `defaultSize` when `viewerOpen` changes re-registers the real library’s panel, losing its imperative expansion size. Browser reproduction: resize viewer to **27%**, close, reopen → **20%**, overwriting the persisted 27%. The mocked test at `test/unit/renderer-appshell.test.tsx:66` checks layout seeding, not actual restoration, so misses this failure.

2. **Repeated failed events produce duplicate toasts — D-P5-2.**  
   `src/renderer/src/App.tsx:273-290`  
   Every failed `onDone` event calls `notify.transferFailed`, without checking whether that transfer already finished. Replaying a failure produces another toast, now naming `"object"` because its metadata was deleted. Cancellation itself correctly produces no toast.

3. **Toast sanitization does not uphold the confidentiality invariant.**  
   `src/renderer/src/toasts.ts:16-51`  
   Reproduced builder outputs retain `/mnt/customer/data.csv` in an error description and `secretAccessKey=example-secret-value` verbatim. Additionally, `buildUploadDoneToast("/AKIAIOSFODNN7EXAMPLE")` exposes the access key because the absolute-key branch returns before sanitization. Existing tests cover only selected path roots and secret formats.

4. **Failed folder/create, rename, and delete operations lack toast wiring.**  
   `src/renderer/src/App.tsx:540-543`  
   `src/renderer/src/components/RenameDialog.tsx:127-131,146-150`  
   `src/renderer/src/components/ConfirmDeleteDialog.tsx:195-198`  
   These API failures only set inline errors. For example, a rejected folder creation never raises the DESIGN “operation failed” toast. A passing generic builder test does not establish wiring for these outcomes.

5. **Transfers Sheet loses scrolling.**  
   `src/renderer/src/components/TransfersDrawer.tsx:35-52`  
   Removing `.app-transfers-body` also removes its scrolling behavior. The list has no overflow container, while `.tds-dialog__panel` clips overflow. With many transfers, lower records and their Cancel buttons become inaccessible through normal scrolling.

6. **Rename success reports the old name as the destination.**  
   `src/renderer/src/App.tsx:561-583`  
   Renaming `old.txt` to `new.txt` passes the selected item’s existing name to a builder that says “Renamed to …”, producing **“Renamed to old.txt”**.

### Non-blocking debt

- `src/renderer/src/App.tsx:180,672-696`: `appError` and its persistent Alert are now dead code; no remaining path sets a non-null error.
- `src/renderer/src/components/TransfersDrawer.tsx:29-33`: the modal hides its external collapse toggle and explicitly removes its close button. Escape/backdrop dismissal remains, but an internal named close control would improve discoverability.
- Known environmental integration timeout remains accepted debt, **not a finding**.

Targeted verification passed: **4 files, 35 tests**, including the TDS scanner. Exact Sonner pin, aria-live announcements, partial-report reopening, unchanged media/proxy code, accessible e2e viewer selectors, and upload-toast assertion were confirmed. No files edited.


## Review Result

- Spec Status: PENDING
- Quality Status: PENDING
- Debt: none

## Final Checkpoint

- Phase base ref: refs/plans/ui-redesign/phase-05/base
- Phase implementation ref: refs/plans/ui-redesign/phase-05/impl
- Plan commit ref: refs/plans/ui-redesign/impl or `pending`
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.

## Coordinator Answer (to CLARIFICATIONS NEEDED in job 65b7fdb5)
- Do not stop. Continue in this run (FIX batch 1):
  1. Add the D-P5-3 (a), (b), (c) DOM tests in test/unit/renderer-shell.test.tsx and make them pass.
  2. Diagnose and fix the e2e failure at the post-upload row locator. Likely causes: the upload success toast or the Sheet overlays or steals focus from the grid, or the grid row name changed. Fix the app, not by weakening the assertion; if the locator itself must change, use a role locator scoped to the grid.
  3. Investigate the 2,500-key deletion integration timeout: confirm whether it also fails at the phase base 32ec3a7 under the same load (run `pnpm test:integration` alone, without parallel unit runs). Phase 5 must not change main, preload or shared code, so record the evidence in notes.
  4. Re-run all five checks and append a new `# EXTERNAL RESPONSE` block with NEXT TASK_COMPLETE only when they pass.

## Coordinator FIX batch (direct, after jobs cb10907a replay_blocked, 65b7fdb5 BLOCKED, 2bfb7acd BLOCKED)
- e2e root cause: TransfersDrawer moved to a modal Sheet while `isTransfersDrawerOpen` defaulted to `true`; the first upload opened a modal dialog, Radix set the app `aria-hidden`, and grid and Refresh locators timed out. D-P5-5: the transfers Sheet starts closed; the Transfers button opens it; toasts report outcomes. A non-modal Sheet was rejected because TDS `.tds-dialog` is a fixed full-screen overlay and would need invented CSS.
- AppShell: replaced in-render mutation of the `useDefaultLayout` value with a memoized derived layout; the last non-zero viewer width is seeded whenever the saved viewer size is 0, not only when the viewer starts closed.
- D-P5-3 tests: new `test/unit/renderer-appshell.test.tsx` mocks `ui/resizable` because jsdom gives the real group zero width and `collapse()` is a no-op there. (a) collapse runs in a layout effect before an earlier sibling's passive effect; verified RED with `useEffect`. (b) drag-collapse calls `onViewerClose` only while open. (c) last width persists and seeds a collapsed saved layout. Removed two placeholder tests from `renderer-shell.test.tsx` that only asserted a style string existed.
- Checks: typecheck OK; unit 31 files 655 tests; build OK; `xvfb-run -a pnpm e2e` 1 passed; integration 24/25 in full suite, the 2,500-key delete test times out at 60 s. That test passes alone at plan base ff36a84 (about 61 s) and at the current tree (about 51 s); main, preload and integration code are unchanged since the plan base, so this is environmental timing debt.
- NEXT: independent review.

## Coordinator FIX request 2 (current instructions; supersedes earlier answers)
Baseline commit c2fe5a7. Fix ALL six blocking findings of "Review cycle 1" above, then the two debt items:
1. D-P5-3(c): do not change the viewer panel `defaultSize` with `viewerOpen` (keep it constant, e.g. "30%"), so the real library does not re-register the panel; reopening must restore the last width. Strengthen `test/unit/renderer-appshell.test.tsx` so it would fail if `defaultSize` depends on `viewerOpen`, and record a manual or e2e evidence note.
2. D-P5-2: raise a done or failed toast only on the first terminal event per transferId (check prior state in the transfers list or a seen-set); never fall back to the name "object". Unit test with a replayed failed event.
3. Sanitization: toast text must never contain local paths or secrets. Do not echo raw error messages: use fixed, generic descriptions per operation, plus key names and counts only. Sanitize keys through the same path for all branches, including keys starting with "/". Tests for /mnt/..., C:\..., ~/..., secretAccessKey=..., AKIA... access key IDs, and session tokens.
4. Wire "operation failed" toasts for failed folder creation, rename and delete (keep inline dialog errors if they exist; the toast must not duplicate a persistent Alert). DOM or unit tests for each wiring.
5. Restore scrolling in the transfers Sheet list (an overflow container using allowed classes or existing `app-*` rules), with a DOM check that the list container is scrollable.
6. Rename success toast names the destination (new key), not the old name. Test it.
Debt: remove now-dead `appError` state and its Alert only if no path sets it; add a named close button inside the transfers Sheet.
Run all five checks (`pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `xvfb-run -a pnpm e2e`); the 2,500-key integration timeout in the full suite is known environmental debt. Append a new `# EXTERNAL RESPONSE`. Do not commit.

## Coordinator validation of FIX batch 2 (job f88ebd61)
- Checkpoint 361bcdf: typecheck OK; unit 31 files 663 tests; build OK; integration 7 files 25/25; e2e 1 passed.

## Review cycle 2 (job 15a65cc5): Spec FAIL, Quality FAIL
- All six cycle-1 findings RESOLVED; finding 1 verified against the real library (27% close, reopen, 27%, including restart).
- New blocker: folder rename toast read "Renamed to object" because folder keys end in "/".

## Coordinator FIX batch 3 (direct)
- toasts.ts buildRenameDoneToast strips trailing separators before taking the basename; added folder assertion in renderer-toasts.test.ts, verified RED without the fix.
- Checkpoint 07b7783: typecheck OK; unit 663 passed; build OK; e2e 1 passed; integration 24/25, only the known environmental 2,500-key delete timeout (main-process test, untouched; passed at 361bcdf).

## Review cycle 3 (job 46ad4386): Spec PASS, Quality PASS_WITH_DEBT
- Blocker RESOLVED. Debt: 2,500-key integration timeout; rename basename logic separate from cleanObjectKey; no test for "/" or backslash-terminated keys; "item" fallback in App.tsx rename path; viewer restore lacks a real-library automated assertion; drawer close button test checks presence only.

## Phase 5 FINALIZED at 07b7783
