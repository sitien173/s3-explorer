# Phase 6 prompt: Legacy CSS removal and final checks

Repository: /home/ngosi/projects/s3-explorer. Plan: docs/plans/ui-redesign/PLAN.md, section "Phase 6: Legacy CSS removal and final checks". Design: docs/plans/ui-redesign/DESIGN.md. Phase base: refs/plans/ui-redesign/phase-06/base (d0b0187). Follow the worker contract; keep notes in docs/plans/ui-redesign/phase-06/notes.md and append ERP blocks to docs/plans/ui-redesign/phase-06/journal.md. Do not commit. Never read or edit ~/.aws/*, .env*, or credential files. No IPC, preload, shared or main-process change. No behavior change and no new feature.

## Plan tasks
1. RED first: in `test/unit/renderer-tokens.test.ts`, add a scanner rule that reports any `.app-*` selector in `src/renderer/src/styles/app.css` whose class name is not referenced by any renderer TSX/TS source. A class counts as referenced if it appears as a whole token in a string literal, template literal, `cn`/`cva` argument, or as a static prefix of a template literal (for example `app-row--${state}` keeps every `app-row--*` selector). Add positive and negative fixtures, including a template-literal fixture. Then delete every unreferenced rule from `app.css` (including rules inside `@media`/`@supports`), and delete `app.css` and its import if it ends up empty. The "scans all renderer CSS and TSX sources" test must stay green with the new rule.
2. Delete every `src/renderer/src/styles/tds/<id>.css` that no TSX file references by its `tds-<id>` classes, and remove its `@import` from `globals.css`. Keep shared atoms that referenced components depend on (field-label, field-caption, field-validation, dropdown-panel, caret) if any remaining TDS class uses them. Update the "preserves all TDS marker components" id list to match the files that remain.
3. Docs: add keyboard shortcuts (from the Phase 4 keyboard map in the renderer source) and context menus to `README.md` and to `docs/manual-checklist.md` as checklist items. Describe only what the code does. Copy items are not present; do not document them.

## Debt to clear (test and scanner only, no behavior change)
- Scanner: flag computed object keys (`{[expr]: x}`) and numeric keys inside `cn()` objects; add fixtures.
- Scanner: the `.app-sidebar.tds-side-nav` exception must allow only the compound form, not the descendant `.app-sidebar .tds-side-nav`; add a negative fixture.
- Remove the unused legacy `selectedRowKey` prop from `ObjectTable.tsx` and its callers.
- Stabilize the renderer-shell toolbar tooltip test that intermittently times out at 5000 ms under full-suite load: fix the cause (fake timers, awaited user-event, or `findBy` with explicit delay settings) rather than only raising the timeout.
- Virtualization test: assert all 10,000 rows are loaded in state before counting mounted rows.
- Context-menu test: assert the menu opens at the pointer coordinates.
- `buildRenameDoneToast`: add tests for a separator-only key ("/") and a backslash-terminated key.

## Checks
Run all five: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `xvfb-run -a pnpm e2e`. Counts may only grow, except tests deliberately replaced. Known environmental debt: the integration test "deletes 2,500 keys in three batches" can time out at 60 s in the full suite; record it, do not change main-process code. Confirm no e2e selector uses an `.app-*` class. Append `# EXTERNAL RESPONSE` with check results and NEXT TASK_COMPLETE only when checks pass.
