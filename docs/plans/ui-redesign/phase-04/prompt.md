# Phase 4: Object table selection, keyboard map, context menus, and loading states

## Goal & Outcome
- Plan Goal: the renderer of S3 Media Explorer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with the Trulioo Design System (TDS). Layout and flows stay unchanged.
- Phase Outcome: the object table meets DESIGN.md "Object table" and "Context menus" exactly: multi-selection through a pure reducer, the ARIA grid keyboard map, context menus on rows, multi-selection, and buckets, plus skeleton rows and empty states.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-redesign/phase-04/base`
- Prior State: Phases 1 to 3 done. Tailwind v4 and the TDS bridge in `styles/globals.css`; TDS-styled primitives in `components/ui/` (button, input, label, field, select, checkbox, dialog, alert-dialog, tooltip, badge, spinner, separator, resizable, alert, empty, breadcrumb); `components/AppShell.tsx` with three resizable panes; jsdom DOM tests with mocked `window.api` in `test/unit/renderer-{dialogs,shell}.test.tsx`; styling scanner `test/unit/renderer-tokens.test.ts`. Baseline at phase base: typecheck 0; unit 26 files 585 tests; build 0; integration 7 files 25 tests; e2e 1 passed.
- Read first: `docs/plans/ui-redesign/DESIGN.md` "Architecture and Data Flow" subsections "Object table" and "Context menus", plus "Errors and Edge Cases", "Testing", "Risks and Open Questions" Q1; `docs/plans/ui-redesign/PLAN.md` "Phase 4"; `/home/ngosi/.agents/AGENTS.md` section 6.
- Code Context:
  - `components/ObjectTable.tsx` virtualizes rows with `@tanstack/react-virtual` `useVirtualizer` inside `tds-data-table` markup. `App.tsx` holds `selectedItem: BrowserRow | null`, used by Toolbar, rename, delete, download, and viewer paths.
  - Existing handlers to reuse: open folder or object in viewer, `api` `openWithSystemApp`, download, rename dialog, `ConfirmDeleteDialog`, ops `delete` with `keys` accepting 1 to 10,000 items (`src/shared/ipc.ts:109-114`), ops `deletePrefix` for folders, Sidebar pin and unpin. See `src/renderer/src/api.ts` and `src/preload/index.ts`.
  - TDS CSS already present for menus: `styles/tds/{dropdown-panel,action-list-item}.css`. Prefetched shadcn registry items, data only: `/tmp/shadcn-registry/{context-menu,skeleton,table}.json`. Use them if `pnpm dlx shadcn@4.23.0 add` times out.

## Invariants & Boundaries
- Preserve: virtualization, at most 40 row elements for 10,000 objects; every accessible name used by e2e; all submit and IPC behavior. No IPC, preload, schema, or main-process change.
- Shortcuts fire only while the grid has focus, never from an input, select, or open dialog. Selection clears on prefix, bucket, connection, and search change. Copy items never produce a presigned URL: Copy key, Copy S3 URI `s3://bucket/key`, Copy prefix, Copy bucket name only.
- Look rules: behavior from Radix ContextMenu, look from TDS `tds-dropdown-panel` and `tds-action-list-item`. Skeleton from `tds component skeleton` if it exists, otherwise bridged tokens only. Outside `components/ui` only `tds-*`, `app-*`, and allowlisted layout utilities with TDS token values. No invented TDS CSS.
- Coordinator decisions:
  - D-P4-1, DESIGN Q1: add an e2e step that triggers Copy key and reads `navigator.clipboard.readText()` or an equivalent check. If `writeText` fails under the deny-all permission handlers in `src/main/window.ts`, remove all copy items, keep the failing evidence in notes, and add a `Q1` line under CLARIFICATIONS NEEDED for the user. Do not edit `src/main/window.ts`.
  - D-P4-2: `ConfirmDeleteDialog` accepts N keys and shows the exact count, for example "Delete 3 objects". A multi-selection deletes through one ops `delete` call with all keys. A folder deletes through the existing `deletePrefix` path.
  - D-P4-3: replace e2e `.app-row-name` locators with `getByRole("row", { name })` scoped to the `grid`. `.app-viewer` locators stay until Phase 5.
  - D-P4-4: Toolbar actions use the selection: single-item actions are enabled only for exactly one selected item; Delete is enabled for one or more.
- Out of Scope: toasts, transfers drawer, viewer chrome and Phase 3 viewer-pane debt (Phase 5); legacy CSS deletion (Phase 6). Never read or edit `~/.aws/*`, `.env*`, or credential files.

## Files
Allowed production and test paths:
- `src/renderer/src/selection.ts` (create: pure reducer and keyboard-to-action map)
- `src/renderer/src/components/ui/{context-menu,skeleton}.tsx` (create; `table.tsx` only if you adopt shadcn Table for the header and rows)
- `src/renderer/src/components/{ObjectTable,ConfirmDeleteDialog,Sidebar,Toolbar}.tsx`, `src/renderer/src/App.tsx` (modify)
- `src/renderer/src/styles/globals.css`, `src/renderer/src/styles/tds/<id>.css` (from `tds component <id>` only), `src/renderer/src/styles/app.css` (adjust `app-*` layout rules only; no deletions)
- `package.json`, `pnpm-lock.yaml` (Radix packages from `shadcn add`, pinned exactly). `pnpm-workspace.yaml` only for required `minimumReleaseAgeExclude` entries; list them.
- `test/unit/selection.test.ts`, `test/unit/renderer-object-table.test.tsx` (create)
- `test/unit/renderer-dialogs.test.tsx` (modify: ConfirmDeleteDialog N-key cases), `test/unit/renderer-tokens.test.ts` (only for a wrongly rejected legitimate pattern, with fixture and note)
- `e2e/app.spec.ts` (modify: D-P4-1 and D-P4-3, plus keyboard Delete and context-menu rename steps)

Worker-owned phase records:
- `docs/plans/ui-redesign/phase-04/notes.md` (append `## Task <M>` blocks)
- `docs/plans/ui-redesign/phase-04/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`; never write a journal at the repo root)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, `src/main/**`, `src/preload/**`, `src/shared/**`, or secrets.

## Tasks
- task-1: RED first. `test/unit/selection.test.ts` covers every reducer transition: select one, toggle, range from anchor, extend with Shift+Arrow, move active by one, by page, Home, End, select all loaded rows, clear, reset on context change; and the keyboard-to-action map for every key in the DESIGN.md table, including Backspace and Alt+ArrowUp to parent, Delete, F2 single-only, ContextMenu and Shift+F10. Then implement `selection.ts` as a pure module.
- task-2: RED first. `test/unit/renderer-object-table.test.tsx`: each key in the map has a DOM test on the grid; `role="grid"`, `aria-multiselectable="true"`, `aria-activedescendant` points at the active row id; rows have `role="row"` and `aria-selected`; active-row moves call `scrollToIndex`; a 10,000-row render mounts at most 40 rows; mouse click, Ctrl+click, Shift+click, double-click; shortcuts do not fire from an input inside the page or while a dialog is open. Then wire the grid and replace `selectedItem` in `App.tsx` with the reducer state. Implement D-P4-2 and D-P4-4.
- task-3: Add `ui/context-menu` and the menus per the DESIGN.md table for object row, folder row, multi-selection, and sidebar bucket, each calling the existing handler. Implement D-P4-1.
- task-4: Skeleton rows while a page loads; empty states via `ui/empty` for empty bucket, empty folder, and no search results. Apply D-P4-3 and add e2e steps for keyboard Delete and context-menu rename. TDS Rule 10 self-check on new or changed components, recorded in notes.

## Done When
- Every key in the DESIGN.md keyboard map has a passing DOM test; context menu items match the DESIGN.md table per target; a 10,000-row DOM test renders at most 40 rows; e2e passes with the keyboard delete and context-menu rename steps.
- Scanner passes on all new and changed files.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 26 files, 585 tests; counts may only grow)
  - `pnpm build` (Baseline: exit 0)
  - `pnpm test:integration` (Baseline: 7 files, 25 tests)
  - `xvfb-run -a pnpm e2e` (Baseline: 1 passed; requires Docker)

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable. Complete all tasks in one run; return `CONTINUE_CONTEXT` only when your context is actually near its limit.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/ui-redesign/phase-04/journal.md`, then return that block and the matching status line from `erp.md`.
