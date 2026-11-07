<!-- refract-shared-version: 2.5.0 -->

# Phase 2 — Journal: Base UI primitives

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-02/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-stack-refactor/PLAN.md
- Implementation Profile: balanced (google targets failed: 53478049, c573aad7)
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: 0ad3f42b, FIX f1787c28
- Review Job: 094bd3a7
- Started: 2026-11-07T14:15:56+07:00
- Finished: 2026-11-07T15:31:00+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 2 (Base UI primitives) / Started: 2026-11-07T14:15:56+07:00 / Finished: 2026-11-07T15:31:00+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
The `components/ui` wrappers now use `@base-ui/react` 1.9.0, `radix-ui` is removed, both `focusin` trackers are replaced by `finalFocus` with a grid fallback, and the Phase 1 focus test passes as plain `it`.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| modify | package.json | `@base-ui/react` 1.9.0 added, `radix-ui` removed |
| modify | pnpm-lock.yaml | lockfile updated by pnpm |
| modify | src/renderer/src/components/ui/button.tsx | Slot replaced by `useRender` |
| modify | src/renderer/src/components/ui/dialog.tsx | Base UI Dialog, `useFinalFocus`, tracker deleted |
| modify | src/renderer/src/components/ui/alert-dialog.tsx | Base UI AlertDialog, tracker deleted |
| modify | src/renderer/src/components/ui/sheet.tsx | Base UI Dialog with sibling Backdrop and Popup |
| modify | src/renderer/src/components/ui/context-menu.tsx | Base UI ContextMenu with Positioner |
| modify | src/renderer/src/components/ui/tooltip.tsx | Base UI Tooltip with Positioner, `role="tooltip"` |
| modify | src/renderer/src/components/ObjectTable.tsx | `asChild` to direct trigger props, `onSelect` to `onClick` |
| modify | src/renderer/src/components/Sidebar.tsx | `asChild` to `render`, `onSelect` to `onClick` |
| modify | src/renderer/src/components/Toolbar.tsx | TooltipTrigger `render` |
| modify | src/renderer/src/components/Viewer.tsx | TooltipTrigger `render` |
| modify | src/renderer/src/components/TransfersDrawer.tsx | SheetClose `render` |
| modify | test/unit/renderer-dialogs.test.tsx | focus test to plain `it` with restore, new unmounted-opener test |
| modify | test/unit/renderer-object-table.test.tsx | context-menu position locator |
| modify | docs/plans/ui-stack-refactor/phase-02/notes.md | confirmed APIs and Task 1 to 4 blocks |
| modify | docs/plans/ui-stack-refactor/phase-02/journal.md | this response |
## NOTES
- phase-02/notes.md  (## Confirmed Base UI 1.9.0 APIs, ## Task 1, ## Task 2, ## Task 3, ## Task 4)
- Fresh checks: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test --maxWorkers=2` 741 passed, 0 expected fails; `pnpm build` exit 0. e2e not run, per instruction.
## SPEC COMPLIANCE
- Meets Spec? YES  - All Done When greps are empty and all four checks pass; e2e is left to the Coordinator.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE


# EXTERNAL RESPONSE
## META
- Phase: 2 (Base UI primitives), FIX batch 1 / Started: 2026-11-07T15:33:00+07:00 / Finished: 2026-11-07T15:41:00+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
`useFinalFocus` now rejects hidden, inert, and disabled openers, Sheet uses it, and the final-focus tests cover post-open disconnection and unusable openers for Dialog, AlertDialog, and Sheet.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| modify | src/renderer/src/components/ui/dialog.tsx | `canRefocus` check inside `useFinalFocus` |
| modify | src/renderer/src/components/ui/sheet.tsx | `Sheet` wrapper and context supply `finalFocus` to `SheetContent` |
| modify | test/unit/renderer-dialogs.test.tsx | `describe.each` final-focus tests replace the single detached-opener test |
| modify | docs/plans/ui-stack-refactor/phase-02/notes.md | `## Task FIX-1` |
| modify | docs/plans/ui-stack-refactor/phase-02/journal.md | this response |
## NOTES
- phase-02/notes.md  (## Task FIX-1)
- Fresh checks: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test --maxWorkers=2` 752 passed, 0 failed; `pnpm build` exit 0. e2e not run.
## SPEC COMPLIANCE
- Meets Spec? YES  - Findings 1 to 3 are fixed with RED evidence and all four checks pass.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

Job 094bd3a7 (balanced, pi-openai-codex/sol-medium) on checkpoint 5d77848.

# CODE QUALITY REVIEW

Status: **PASS_WITH_DEBT**

1. **Non-blocking: incomplete focusability check.**  
   `src/renderer/src/components/ui/dialog.tsx:15`  
   `usable` checks connectivity, body, and direct `disabled` only. A connected opener that becomes hidden, inert, or disabled through a fieldset can still be returned, leaving focus unrestored.  
   **Fix:** validate programmatic focusability at restoration time and use the grid when restoration cannot succeed. Add coverage for a connected but unusable opener.

2. **Non-blocking: detached-opener test does not exercise post-open disconnection.**  
   `test/unit/renderer-dialogs.test.tsx:463`  
   The click handler opens the dialog and removes the opener in the same update. The layout effect therefore captures body rather than an opener that subsequently disconnects. This tests the body fallback, not the stated lifecycle.  
   **Fix:** open the dialog, confirm focus entered it, then unmount the opener in a separate update before closing. Cover AlertDialog too.

3. **Non-blocking: Sheet does not share the grid-fallback policy.**  
   `src/renderer/src/components/ui/sheet.tsx:45`  
   Sheet uses Base UI’s default return focus without `useFinalFocus`. The current stable Transfers opener makes this acceptable today, but a disconnected Sheet opener will not receive the explicit grid fallback.  
   **Fix:** apply the shared restoration policy to Sheet, or explicitly narrow and test its stable-opener contract.

## Verified

- Reviewed the requested diff at `5d77848`, Phase 2 specifications, invariants, and worker notes.
- Installed `@base-ui/react` is exactly **1.9.0**. Checked relevant declarations and runtime implementation, plus versioned documentation.
- `useFinalFocus` captures before Base UI’s queued initial-focus operation. AlertDialog exports the same Dialog Popup implementation, so the timing applies there too.
- Disconnected/body/disabled opener branches return `[role="grid"]`.
- `render`, `useRender`, Portal/Backdrop/Popup composition, ContextMenu Item/Positioner, and Tooltip Provider/Positioner usage match installed APIs.
- Keyboard context-menu dispatch remains anchored to the active row. Existing tests exercise Shift+F10 and ContextMenu keys, although keyboard coordinates are not asserted.
- Exit-unmount assertions use `waitFor`; no fixed sleeps were added.
- TDS classes remain. Added dialog/sheet alignment and padding utilities reproduce the former backdrop layout structurally. Browser visual parity was not independently checked.
- Dialog naming attributes agree; `aria-labelledby` takes precedence. Tooltip explicitly retains `role="tooltip"`.
- No new unused wrapper exports identified. Existing unused aliases remain; removed `ContextMenuSubContent` had no callers.
- Radix and legacy-prop searches are empty. Lockfile package changes are limited to Base UI additions and Radix-related removals. `git diff --check` passes.
- No files edited, state-changing Git commands run, e2e run, or prohibited stores read. Build/test results are coordinator-provided evidence, not independently rerun.

## Review Result

- Spec Status: PASS. The Coordinator checked the work against prompt.md: Done When greps empty, it.fails flipped, focus falls back to the grid.
- Quality Status: PASS_WITH_DEBT (094bd3a7). Findings 1 to 3 are fixed in FIX-1 (job f1787c28). The worker showed that 9 new tests fail against the old check. Coordinator validation after FIX-1: typecheck 0, lint 0, test 752/752 (one earlier run had 1 failure in transfers.test.ts "unique part file"; it passed 5/5 alone and on a full re-run), build 0, e2e 1 passed.
- Debt:
  - test/unit/transfers.test.ts "writes download to a unique part file" is flaky under machine load. It was seen twice in Phase 2 and is unrelated to the renderer. Owner: Phase 9.
  - Sheet records the opener only from the controlled `open` prop. Its only caller, TransfersDrawer, is controlled. Owner: Phase 9 note.

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-02/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-02/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.
