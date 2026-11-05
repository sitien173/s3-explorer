<!-- refract-shared-version: 2.4.0 -->

# Phase 6 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-redesign/phase-06/notes.md, fill the
heading, then append one `## Task <M>` block per task (and additional batch
sections on resumed `FIX:` rounds). Keep the file; never overwrite earlier task
blocks. Empty sub-sections = `- none`. Every task gets a block even if all
`none`.
-->

## Task 1

### Decisions made
- Implemented `extractReferencedAppClasses`, `collectReferencedAppClasses`, and `scanAppCssUnreferencedSelectors` in `test/unit/renderer-tokens.test.ts`.
- AST walk extracts whole class tokens from string literals, template literals, and `cn`/`cva` arguments, and extracts static prefixes from template expressions (e.g., `app-row--${state}` or `app-transfer-status--${item.status}`).
- Handled variant prefix stripping (e.g. `hover:app-active`).
- Flagged unreferenced `.app-*` selector classes in `src/renderer/src/styles/app.css` under the rule name `app-css-unreferenced-selector`.
- Added positive, negative, and template-literal unit test fixtures for the unreferenced selector scanner rule.
- Verified RED: running `scans all renderer CSS and TSX sources` failed with exactly 20 unreferenced `.app-*` selectors.
- Deleted all 20 unreferenced selectors and rules from `src/renderer/src/styles/app.css`:
  - `.app-add-bucket-btn`
  - `.app-main-placeholder`
  - `.app-placeholder-card`
  - `.app-placeholder-title`
  - `.app-placeholder-text`
  - `.app-placeholder-caption`
  - `.app-table-viewport`
  - `.app-card`
  - `.app-pane`
  - `.app-browser-body--with-viewer`
  - `.app-browser-viewer-pane`
  - `.app-transfers-drawer`
  - `.app-transfers-drawer--collapsed`
  - `.app-transfers-drawer--open`
  - `.app-transfers-header`
  - `.app-transfers-header-title`
  - `.app-transfers-header-count`
  - `.app-transfers-chevron`
  - `.app-transfers-chevron--open`
  - `.app-browser-viewer-pane--standalone`
- Retained `app.css` and its `@import` in `globals.css` because 144 referenced `.app-*` layout classes remain in active use.

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
  - RED: `pnpm vitest run test/unit/renderer-tokens.test.ts` -> `scans all renderer CSS and TSX sources` failed reporting 20 unreferenced selector classes in `app.css`.
  - GREEN: `pnpm vitest run test/unit/renderer-tokens.test.ts` -> 22 passed of 22 tests.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Inspected all 22 TDS CSS files in `src/renderer/src/styles/tds/`.
- Verified that all 18 TDS marker components (`button`, `icon-button`, `text-input`, `select`, `checkbox`, `field-label`, `field-caption`, `field-validation`, `dialog`, `data-table`, `breadcrumb`, `announcement`, `side-nav`, `nav-list`, `nav-item`, `spinner`, `progress-indicator`, `tag`) and 3 additional atoms (`action-list-item`, `dropdown-panel`, `tooltip`) are directly referenced by TSX components in `src/renderer/src`.
- Shared atom `caret.css` is retained because referenced component `select.css` depends on `.tds-caret` (`.tds-select--disabled .tds-caret`).
- The 18-id list for `preserves all TDS marker components and token references` in `test/unit/renderer-tokens.test.ts` remains intact, matching all 18 remaining marker component files.

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
  - GREEN: `test/unit/renderer-tokens.test.ts` -> `preserves all TDS marker components and token references` passed (all 18 files exist, contain marker headers, and reference valid tokens).
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Added `## Keyboard Shortcuts` and `## Context Menus` sections to `README.md`.
- Added 13 manual verification checklist items to `docs/manual-checklist.md` covering all keyboard shortcuts and context menus from the Phase 4 renderer source.
- Described only what the code does; copy items were excluded as copy actions are not present.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- Documentation items map 1:1 to implementations in `src/renderer/src/selection.ts`, `src/renderer/src/components/ObjectTable.tsx`, and `src/renderer/src/components/Sidebar.tsx`.

## Debt Cleared

### Decisions made
1. Scanner computed/numeric keys:
   - Added AST checks in `scanClassNames` for `ts.isComputedPropertyName` and `ts.isNumericLiteral` inside object literals passed to `cn()`.
   - Added unit test fixtures asserting that `{ [expr]: true }` and `{ 123: true }` are flagged.
2. Scanner compound vs descendant exception:
   - Changed regex in `scanAppCssSelectors` from `/\.app-sidebar\s*\.tds-side-nav/` to `/\.app-sidebar\.tds-side-nav/`.
   - Added a negative fixture verifying that descendant `.app-sidebar .tds-side-nav` is flagged.
3. Legacy `selectedRowKey`:
   - Removed unused prop `selectedRowKey?: string | null` and destructuring from `src/renderer/src/components/ObjectTable.tsx`.
   - Verified that no callers or tests use `selectedRowKey`.
4. Renderer-shell toolbar tooltip stabilization:
   - Updated `test/unit/renderer-shell.test.tsx` to use fake timers (`vi.useFakeTimers()`, `await vi.advanceTimersByTimeAsync(1000)`, `vi.useRealTimers()`).
   - Replaced 7 * 700ms wall-clock delays (~4900ms) with deterministic fake timer advancement, executing in ~335ms without timing out under suite load.
5. Virtualization test load assertion:
   - In `test/unit/renderer-object-table.test.tsx`, added assertions that `aria-busy` is null, `aria-rowcount` is `"10001"`, and `"10,000 items"` is present in the DOM before asserting on mounted row count.
6. Context-menu pointer coordinate assertion:
   - In `test/unit/renderer-object-table.test.tsx`, added assertion that the Radix context menu position wrapper has style matching `transform: translate(12\dpx, 80px)`.
7. `buildRenameDoneToast` test coverage:
   - In `test/unit/renderer-toasts.test.ts`, added test cases for separator-only key (`"/"` -> `"Renamed to object"`) and backslash-terminated key (`"parent\\renamed-folder\\"` -> `"Renamed to renamed-folder"`).
