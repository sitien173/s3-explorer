<!-- refract-shared-version: 2.4.0 -->

# Phase 3 — Journal: Shell, navigation, and resizable panes

<!--
Phase Journal template. Copy to docs/plans/ui-redesign/phase-03/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-redesign/PLAN.md
- Implementation Profile: cost
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: ae84b996, d91cfd57, 0e8c9daf, bc364440
- Review Job: 6470bc85, 0b9bc564
- Started: 2026-11-05T12:53:31+07:00
- Finished: 2026-11-05T13:17:44+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase 3 / Started 2026-11-05T12:53:31+07:00 / Finished 2026-11-05T12:56:04+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Installed the requested resizable-panels dependency, but the shell redesign remains incomplete and requires continuation.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | package.json | Added react-resizable-panels 4.18.1 |
| Modified | pnpm-lock.yaml | Locked react-resizable-panels 4.18.1 |
| Modified | pnpm-workspace.yaml | Added the package to minimumReleaseAgeExclude as required by pnpm |
| Modified | docs/plans/ui-redesign/phase-03/notes.md | Recorded task evidence and outstanding work |
| Modified | docs/plans/ui-redesign/phase-03/journal.md | Appended this implementation response |
## NOTES
- phase-03/notes.md (## Task 1 through ## Task 4; `pnpm typecheck` passed, `pnpm test` 25 files and 580 tests passed; implementation tasks remain incomplete)
## SPEC COMPLIANCE
- Meets Spec? NO — pane layout, UI migrations, behavioral RED-to-GREEN evidence, scanner/build/e2e checks are not complete.
## CLARIFICATIONS NEEDED
None
## NEXT
CONTINUE_CONTEXT

# EXTERNAL RESPONSE
## META
- Phase 3 / Started 2026-11-05T12:56:04+07:00 / Finished 2026-11-05T13:11:51+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Implemented persistent resizable shell panes, migrated navigation and search controls to TDS-styled shadcn primitives, and updated role-based e2e locators.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | package.json | Added react-resizable-panels 4.18.1 |
| Modified | pnpm-lock.yaml | Locked react-resizable-panels 4.18.1 |
| Modified | pnpm-workspace.yaml | Added pnpm-required minimumReleaseAgeExclude entry |
| Created | src/renderer/src/components/ui/resizable.tsx | v4 resizable primitives and default-layout hook |
| Created | src/renderer/src/components/ui/alert.tsx | TDS announcement alert primitive |
| Created | src/renderer/src/components/ui/empty.tsx | Empty state primitive |
| Created | src/renderer/src/components/ui/breadcrumb.tsx | TDS breadcrumb primitive |
| Modified | src/renderer/src/App.tsx | Resizable pane group, viewer pane, Alert and Empty usage |
| Modified | src/renderer/src/components/Sidebar.tsx | TDS navigation classes and empty state |
| Modified | src/renderer/src/components/Toolbar.tsx | Button and Tooltip primitives |
| Modified | src/renderer/src/components/Breadcrumb.tsx | Breadcrumb primitive |
| Modified | src/renderer/src/components/SearchBar.tsx | Button primitives |
| Modified | src/renderer/src/components/SsoBanner.tsx | Alert primitive |
| Modified | src/renderer/src/styles/globals.css | Imported side-nav CSS |
| Modified | src/renderer/src/styles/app.css | Resizable shell layout |
| Created | src/renderer/src/styles/tds/side-nav.css | CSS sourced from `tds component side-nav` |
| Created | test/unit/renderer-shell.test.tsx | Shell and pane DOM tests |
| Modified | e2e/app.spec.ts | Role/label locators for sidebar and breadcrumb |
| Modified | docs/plans/ui-redesign/phase-03/notes.md | Continuation task evidence and Rule 10 checklist |
| Modified | docs/plans/ui-redesign/phase-03/journal.md | Appended this response |
## NOTES
- phase-03/notes.md (Continuation batch Task 1-4; unit 26 files / 584 tests, typecheck, build, and e2e pass)
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT — requested verification passes; the sidebar button assertion is not backed by mounting the IPC-driven Sidebar, and legacy unreachable Viewer JSX remains documented for cleanup in notes.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

# EXTERNAL RESPONSE
## META
- Phase 03 / Fix batch 1 / Started 2026-11-05T13:12:00+07:00 / Finished 2026-11-05T13:17:44+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Removed stale in-main Viewer markup, added real Sidebar and viewer-close DOM coverage, and confirmed all requested checks pass.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | src/renderer/src/App.tsx | Removed dead Viewer branches and casts; simplified browser/empty branching |
| Modified | test/unit/renderer-shell.test.tsx | Mounted Sidebar with mocked connection results and asserted viewer panel removal on close |
| Modified | docs/plans/ui-redesign/phase-03/notes.md | Appended Fix batch 1 evidence |
| Modified | docs/plans/ui-redesign/phase-03/journal.md | Appended this fix response |
## NOTES
- phase-03/notes.md (Fix batch 1 Task 1-3; `pnpm test` 26 files / 584 tests; e2e 1 passed)
## SPEC COMPLIANCE
- Meets Spec? YES — requested fixes and all fresh verification checks pass.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

# EXTERNAL RESPONSE
## META
- Phase 3 / Fix batch 2 / Started 2026-11-05T13:21:00+07:00 / Finished 2026-11-05T13:28:06+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Corrected persistent three-pane sizing and viewer collapse behavior, fixed TDS shell/navigation details and alert semantics, and added AppShell wiring coverage.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | src/renderer/src/App.tsx | Routed panes through AppShell, applied alert roles and empty-state layout class |
| Created | src/renderer/src/components/AppShell.tsx | Fixed three-panel IDs, percentage sizes, persisted layout, viewer collapse/expand |
| Modified | src/renderer/src/components/Breadcrumb.tsx | Uses BreadcrumbList and TDS breadcrumb nav |
| Modified | src/renderer/src/components/Sidebar.tsx | Limits nav-list wrapper to connection list |
| Modified | src/renderer/src/components/Toolbar.tsx | Uses Tooltip provider defaults without redundant role |
| Modified | src/renderer/src/components/ui/alert.tsx | Defaults to status role while allowing overrides |
| Modified | src/renderer/src/components/ui/breadcrumb.tsx | One TDS breadcrumb container and semantic list styles |
| Modified | src/renderer/src/components/ui/empty.tsx | Removes implicit main empty layout class |
| Modified | src/renderer/src/styles/app.css | Resizable separator affordances, sidebar width override, list reset; removed sidebar overrides |
| Modified | src/renderer/src/styles/globals.css | Removed duplicate side-nav import |
| Modified | test/unit/renderer-shell.test.tsx | Added persistence/remount and viewer/sidebar stability coverage |
| Modified | test/unit/renderer-tokens.test.ts | Allows and tests the required app-sidebar/TDS compound selector |
| Modified | docs/plans/ui-redesign/phase-03/notes.md | Appended Fix batch 2 task/evidence blocks |
| Modified | docs/plans/ui-redesign/phase-03/journal.md | Appended this response |
## NOTES
- phase-03/notes.md (Fix batch 2 Task 1-4; typecheck passed, 26 test files / 585 tests, build passed, e2e 1 passed)
## SPEC COMPLIANCE
- Meets Spec? YES — all requested fixes and fresh verification checks pass; behavioral RED-to-GREEN evidence is recorded.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

Cycle 1, job 6470bc85, FAIL. Blocking: numeric panel sizes are pixels in react-resizable-panels v4; conditional panelIds switch persisted layouts and shift panes; shell test did not exercise App wiring; duplicate side-nav import; tds-side-nav fixed width fights the panel; Alert hard-coded role alert. Non-blocking: breadcrumb markup, toolbar tooltip props, separator affordance, formatting, Empty class, nav-item overrides. Fixed in fix batch 2 at 4604408 under D-P3-4.

Cycle 2, job 0b9bc564, PASS_WITH_DEBT. All blocking findings resolved. Debt: startup jump because viewer collapses in useEffect after paint; drag-collapsed viewer desyncs from viewerOpen; persisted viewer width lost across restart; scanner exception regex allows descendant form; dense one-line JSX formatting.

## Review Result

- Spec Status: PASS
- Quality Status: PASS_WITH_DEBT
- Debt: viewer startup jump, drag-collapse desync, persisted viewer width, owner Phase 5; scanner regex tightening and JSX formatting, owner Phase 6.

## Final Checkpoint

- Phase base ref: refs/plans/ui-redesign/phase-03/base
- Phase implementation ref: refs/plans/ui-redesign/phase-03/impl
- Plan commit ref: refs/plans/ui-redesign/impl or `pending`
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.
