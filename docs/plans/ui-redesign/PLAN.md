# Renderer UI Redesign Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `ui-redesign`
**Base:** `refs/plans/ui-redesign/base` (`ff36a84065c6b8432102c0340a7dae50376f71c4`)
**Commit:** `feat(renderer): migrate UI to Tailwind v4 and shadcn/ui with TDS styling`

## Outcome & Scope

Goal: the renderer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with TDS. It gains keyboard navigation, context menus, toasts, skeleton and empty states, and resizable panes. Layout and flows are unchanged.

Preserved invariants: DESIGN.md invariants 1 to 6. No IPC, schema, or preload change. The main process changes only in the `CSP` constant.

Out of scope: DESIGN.md non-goals. Secret-bearing files such as `~/.aws/*`, `.env*`, and any local credential file are never read or edited.

## Baseline Evidence

Run at `ff36a84` on 2026-11-05 with a clean root.

- `pnpm typecheck`: exit 0.
- `pnpm test`: 23 files, 565 tests passed.
- `pnpm build`: exit 0.
- `pnpm test:integration`: 7 files, 25 tests passed. Requires Docker.
- `xvfb-run -a pnpm e2e`: 1 passed. Requires Docker.

Every phase runs the five commands above. Counts may only grow.

### Phase 1: Toolchain, token bridge, and scanner with no visible change

**Task Guide Input:** Frontend implementation. Add Tailwind v4 and shadcn/ui configuration to an electron-vite renderer, bridge shadcn variables to TDS tokens, split TDS CSS into per-component files, rewrite the styling scanner, add a jsdom DOM test setup, and change the CSP.
**Goal:** The new toolchain is live and enforced, and the app looks and behaves as at base.
**Invariants & Boundaries:** No TSX markup change except `main.tsx` imports. `components.css` content moves byte for byte. `CSP` and the meta CSP stay identical. Only `style-src` changes.
**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `electron.vite.config.ts`, `tsconfig.web.json`, `vitest.config.ts`
- Modify: `src/renderer/src/main.tsx`, `src/renderer/index.html`, `src/main/window.ts`
- Modify: `test/unit/renderer-tokens.test.ts`, `test/unit/window.test.ts`, `e2e/app.spec.ts`
- Create: `components.json`, `src/renderer/src/lib/utils.ts`, `src/renderer/src/styles/globals.css`, `src/renderer/src/styles/tds/<id>.css` for each of the 18 markers in `components.css`, `test/unit/dom-setup.ts`
- Delete: `src/renderer/src/styles/components.css`
**Tasks:**
1. Pin and install `tailwindcss` 4.3.4, `@tailwindcss/vite` 4.3.4, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.68.0, and the dev deps `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8. Add the Tailwind plugin to `renderer.plugins` for serve and build. Add `@/*` paths to `tsconfig.web.json`. Write `components.json` and `lib/utils.ts` with `cn()`. Confirm with `pnpm dlx shadcn@4.23.0 info`.
2. Split `components.css` into `styles/tds/<id>.css`. Write `globals.css` with the layer order, `@theme` clears, and the `@theme inline` bridge from DESIGN.md. Import `tokens.css`, each TDS file, and `app.css` in layers. `main.tsx` imports only `globals.css`.
3. RED first: rewrite `renderer-tokens.test.ts` fixtures for every scanner rule in DESIGN.md except the unreferenced-selector rule, which lands in Phase 6. Then rewrite the scanner until fixtures and the real-file scan pass.
4. Change `style-src` to `'self' 'unsafe-inline'` in `CSP` and in `index.html`. Update `window.test.ts`. Add the jsdom setup file and widen the unit include to `.test.{ts,tsx}`. Add e2e computed-style assertions: `--color-neutral-100` equals its `tokens.css` value, `--radius-md` equals `0.375rem`, and body background equals `--surface-neutral-01`. Save before and after screenshots of the main screen and the connection dialog under `test-results/`.
**Acceptance Criteria:**
- `pnpm dlx shadcn@4.23.0 info` reports Tailwind v4, the Radix base, and the `@/components/ui` alias.
- Concatenating `styles/tds/*.css` in marker order reproduces `components.css` at base, apart from the marker split.
- Scanner fixtures fail for each forbidden pattern and pass for each allowed pattern.
- e2e computed-style assertions pass. Before and after screenshots exist.
**Reviewer Checklist:**
- No `.dark`, `@custom-variant dark`, shadcn `--radius`, or `calc(var(--radius)` in `globals.css`.
- Every bridge row matches the AGENTS.md table.
- `script-src` is still `'self'`, and no other CSP directive changed.
- Screenshots show no visible regression from preflight. Any difference is listed in the journal.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:integration`
- `xvfb-run -a pnpm e2e`

### Phase 2: TDS-styled primitives and all dialogs

**Task Guide Input:** Frontend implementation. Add shadcn primitives with TDS look classes and migrate every dialog to shadcn Dialog or AlertDialog.
**Goal:** All dialogs use shadcn primitives with TDS classes. The custom `Dialog.tsx` is gone.
**Invariants & Boundaries:** Dialog accessible names, field labels, and button names used by `e2e/app.spec.ts` stay exactly the same. Dialog submit logic and IPC calls are unchanged.
**Files:**
- Create: `src/renderer/src/components/ui/{button,input,label,field,select,checkbox,dialog,alert-dialog,tooltip,badge,spinner,separator}.tsx`
- Create: `src/renderer/src/styles/tds/{tooltip,caret,dropdown-panel,action-list-item}.css` from `tds component <id>`
- Modify: `src/renderer/src/components/{ConnectionDialog,AddBucketDialog,RenameDialog,ConfirmDeleteDialog,OpenUrlDialog,OperationReport}.tsx`, `src/renderer/src/App.tsx` for the new-folder dialog, `src/renderer/src/styles/globals.css`, `package.json`, `pnpm-lock.yaml`
- Delete: `src/renderer/src/components/Dialog.tsx`
- Create: `test/unit/renderer-dialogs.test.tsx`
**Tasks:**
1. `shadcn add` the primitives with exact pins. Swap each `cva` string for TDS classes per the DESIGN.md component table and the Button mapping.
2. RED first: DOM tests that each dialog exposes the e2e names and labels, traps focus, closes on Escape, and returns focus to its trigger.
3. Migrate the six dialog components and the new-folder dialog. Destructive confirmations use AlertDialog.
**Acceptance Criteria:**
- No import of `components/Dialog` remains.
- DOM dialog tests pass. e2e passes with unchanged dialog selectors.
**Reviewer Checklist:**
- Radix behavior is kept: no `onOpenAutoFocus` override without a reason, and every Dialog has a Title.
- No raw color, type, radius, or shadow utility outside `components/ui`.
- `tds component` output was used, and no TDS CSS was invented.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 3: Shell, navigation, and resizable panes

**Task Guide Input:** Frontend implementation. Migrate the sidebar, toolbar, breadcrumb, search bar, and banners to shadcn with TDS, and add resizable persisted panes.
**Goal:** The app shell uses shadcn primitives and TDS navigation classes inside a three-pane resizable layout.
**Invariants & Boundaries:** Sidebar and toolbar accessible names used by e2e stay the same. Search still cancels on navigation.
**Files:**
- Create: `src/renderer/src/components/ui/{resizable,alert,empty}.tsx`
- Modify: `src/renderer/src/components/{Sidebar,Toolbar,Breadcrumb,SearchBar,SsoBanner}.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles/globals.css`, `package.json`, `pnpm-lock.yaml`, `e2e/app.spec.ts`
- Create: `test/unit/renderer-shell.test.tsx`
**Tasks:**
1. `shadcn add resizable alert empty` and pin `react-resizable-panels` 4.18.1. Build sidebar, main, and viewer panels with `autoSaveId`. Collapse the viewer panel when no target exists.
2. Migrate the sidebar to `tds-side-nav` classes, the toolbar to Button with Tooltip, the breadcrumb to shadcn Breadcrumb with TDS classes, and the SSO and session banners to Alert. Add the "no connection" empty state.
3. Move e2e selectors `.app-connection-name-btn` and `.tds-breadcrumbs` to role or label selectors.
**Acceptance Criteria:**
- Pane sizes survive an app restart in a DOM test with a mocked `localStorage`.
- Every toolbar icon button has an accessible name and a tooltip.
- e2e passes with no `.app-*` selector for the sidebar or breadcrumb.
**Reviewer Checklist:**
- The side nav keeps a visible focus ring from `--border-focus`.
- No layout shift when the viewer opens or closes.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 4: Object table selection, keyboard map, context menus, and loading states

**Task Guide Input:** Frontend implementation. Replace single selection with a multi-selection reducer, add the ARIA grid keyboard map, add context menus on rows and buckets, and add skeleton and empty states.
**Goal:** The object table meets DESIGN.md "Object table" and "Context menus" exactly.
**Invariants & Boundaries:** Virtualization holds: at most 40 row elements for 10,000 objects. Multi-object delete uses the existing `opsDelete` channel. No IPC change.
**Files:**
- Create: `src/renderer/src/selection.ts`, `src/renderer/src/components/ui/{context-menu,skeleton}.tsx`, `test/unit/selection.test.ts`, `test/unit/renderer-object-table.test.tsx`
- Modify: `src/renderer/src/components/{ObjectTable,ConfirmDeleteDialog,Sidebar}.tsx`, `src/renderer/src/App.tsx`, `e2e/app.spec.ts`
**Tasks:**
1. RED first: unit tests for every selection transition and the keyboard-to-action map. Then implement `selection.ts` as a pure reducer.
2. RED first: DOM tests for the keyboard map, the `aria-activedescendant` row, and the virtualized row cap. Then wire the grid. `ConfirmDeleteDialog` accepts N keys and shows the exact count.
3. Add context menus for each target in DESIGN.md, calling the existing handlers. Check `navigator.clipboard.writeText` in e2e. If it fails, remove the copy items and log Q1 in the journal for the user.
4. Add skeleton rows while a page loads and empty states for empty bucket, empty folder, and no search results. Move the `.app-row-name` e2e selectors to grid row selectors. Add e2e steps for keyboard Delete and context-menu rename.
**Acceptance Criteria:**
- Every key in the DESIGN.md keyboard map has a passing DOM test.
- Context menu items match the DESIGN.md table for each target.
- A 10,000-row DOM test renders at most 40 rows.
- e2e passes, including the keyboard delete and context-menu rename steps.
**Reviewer Checklist:**
- Shortcuts do not fire from inputs or open dialogs.
- Selection clears on prefix, bucket, connection, and search change.
- Copy items never produce a presigned URL.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:integration`
- `xvfb-run -a pnpm e2e`

### Phase 5: Toasts, transfers drawer, and viewer chrome

**Task Guide Input:** Frontend implementation. Add sonner toasts for operation and transfer outcomes, move the transfers drawer to Sheet, and restyle the viewer chrome.
**Goal:** Outcomes raise toasts per DESIGN.md "Toasts", and the drawer and viewer use shadcn with TDS.
**Invariants & Boundaries:** Partial failures still open `OperationReport` with exact completed and remaining key lists. Toast text never contains local paths or secrets. Viewer media elements and proxy URLs are unchanged.
**Files:**
- Create: `src/renderer/src/components/ui/{sonner,sheet}.tsx`, `src/renderer/src/toasts.ts`, `test/unit/renderer-toasts.test.ts`
- Modify: `src/renderer/src/components/{TransfersDrawer,Viewer,OperationReport}.tsx`, `src/renderer/src/components/viewer/{MediaView,ImageView,PdfView,TextView}.tsx`, `src/renderer/src/App.tsx`, `package.json`, `pnpm-lock.yaml`, `e2e/app.spec.ts`
**Tasks:**
1. RED first: unit tests for toast message builders, covering success, failure, partial failure with a report action, and rejected uploads. Then implement `toasts.ts`.
2. Pin `sonner` 2.0.8, add the `Toaster`, and style it with TDS semantic surfaces. Replace the inline rejected-upload count.
3. Move `TransfersDrawer` to a Sheet with the `tds-dialog` right drawer look. Restyle the viewer header and actions. Move `.app-viewer` e2e selectors to role or label selectors. Add an e2e toast assertion after upload.
**Acceptance Criteria:**
- Each DESIGN.md toast event has a passing test.
- e2e asserts an upload success toast.
**Reviewer Checklist:**
- Toasts announce through an `aria-live` region.
- No toast duplicates a persistent Alert.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:integration`
- `xvfb-run -a pnpm e2e`

### Phase 6: Legacy CSS removal and final checks

**Task Guide Input:** Frontend implementation. Delete unreferenced legacy CSS, add the unreferenced-selector scanner rule, and update docs.
**Goal:** Only referenced styles remain, and the scanner enforces that.
**Invariants & Boundaries:** No behavior change. No new feature.
**Files:**
- Modify: `src/renderer/src/styles/app.css`, `src/renderer/src/styles/globals.css`, `test/unit/renderer-tokens.test.ts`, `README.md`, `docs/manual-checklist.md`
- Delete: any `src/renderer/src/styles/tds/<id>.css` that no TSX file references
**Tasks:**
1. RED first: add the unreferenced `app-*` selector rule with fixtures. Then delete every unreferenced rule from `app.css`, and delete `app.css` if it ends up empty.
2. Delete unused TDS files and their imports. Add keyboard shortcuts and context menus to `docs/manual-checklist.md` and `README.md`.
**Acceptance Criteria:**
- Scanner passes with the new rule.
- No e2e selector uses an `.app-*` class.
**Reviewer Checklist:**
- Deleted rules were truly unreferenced, including class names built in template literals.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:integration`
- `xvfb-run -a pnpm e2e`
