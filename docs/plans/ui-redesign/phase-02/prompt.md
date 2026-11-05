# Phase 2: TDS-styled primitives and all dialogs

## Goal & Outcome
- Plan Goal: the renderer of S3 Media Explorer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with the Trulioo Design System (TDS). Layout and flows stay unchanged.
- Phase Outcome: shadcn primitives exist under `src/renderer/src/components/ui/` with TDS look classes, and every dialog uses shadcn Dialog or AlertDialog. The custom `components/Dialog.tsx` is deleted.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-redesign/phase-02/base`
- Prior State: Phase 1 done. Tailwind v4, `components.json` (new-york style, Radix base, aliases resolve to `src/renderer/src/...`), `lib/utils.ts` `cn()`, `styles/globals.css` with layered TDS imports from `styles/tds/<id>.css` and the `@theme inline` bridge, CSP `style-src 'self' 'unsafe-inline'`, jsdom setup in `test/unit/dom-setup.ts` (unit include `test/unit/**/*.test.{ts,tsx}`; DOM tests opt in with `// @vitest-environment jsdom`), and a styling scanner in `test/unit/renderer-tokens.test.ts`. Baseline at phase base: typecheck 0; unit 24 files 573 tests; build 0; integration 7 files 25 tests; e2e 1 passed.
- Read first: `docs/plans/ui-redesign/DESIGN.md` sections "Components", "Constraints, Invariants, and Non-Goals", "Testing"; `docs/plans/ui-redesign/PLAN.md` "Phase 2"; `/home/ngosi/.agents/AGENTS.md` section 6 (shadcn/ui + TDS rules, Button mapping).
- Code Context:
  - `components/Dialog.tsx` is the custom dialog (TDS `tds-dialog` center markup, focus trap, Escape, focus return). Users: `ConnectionDialog`, `AddBucketDialog`, `RenameDialog`, `ConfirmDeleteDialog`, `OpenUrlDialog`, `OperationReport`, and the inline "New folder" dialog in `App.tsx`.
  - TDS CLI: `tds rules`, `tds component <id>` (JSON with CSS and markup) are the source of truth. Already present in `styles/tds/`: button, icon-button, text-input, select, checkbox, field-label, field-caption, field-validation, dialog, data-table, breadcrumb, announcement, side-nav, nav-list, nav-item, spinner, progress-indicator, tag.
  - e2e (`e2e/app.spec.ts`) uses: dialog names "Add connection", "Open URL", "Rename or move object", "Delete object"; buttons "Manual Credentials", "Save connection", "Open", "Rename", "Delete"; labels "Connection name (required)", "Region (required)", "Access Key ID (required)", "Secret Access Key (required)", "Endpoint URL", "Force path-style URLs (required for MinIO / LocalStack)" (`.check()`), "URL (required)", "Signing connection" (`.inputValue()`), "Target key (required)".

## Invariants & Boundaries
- Preserve: every dialog accessible name, field label, and button name listed above. Dialog submit logic, validation, and IPC calls are unchanged. No IPC, preload, schema, or main-process change.
- Look rules (DESIGN.md D3 and AGENTS.md section 6): behavior from Radix, look from TDS. Keep the shadcn component files and swap `cva` classes for TDS classes. Button: `default`->`tds-btn--primary`, `secondary`/`outline`->`tds-btn--secondary`, `destructive`->`tds-btn--danger`, `ghost`->`tds-btn--invisible`, sizes `sm`/`default`/`lg`->`tds-btn--sm`/`--md`/`--lg`, `size="icon"`->`tds-icon-btn` (with its TDS variant and size classes). Components with no TDS match are styled with bridged colors and TDS tokens only. App TSX outside `components/ui` may use only `tds-*`, `app-*`, and allowlisted layout utilities with TDS token values. No raw color, type, radius, or shadow utility anywhere outside the bridge.
- Radix behavior kept: no `onOpenAutoFocus` or `onCloseAutoFocus` override without a written reason in notes; every Dialog and AlertDialog has a Title (and a Description or `aria-describedby={undefined}` with reason).
- No TDS CSS may be invented. New TDS CSS comes only from `tds component <id>` output, saved to `styles/tds/<id>.css` and imported in `globals.css` with `layer(components)` in a sensible order. The TDS loader strips `@import`, so fetch shared atoms (`dropdown-panel`, `field-label`, `field-caption`, `field-validation`) manually where a component needs them.
- Coordinator decisions:
  - D-P2-1: Radix AlertDialog renders `role="alertdialog"`. The destructive "Delete object" confirmation uses AlertDialog, so change only that e2e locator from `getByRole("dialog", { name: "Delete object" })` to `getByRole("alertdialog", { name: "Delete object" })`. All other e2e lines stay unchanged in this phase.
  - D-P2-2: form selects inside dialogs (ConnectionDialog profile/auth select, OpenUrlDialog "Signing connection") stay native `<select>` elements, because e2e reads them with `inputValue()` and native selects keep platform keyboard behavior. Implement `components/ui/select.tsx` as a TDS-styled native select wrapper using `tds-select` classes (use shadcn `native-select` from `shadcn add` if 4.23.0 provides it, adapted to TDS; otherwise write the wrapper by hand). Do not add Radix Select in this phase.
- Out of Scope: shell, sidebar, toolbar, breadcrumb, banners (Phase 3); object table and context menus (Phase 4); toasts, transfers drawer, viewer (Phase 5); legacy CSS deletion (Phase 6). Never read or edit `~/.aws/*`, `.env*`, or credential files.

## Files
Allowed production and test paths:
- `src/renderer/src/components/ui/{button,input,label,field,select,checkbox,dialog,alert-dialog,tooltip,badge,spinner,separator}.tsx` (create via `pnpm dlx shadcn@4.23.0 add <names>` where available, then swap look to TDS)
- `src/renderer/src/styles/tds/{tooltip,caret,dropdown-panel,action-list-item}.css` (create from `tds component <id>`)
- `src/renderer/src/styles/globals.css` (modify: import new TDS files)
- `src/renderer/src/components/{ConnectionDialog,AddBucketDialog,RenameDialog,ConfirmDeleteDialog,OpenUrlDialog,OperationReport}.tsx` (modify: migrate to ui primitives)
- `src/renderer/src/App.tsx` (modify: new-folder dialog only, and the `Dialog` import)
- `src/renderer/src/components/Dialog.tsx` (delete)
- `src/renderer/src/styles/app.css` (modify only if a migrated dialog needs an existing `app-*` layout rule adjusted; do not delete legacy rules, that is Phase 6)
- `package.json`, `pnpm-lock.yaml` (modify: Radix packages installed by `shadcn add`, pinned exactly; no other new deps). If pnpm adds `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml`, that file is in scope for those entries only; list them.
- `test/unit/renderer-dialogs.test.tsx` (create)
- `test/unit/renderer-tokens.test.ts` (modify only if a scanner rule wrongly rejects a legitimate shadcn+TDS pattern; explain each change in notes and add a fixture)
- `e2e/app.spec.ts` (modify: the single D-P2-1 locator)

Worker-owned phase records:
- `docs/plans/ui-redesign/phase-02/notes.md` (append `## Task <M>` blocks)
- `docs/plans/ui-redesign/phase-02/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`; never write a journal at the repo root)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
- task-1: `pnpm dlx shadcn@4.23.0 add` the primitives (button, input, label, field, checkbox, dialog, alert-dialog, tooltip, badge, spinner, separator, and native-select if present). Pin every installed package exactly in `package.json` (no `^`/`~`). Swap each `cva` and class string to TDS classes per DESIGN.md "Components" and the Button mapping. Fetch `tds component tooltip|caret|dropdown-panel|action-list-item` CSS into `styles/tds/` and import them. Field/Label/Input use `tds-text-input`, `tds-field-label`, `tds-field-caption`, `tds-field-validation`; Checkbox `tds-checkbox`; Dialog and AlertDialog `tds-dialog` center markup (backdrop, panel, header, title, dismiss icon button with accessible name "Dismiss", divider, body, footer); Badge `tds-tag`; Spinner `tds-spinner`.
- task-2: RED first. Write `test/unit/renderer-dialogs.test.tsx` (`// @vitest-environment jsdom`, Testing Library, user-event). For each of the six dialog components and the new-folder dialog: it exposes the e2e accessible name, labels, and button names; focus moves into it on open and is trapped; Escape closes it; focus returns to the trigger on close. Mock `window.api` (see `src/renderer/src/api.ts`) as needed. Show the tests fail against the current custom Dialog where they assert new behavior (for example the `alertdialog` role), then pass after migration.
- task-3: Migrate the six components and the new-folder dialog to `ui/dialog` or `ui/alert-dialog`. `ConfirmDeleteDialog` and any other destructive confirmation use AlertDialog with a `tds-btn--danger` action. Replace raw `tds-btn` buttons inside these dialogs with `ui/button`. Delete `components/Dialog.tsx`; no import of `components/Dialog` remains. Apply the D-P2-1 e2e locator change.
- task-4: TDS Rule 10 self-check on every new or changed component (run `tds rules`), record the checklist result in notes.

## Done When
- No import of `components/Dialog` remains (`grep -rn "components/Dialog\"\|./Dialog\"" src/renderer/src` returns nothing).
- DOM dialog tests pass. e2e passes with dialog selectors unchanged except the D-P2-1 role.
- Scanner passes on all new and changed files.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 24 files, 573 tests; counts may only grow)
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
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/ui-redesign/phase-02/journal.md`, then return that block and the matching status line from `erp.md`.
