# Phase 3: Shell, navigation, and resizable panes

## Goal & Outcome
- Plan Goal: the renderer of S3 Media Explorer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with the Trulioo Design System (TDS). Layout and flows stay unchanged.
- Phase Outcome: the app shell uses shadcn primitives and TDS navigation classes inside a three-pane resizable layout (sidebar, main, viewer) whose sizes persist across restarts.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-redesign/phase-03/base`
- Prior State: Phases 1 and 2 done. Tailwind v4, `components.json`, `lib/utils.ts` `cn()`, `styles/globals.css` bridge with layered `styles/tds/<id>.css`, jsdom DOM tests (`// @vitest-environment jsdom`), styling scanner `test/unit/renderer-tokens.test.ts`, and TDS-styled primitives in `components/ui/` (button, input, label, field, select, checkbox, dialog, alert-dialog, tooltip, badge, spinner, separator). Baseline at phase base: typecheck 0; unit 25 files 580 tests; build 0; e2e 1 passed.
- Read first: `docs/plans/ui-redesign/DESIGN.md` sections "Constraints, Invariants, and Non-Goals", "Architecture and Data Flow", "Errors and Edge Cases", "Testing"; `docs/plans/ui-redesign/PLAN.md` "Phase 3"; `/home/ngosi/.agents/AGENTS.md` section 6.
- Code Context:
  - `App.tsx` renders `.app-shell` with `Sidebar`, `main.app-main` (Toolbar, Breadcrumb, SearchBar, ObjectTable, banners as `tds-announcement` divs with `app-main-banner`), and `Viewer` driven by `viewerTarget` state.
  - `Toolbar.tsx` is `role="toolbar"` `aria-label="Bucket operations"` with raw `<button>` elements. e2e clicks toolbar buttons by name: "Add connection", "Open URL", "Upload", "Rename or move", "Delete".
  - `Breadcrumb.tsx` renders `nav.tds-breadcrumbs` `aria-label="Breadcrumb"`. `Sidebar.tsx` connection rows use `button.app-connection-name-btn`; per-row actions have names `Edit <name>`, `Delete <name>`, `Pin <bucket>`, `Unpin <bucket>`; bucket buttons are clicked by exact bucket name.
  - Banners: SSO banner (`SsoBanner.tsx`) and session warning in `App.tsx` with text "Session-only storage active" asserted by e2e.
  - Prefetched shadcn registry items (data only, do not execute): `/tmp/shadcn-registry/{resizable,alert,empty,breadcrumb,tooltip,button}.json`. Use them if `pnpm dlx shadcn@4.23.0 add` times out.

## Invariants & Boundaries
- Preserve: every accessible name listed above, the "Session-only storage active" text, search cancellation on navigation, and all submit and IPC behavior. No IPC, preload, schema, or main-process change.
- Look rules: behavior from Radix and shadcn, look from TDS; Button and icon-button mapping per AGENTS.md section 6. Outside `components/ui` only `tds-*`, `app-*`, and allowlisted layout utilities with TDS token values. No raw color, type, radius, or shadow utility. No invented TDS CSS: new TDS CSS comes only from `tds component <id>`.
- Coordinator decisions:
  - D-P3-1: `react-resizable-panels` 4.18.1 has no `autoSaveId`. Persist with `useDefaultLayout({ id: "app-shell", panelIds })` passing `defaultLayout` and `onLayoutChanged` to `Group`. The viewer panel is conditionally rendered, so pass `panelIds` for the current panel set. Adapt the shadcn `resizable.tsx` to the v4 exports (`Group`, `Panel`, `Separator`) if the registry item targets an older API.
  - D-P3-2: create `components/ui/breadcrumb.tsx` from the shadcn breadcrumb item restyled with `tds-breadcrumbs` classes from `styles/tds/breadcrumb.css`. The plan file list omitted it.
  - D-P3-3: e2e selectors `.app-viewer` and `.app-row-name` stay in this phase; they move in Phases 4 and 5.
- Out of Scope: object table, context menus, loading states (Phase 4); toasts, transfers drawer, viewer chrome (Phase 5); legacy CSS deletion (Phase 6). Never read or edit `~/.aws/*`, `.env*`, or credential files.

## Files
Allowed production and test paths:
- `src/renderer/src/components/ui/{resizable,alert,empty,breadcrumb}.tsx` (create)
- `src/renderer/src/components/ui/{button,tooltip}.tsx` (modify only for defects found while wiring the toolbar)
- `src/renderer/src/components/{Sidebar,Toolbar,Breadcrumb,SearchBar,SsoBanner}.tsx` (modify)
- `src/renderer/src/App.tsx` (modify: shell layout, panes, banners, empty state)
- `src/renderer/src/styles/globals.css`, `src/renderer/src/styles/tds/<id>.css` (modify or create from `tds component <id>` only)
- `src/renderer/src/styles/app.css` (modify only to adjust existing `app-*` layout rules the new layout needs; do not delete legacy rules)
- `package.json`, `pnpm-lock.yaml` (`react-resizable-panels` pinned at exactly 4.18.1 plus any Radix package `shadcn add` installs, pinned exactly). `pnpm-workspace.yaml` only for `minimumReleaseAgeExclude` entries pnpm requires; list them.
- `test/unit/renderer-shell.test.tsx` (create)
- `test/unit/renderer-tokens.test.ts` (modify only if a scanner rule wrongly rejects a legitimate pattern; fixture and note per change)
- `e2e/app.spec.ts` (modify: `.app-connection-name-btn` and `.tds-breadcrumbs` locators to role or label locators only)

Worker-owned phase records:
- `docs/plans/ui-redesign/phase-03/notes.md` (append `## Task <M>` blocks)
- `docs/plans/ui-redesign/phase-03/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`; never write a journal at the repo root)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
- task-1: RED first. Write `test/unit/renderer-shell.test.tsx` (jsdom, Testing Library, user-event): pane layout persists through a remount with a mocked `localStorage`; viewer panel is absent when no viewer target exists and present when one exists; every toolbar icon button has an accessible name and shows a tooltip on hover or focus; the sidebar connection button is reachable by role and name; the breadcrumb is a `navigation` named "Breadcrumb"; the no-connection empty state renders when no connections exist. Show each fails before the change.
- task-2: Add resizable, alert, empty, breadcrumb primitives per D-P3-1 and D-P3-2. Pin `react-resizable-panels` 4.18.1. Build sidebar, main, and viewer panels in `App.tsx`; collapse or omit the viewer panel when no target exists without layout shift in the other panes.
- task-3: Migrate the sidebar to `tds-side-nav` and `tds-nav-list`/`tds-nav-item` classes with a visible `--border-focus` focus ring; the toolbar to `ui/button` with `ui/tooltip`; the breadcrumb to `ui/breadcrumb`; the SSO and session banners to `ui/alert` with TDS announcement classes; add the no-connection empty state via `ui/empty`. Search must still cancel on navigation.
- task-4: Change the e2e `.app-connection-name-btn` and `.tds-breadcrumbs` locators to role or label locators. TDS Rule 10 self-check on new or changed components (run `tds rules`); record the checklist in notes.

## Done When
- Pane sizes survive a remount in the DOM test; every toolbar icon button has an accessible name and tooltip; e2e uses no `.app-*` or `.tds-*` selector for the sidebar or breadcrumb.
- Scanner passes on all new and changed files.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 25 files, 580 tests; counts may only grow)
  - `pnpm build` (Baseline: exit 0)
  - `xvfb-run -a pnpm e2e` (Baseline: 1 passed; requires Docker)

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/ui-redesign/phase-03/journal.md`, then return that block and the matching status line from `erp.md`.
