<!-- refract-shared-version: 2.4.0 -->

# Phase 6 — Decision Notes

<!--
Worker Notes. Append one `## Batch <N>: Scope <X>` section per scoped job.
Keep the file; never overwrite earlier blocks. Empty sub-sections = `- none`.
Record each verification fact with the exact command and observed result.
-->


## Batch 1: Scope A

### Decisions made
- Coordinator decision via `refract ask`: exempt `components.css` from the hex, `--color-*`, and `--spacing-*` checks because it holds verbatim `tds component` output and must not be edited. Instead, verified that every component section begins with `/* tds component: <id> */` and every `var(--x)` referenced in `components.css` is defined in `tokens.css`.
- Coordinator decision via `refract ask`: update `tsconfig.web.json` to include `"src/shared/**/*.ts"` in its `include` array so `src/renderer/src/api.ts` can use `import type { Api, Result } from "../../shared/ipc"`. Confirmed via grep that `out/renderer` bundles no runtime code or `zod` from `src/shared`.
- Added `/// <reference types="vite/client" />` in `main.tsx` to support CSS stylesheet side-effect imports under Vite.
- Guarded `window.api` reference in `api.ts` with `typeof window !== "undefined"` for safe evaluation across Node and browser contexts.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- Component styles from `tds component` referencing `--text-body`, `--elevation-xs`, `--elevation-xl`, `--tds-side-nav-item-hover`, and `--tds-side-nav-sub-item-hover` are supplied in `tokens.css` from the Trulioo Design System tokens specification.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/renderer-tokens.test.ts` -> `AssertionError: expected 0 to be greater than 0` (7 failed tests against invalid fixtures)
  - GREEN: `pnpm vitest run test/unit/renderer-tokens.test.ts` -> `1 passed test file, 9 passed tests`
- Fresh verification checks:
  - `pnpm typecheck` -> exit 0
  - `pnpm test` -> exit 0 (17 test files passed, 338 tests passed)
  - `pnpm build` -> exit 0
  - `grep -rn "zod" out/renderer` -> exit 1 (0 matches)
  - `grep -rn "dangerouslySetInnerHTML" src/renderer` -> exit 1 (0 matches)

### Commands run and component IDs copied
- `tds rules` -> exit 0
- `tds tokens all` -> exit 0
- `tds search "button"`, `tds search "input"`, `tds search "select"`, `tds search "checkbox"`, `tds search "dialog"`, `tds search "table"`, `tds search "breadcrumb"`, `tds search "announcement"`, `tds search "nav"`, `tds search "spinner"`, `tds search "progress"`, `tds search "tag"` -> all exit 0
- `tds component <id>` run and copied verbatim into `src/renderer/src/styles/components.css` for 18 component IDs: `button`, `icon-button`, `text-input`, `select`, `checkbox`, `field-label`, `field-caption`, `field-validation`, `dialog`, `data-table`, `breadcrumb`, `announcement`, `side-nav`, `nav-list`, `nav-item`, `spinner`, `progress-indicator`, `tag`.

### Root cause (bugfix only)
- none


## Batch 2: Scope B

### Decisions made
- Coordinator decision via `refract ask`: add `"src/renderer/src/format.ts"` to `include` array of `tsconfig.node.json` to allow `test/unit/renderer-format.test.ts` to typecheck without TS6307. Verified `format.ts` remains completely pure with no DOM globals or React dependencies.
- Implemented `useDialogTrap` in `ConnectionDialog.tsx` to handle focus trapping, opener focus restoration, and Escape key dismissal across all dialogs (`ConnectionDialog`, `AddBucketDialog`, and delete confirmation dialog in `Sidebar`).
- Designed `buildUpdateRequest` in `format.ts` such that empty or whitespace-only secret access key fields on edit are omitted from the update request, ensuring stored secrets are not overwritten.

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
  - RED: `pnpm vitest run test/unit/renderer-format.test.ts` -> `7 failed | 1 passed (8)` on behavioral assertions (`expected [] to deeply equal ...`, `expected {} to deeply equal ...`)
  - GREEN: `pnpm vitest run test/unit/renderer-format.test.ts` -> `1 passed test file, 8 passed tests`
- Fresh verification checks:
  - `pnpm typecheck` -> exit 0
  - `pnpm test` -> exit 0 (18 test files passed, 346 tests passed)
  - `pnpm build` -> exit 0
  - `grep -rn "zod" out/renderer` -> exit 1 (0 matches)
  - `grep -rn "dangerouslySetInnerHTML" src/renderer` -> exit 1 (0 matches)

### Root cause (bugfix only)
- none


## Batch 3: Scope C

### Decisions made
- C0 Coordinator finding: extracted shared focus trapping, Escape dismissal, autofocus, and opener focus restoration into `src/renderer/src/components/Dialog.tsx`. Refactored `ConnectionDialog.tsx`, `AddBucketDialog.tsx`, and the delete confirmation dialog in `Sidebar.tsx` to use `<Dialog>`.
- C1 Contract 4: implemented `Breadcrumb.tsx` for folder hierarchy navigation and root return.
- C1 Contract 4: implemented `SearchBar.tsx` managing search job lifecycle (`start`, `cancel`, `progress`, `batch`, `done`), truncation notifications, error state, and listener cleanup.
- C1 Contract 4: implemented `ObjectTable.tsx` using `@tanstack/react-virtual` with fixed row height (40px), overscan of 10, folders listed first, click-to-navigate, client-side name filter, infinite scroll pagination via `nextToken` with single in-flight lock, and stale response discard guard.
- Added pure functions in `format.ts`: `parseBreadcrumbs`, `mergeFoldersAndObjects`, `filterBrowserRows`, `isStaleResponse`, and `applyPageResponse`.
- Replaced emoji icons with accessible SVG icons in `Dialog.tsx` and `ObjectTable.tsx`.
- Wired `Breadcrumb`, `SearchBar`, and `ObjectTable` into `App.tsx` for active bucket/prefix browsing and search results mode.

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
  - RED: `pnpm vitest run test/unit/renderer-format.test.ts` failed on 8 behavioral test cases for `parseBreadcrumbs`, `mergeFoldersAndObjects`, `filterBrowserRows`, `isStaleResponse`, and `applyPageResponse`.
  - GREEN: `pnpm vitest run test/unit/renderer-format.test.ts` -> 1 passed file, 16 passed tests.
- Fresh verification checks:
  - `pnpm vitest run test/unit/renderer-tokens.test.ts` -> exit 0 (1 passed file, 9 passed tests)
  - `pnpm typecheck` -> exit 0
  - `pnpm test` -> exit 0 (18 test files passed, 354 passed tests)
  - `pnpm build` -> exit 0
  - `grep -rn "dangerouslySetInnerHTML" src/renderer` -> exit 1 (0 matches)
  - `grep -rn "zod" out/renderer` -> exit 1 (0 matches)

### Root cause (bugfix only)
- none
