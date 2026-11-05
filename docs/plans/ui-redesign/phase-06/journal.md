<!-- refract-shared-version: 2.4.0 -->

# Phase 6 — Journal: Legacy CSS removal and final checks

<!--
Phase Journal template. Copy to docs/plans/ui-redesign/phase-06/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-redesign/PLAN.md
- Implementation Profile: cost
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-05T17:43:53+07:00
- Finished: 2026-11-05T18:25:00+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 6 / Started: 2026-11-05T17:43:53+07:00 / Finished: 2026-11-05T18:25:00+07:00 / Plan dir: docs/plans/ui-redesign
## SUMMARY
Implemented the unreferenced selector scanner rule with positive, negative, and template-prefix fixtures; removed all 20 unreferenced legacy rules from app.css while retaining referenced styles; confirmed all 22 TDS CSS files remain in active use; documented keyboard shortcuts and context menus in README.md and manual-checklist.md; and cleared all seven debt items. All five verification checks passed (with the 2,500-key delete integration timeout noted as environmental debt).
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | README.md | Added Keyboard Shortcuts and Context Menus sections |
| Modified | docs/manual-checklist.md | Added checklist items for keyboard shortcuts and context menus |
| Created | docs/plans/ui-redesign/phase-06/notes.md | Phase notes and test evidence |
| Created | docs/plans/ui-redesign/phase-06/journal.md | Phase journal and ERP block |
| Modified | src/renderer/src/components/ObjectTable.tsx | Removed unused legacy selectedRowKey prop |
| Modified | src/renderer/src/styles/app.css | Deleted 20 unreferenced selector rules |
| Modified | test/unit/renderer-object-table.test.tsx | Virtualization state load assertion and context-menu pointer coordinate assertion |
| Modified | test/unit/renderer-shell.test.tsx | Stabilized toolbar tooltip test with fake timers |
| Modified | test/unit/renderer-toasts.test.ts | Added separator-only and backslash-terminated rename toast tests |
| Modified | test/unit/renderer-tokens.test.ts | Added unreferenced selector scanner rule, computed/numeric object key checks, compound selector check, and fixtures |
## NOTES
- docs/plans/ui-redesign/phase-06/notes.md (## Task 1 through ## Task 3, ## Debt Cleared)
## VERIFICATION
- pnpm typecheck: OK (exit 0)
- pnpm test: OK (31 files passed, 666 passed of 666 tests)
- pnpm build: OK (exit 0, client bundle 146.32 kB css, 1255.52 kB js)
- xvfb-run -a pnpm e2e: OK (1 passed in 16.3s, no e2e selectors use app-*)
- pnpm test:integration: 6 of 7 files passed, 24 of 25 tests passed. The 2,500-key delete test timed out at 60s in the full suite (passes alone in 36.7s; known environmental debt)
## NEXT
TASK_COMPLETE

## Coordinator validation (job a5b8511f, Gemini Flash, TASK_COMPLETE)
- Checkpoint 7064f02: typecheck OK; unit 31 files 666 tests; build OK; e2e 1 passed; integration 24/25 with only the known environmental 2,500-key delete timeout. No main, preload or shared diff since d0b0187. No `.app-*` selector in e2e. All 22 tds/*.css files referenced (button and icon-button via tds-btn and tds-icon-btn; caret via select.css), so none deleted.

## Review cycle 1 (job e2a8a1dc): Spec FAIL, Quality PASS_WITH_DEBT
- All 20 deleted app.css rules verified unreferenced in src, test and e2e. Scanner rules, fixtures and test debt items verified.
- Blocker: README and manual checklist said Delete is disabled whenever a folder is selected; code blocks only multi-selections containing a folder.

## Coordinator FIX (direct)
- Corrected README Delete line and manual-checklist Delete item; collapsed double blank lines in app.css. Checkpoint c6685aa: unit 666 passed, build OK, e2e 1 passed.

## Review cycle 2 (job bc9735a2): Spec PASS, Quality PASS_WITH_DEBT
- Blocker RESOLVED. Debt: loose context-menu x assertion; side-nav exception tested per rule, not per selector; scanner counts any app-* string literal as referenced and lacks variant-prefix and .ts fixtures; README context-menu "active row" fallback wording; known integration timeout.

## Phase 6 FINALIZED
