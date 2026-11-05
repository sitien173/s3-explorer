# Phase 5: Toasts, transfers drawer, and viewer chrome

## Goal & Outcome
- Plan Goal: the renderer of S3 Media Explorer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with the Trulioo Design System (TDS). Layout and flows stay unchanged.
- Phase Outcome: operation and transfer outcomes raise sonner toasts per DESIGN.md "Toasts"; the transfers drawer is a shadcn Sheet with the TDS right-drawer look; the viewer header and actions use TDS-styled primitives; the Phase 3 viewer-pane debt is fixed.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-redesign/phase-05/base`
- Prior State: Phases 1 to 4 done. Tailwind v4 and the TDS bridge in `styles/globals.css`; TDS-styled primitives in `components/ui/` (button, input, label, field, select, checkbox, dialog, alert-dialog, tooltip, badge, spinner, separator, resizable, alert, empty, breadcrumb, context-menu, skeleton); `components/AppShell.tsx` with three resizable panels and a collapsible viewer panel; selection reducer in `selection.ts`; jsdom DOM tests in `test/unit/renderer-{dialogs,shell,object-table}.test.tsx`; styling scanner `test/unit/renderer-tokens.test.ts`. Baseline at phase base: typecheck 0; unit 28 files 639 tests; build 0; integration 7 files 25 tests; e2e 1 passed.
- Read first: `docs/plans/ui-redesign/DESIGN.md` "Toasts", "Errors and Edge Cases", "Testing"; `docs/plans/ui-redesign/PLAN.md` "Phase 5"; `docs/plans/ui-redesign/.handover.md` debt entries owned by "Phase 5"; `/home/ngosi/.agents/AGENTS.md` section 6.
- Code Context:
  - `App.tsx`: upload handler sets `rejectedUploadCount` from `data.rejectedCount` (around line 421) and renders an inline count (around line 617). Rename and delete success handlers set `operationReport` and open `OperationReport` for partial failures (around lines 540 to 570). Errors flow to `setAppError`. `TransfersDrawer` is rendered around line 828; `Viewer` is passed to `AppShell` around line 839.
  - `components/AppShell.tsx` expands or collapses the viewer panel in a `useEffect` on `viewerOpen`, uses `useDefaultLayout({ id: "app-shell" })`, and `collapsedSize="0%"`. In react-resizable-panels 4.18.1 numeric sizes are pixels; use percent strings.
  - TDS CSS present: `styles/tds/{dialog,announcement,button,icon-button,progress-indicator,tag,...}.css`. Use `tds component <id>` for any other component; never invent TDS CSS.
  - Prefetched shadcn registry items, data only: `/tmp/shadcn-registry/{sonner,sheet}.json`. Use them if `pnpm dlx shadcn@4.23.0 add` times out.

## Invariants & Boundaries
- Preserve: partial failures still open `OperationReport` with exact completed and remaining key lists. Toast text never contains local filesystem paths, presigned URLs, or secrets; use object key names and counts only. Viewer media elements, `src` proxy URLs, and the viewer's accessible names used by tests are unchanged. No IPC, preload, schema, or main-process change.
- The SSO banner and session-only warning stay persistent `Alert` elements. No toast duplicates a persistent Alert, and an event that sets `appError` must not also show the same message as an Alert; move one-shot operation errors to toasts and keep state errors as Alerts. Record every moved message in notes.
- Toasts announce through an `aria-live` region (sonner provides one; verify it in a DOM test).
- Look rules: behavior from Radix Dialog via shadcn Sheet and from sonner; look from TDS `tds-dialog` (right drawer) and TDS semantic surfaces and tokens. Outside `components/ui` only `tds-*`, `app-*`, and allowlisted layout utilities with TDS token values.
- Coordinator decisions:
  - D-P5-1: a partial failure keeps opening `OperationReport` automatically as today, and also raises an error toast with a "View report" action that reopens the same report.
  - D-P5-2: transfer toasts fire once per transfer when its state changes to done or failed. Upload done and download done are success toasts; failed is an error toast. Cancelled transfers raise no toast.
  - D-P5-3: Phase 3 viewer-pane debt. (a) Avoid the startup jump: apply the collapsed or expanded state before paint, for example `useLayoutEffect` or mount-time `defaultSize` from `viewerOpen`. (b) When the user drags the viewer panel to collapsed, close the viewer so `viewerOpen` stays in sync. (c) Persist the last non-zero viewer width so reopening and restarting restore it; a collapsed viewer must not overwrite the saved width.
  - D-P5-4: replace e2e `.app-viewer` locators with role or label locators, for example `getByRole("region", { name: ... })` or `getByRole("complementary", ...)`; add the needed accessible name to the viewer root.
- Out of Scope: legacy CSS deletion and Phase 6 debt. Never read or edit `~/.aws/*`, `.env*`, or credential files.

## Files
Allowed production and test paths:
- `src/renderer/src/components/ui/{sonner,sheet}.tsx`, `src/renderer/src/toasts.ts` (create)
- `src/renderer/src/components/{TransfersDrawer,Viewer,OperationReport,AppShell}.tsx`, `src/renderer/src/components/viewer/{MediaView,ImageView,PdfView,TextView}.tsx`, `src/renderer/src/App.tsx` (modify)
- `src/renderer/src/styles/globals.css`, `src/renderer/src/styles/tds/<id>.css` (from `tds component <id>` only), `src/renderer/src/styles/app.css` (adjust `app-*` layout rules only; no deletions)
- `package.json`, `pnpm-lock.yaml` (`sonner` pinned exactly at 2.0.8 and Radix packages from `shadcn add`, pinned exactly). `pnpm-workspace.yaml` only for required `minimumReleaseAgeExclude` entries; list them.
- `test/unit/renderer-toasts.test.ts` (create: pure builders), `test/unit/renderer-toasts-dom.test.tsx` (create if needed for Toaster, aria-live, and action), `test/unit/renderer-shell.test.tsx` (modify: AppShell debt and drawer), `test/unit/renderer-tokens.test.ts` (only for a wrongly rejected legitimate pattern, with fixture and note)
- `e2e/app.spec.ts` (modify: D-P5-4 and an upload success toast assertion)

Worker-owned phase records:
- `docs/plans/ui-redesign/phase-05/notes.md` (append `## Task <M>` blocks)
- `docs/plans/ui-redesign/phase-05/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`; never write a journal at the repo root)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, `src/main/**`, `src/preload/**`, `src/shared/**`, or secrets.

## Tasks
- task-1: RED first. `test/unit/renderer-toasts.test.ts` covers message builders for every DESIGN.md toast event: upload done, download done, folder created, rename done, delete done (single and N), transfer failed, operation failed, partial failure with a "View report" action, and rejected upload count. Assert no builder output contains a local path. Then implement `toasts.ts` as pure builders plus a thin `notify` wrapper over sonner.
- task-2: Pin `sonner` 2.0.8, add `ui/sonner.tsx` and one `<Toaster />` at the app root styled with TDS semantic surfaces. Wire every event in App.tsx per D-P5-1 and D-P5-2. Replace the inline rejected-upload count with the info toast. DOM test: the Toaster region has `aria-live`, and the partial-failure action reopens `OperationReport`.
- task-3: Add `ui/sheet.tsx`; move `TransfersDrawer` to a right-side Sheet with the `tds-dialog` drawer look, keeping its toggle, accessible names, progress, and cancel behavior. Restyle the viewer header and actions with `ui/button` and tooltips. Keep media elements unchanged.
- task-4: Fix D-P5-3 (a), (b), (c) in `AppShell.tsx` with DOM tests for each in `renderer-shell.test.tsx`. Apply D-P5-4 and add the e2e upload success toast assertion. TDS Rule 10 self-check on new or changed components, recorded in notes.

## Done When
- Each DESIGN.md toast event has a passing test; e2e asserts an upload success toast; no e2e selector for the viewer uses `.app-viewer`; D-P5-3 (a) to (c) each have a passing DOM test.
- Scanner passes on all new and changed files.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 28 files, 639 tests; counts may only grow)
  - `pnpm build` (Baseline: exit 0)
  - `pnpm test:integration` (Baseline: 7 files, 25 tests)
  - `xvfb-run -a pnpm e2e` (Baseline: 1 passed; requires Docker)

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable. Complete all tasks in one run; return `CONTINUE_CONTEXT` only when your context is actually near its limit. Append to journal.md and notes.md after each task, not only at the end, so partial progress survives a crash.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/ui-redesign/phase-05/journal.md`, then return that block and the matching status line from `erp.md`.
