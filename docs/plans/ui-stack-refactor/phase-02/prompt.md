# Phase 2: Base UI primitives

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: The `components/ui` wrappers use `@base-ui/react` 1.9.0 instead of Radix. No Radix import remains. Dialogs return focus correctly through Base UI `finalFocus`, falling back to the grid when the opener is gone. The visual output is unchanged.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-02/base`
- Prior State: Phase 1 is done. Biome 2.6.6 is configured in `biome.jsonc`, not `biome.json`. Checks at base: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test --maxWorkers=2` 739 passed + 1 expected fail (`it.fails` focus-return test in `test/unit/renderer-dialogs.test.tsx`); `pnpm build` exit 0; e2e 1 passed. Plain `pnpm test` times out under machine load, so always pass `--maxWorkers=2`.
- Code Context:
  - Wrappers in `src/renderer/src/components/ui/{alert-dialog,button,context-menu,dialog,sheet,tooltip}.tsx` import from `radix-ui`. `button.tsx` uses Slot for `asChild`.
  - `ui/dialog.tsx` and `ui/alert-dialog.tsx` each hold a module-level `focusin` tracker to restore focus on close. Delete both.
  - Callers: `src/renderer/src/components/{ObjectTable,Sidebar,Toolbar,TransfersDrawer,Viewer}.tsx` plus any dialog component that passes `asChild`, `onSelect`, `onCloseAutoFocus`, or other Radix props. Find them with `grep -rn "asChild\|onSelect\|onCloseAutoFocus\|onOpenAutoFocus\|radix" src/renderer`.
  - Rename can be opened from a row context-menu item in `ObjectTable.tsx`. The table grid has `role="grid"`. Rows are virtualized, so the opener may be unmounted when a dialog closes.
  - TDS CSS in `src/renderer/src/styles/tds/{dialog,tooltip,dropdown-panel,action-list-item}.css` targets Radix `data-state` attributes. Change selectors only, to Base UI data attributes such as `data-open`, `data-closed`, `data-starting-style`, `data-ending-style`, `data-highlighted`, `data-side`.
  - `ui/select.tsx` and `ui/checkbox.tsx` are native elements and stay native.

## Invariants & Boundaries
- Preserve: visual output and `tds-*` class names on the new parts; every accessible name and role used by `e2e/app.spec.ts` and unit tests unless a locator must change; `src/main/**`, `src/preload/**`, `src/shared/**` untouched; CSP and `webPreferences` untouched.
- Verify first: before writing code, use `npx ctx7@latest library "Base UI" "<question>"` then `npx ctx7@latest docs <id> "<question>"` to confirm the 1.9.0 APIs for Dialog `finalFocus`, the `render` prop and `useRender`, Dialog Backdrop/Portal/Popup structure, ContextMenu, Tooltip Provider/Positioner, AlertDialog, and data attributes. Record the confirmed signatures in notes. Max 3 ctx7 commands per question.
- Out of Scope: any dependency other than `@base-ui/react` pinned exactly `1.9.0` (add via `pnpm add -E @base-ui/react@1.9.0`; if pnpm adds `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml`, keep them and say so in notes) and the removal of `radix-ui`; `shadcn add` with `--overwrite`; restyling; React Hook Form, TanStack Query, Zustand; any file under `docs/` except your phase records; `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (modify: via pnpm only)
- `src/renderer/src/components/ui/{alert-dialog,button,context-menu,dialog,sheet,tooltip}.tsx` (modify)
- `src/renderer/src/components/*.tsx` (modify: only to move off Radix props)
- `src/renderer/src/App.tsx` (modify: only to move off Radix props or the tooltip provider)
- `src/renderer/src/styles/tds/{dialog,tooltip,dropdown-panel,action-list-item}.css` and other `styles/tds/*.css` (modify: data-attribute selectors only)
- `test/unit/renderer-*.test.tsx`, `test/unit/dom-setup.ts` (modify: Radix-specific setup, locators, `waitFor` for exit timing, new focus tests)
- `e2e/app.spec.ts` (modify: only where a locator changes)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-02/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-02/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, other dependencies, or secrets.

## Tasks
- task-1: Add `@base-ui/react@1.9.0`. Port `button` from Slot to `useRender` or the `render` prop. Port `dialog`, `alert-dialog`, and `sheet` with Backdrop and Popup as siblings inside the Portal. Keep the exported component names so callers change as little as possible.
- task-2: Delete both `focusin` trackers. Use `finalFocus` on the dialog popups. When the opener is disconnected or not focusable, focus the table grid (`[role="grid"]`). In `test/unit/renderer-dialogs.test.tsx`, change the Phase 1 `it.fails` focus-return test to plain `it`, give it `{ timeout: 15000 }`, and restore the `HTMLElement.prototype.clientHeight` and `clientWidth` overrides in `afterEach` or `try/finally`. Add a test for focus return when the opener row is unmounted.
- task-3: Port `context-menu` and `tooltip`. Callers move from `asChild` to `render` and from `onSelect` to `onClick`. Context-menu row state stays in React state. Keyboard context-menu opening at the active row (Shift+F10 or the ContextMenu key, if supported today) keeps working.
- task-4: Remove `radix-ui` from `package.json` with `pnpm remove radix-ui`. Use `waitFor` for exit-animation unmounts in tests; never fixed sleeps.

## Done When
- `grep -rn "radix-ui" src package.json` prints nothing.
- `grep -rn "asChild\|onCloseAutoFocus" src/renderer` prints nothing.
- The Phase 1 focus test passes as plain `it`; closing a dialog opened from a context-menu item focuses the grid.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 739 passed + 1 expected fail; now 0 expected fails and at least 741 passed)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-02/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-02/journal.md`, then return that block and the matching status line from `erp.md`.
