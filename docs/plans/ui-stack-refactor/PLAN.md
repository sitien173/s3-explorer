# UI Stack Refactor Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `ui-stack-refactor`
**Base:** `refs/plans/ui-stack-refactor/base` (`a7971eb65c99942237e4dd3f860fd7bc5ebc805a`)
**Commit:** `refactor(renderer): move UI to Base UI, RHF, TanStack Query, and an Apple-style layout`

## Outcome & Scope

The renderer runs on Base UI, React Hook Form with Zod 4, TanStack Query, and a Zustand shell store. Biome lints and formats the codebase. An Apple-style light and dark theme replaces TDS. The layout becomes a two-pane shell under a unified toolbar, with a command palette, a table and grid toggle with image thumbnails, and a Quick Look overlay.

Preserved invariants for every phase, from DESIGN.md:

1. Invariants 1 to 5 of `docs/plans/s3-media-explorer/DESIGN.md`. `webPreferences` in `src/main/window.ts` is not modified.
2. `CSP` in `src/main/window.ts` is unchanged and equals the meta CSP in `src/renderer/index.html`.
3. No IPC channel, schema, or preload API change. `src/shared/ipc.ts`, `src/shared/channels.ts`, and `src/preload/index.ts` are out of scope in every phase.
4. No presigned URL reaches the renderer.
5. Rendering is bounded by the viewport, not the listing size, per DESIGN.md invariant 5 as amended in Phase 1.
6. Every phase ends with all of its Verification Checks passing.

Out of scope: Next.js or any build change, an in-app theme toggle, vibrancy, main-side thumbnail resizing, video poster frames, a Base UI Select, a docked viewer, gestures, new IPC.

Secret-bearing paths are out of scope for every worker: `~/.aws`, any `.env*` file, and connection stores under the Electron `userData` directory.

## Baseline Evidence

Measured at `a7971eb` on 2026-11-07.

- `pnpm typecheck`: exit 0.
- `pnpm test --maxWorkers=2`: 31 files, 737 tests passed. Plain `pnpm test` timed out 5 or 6 tests at a load average of about 46 on 8 cores, with a different set each run. Every phase therefore uses `--maxWorkers=2`.
- `pnpm build`: exit 0.
- `xvfb-run -a pnpm e2e`: 1 test passed. It needs port 19000 free. A stale `rustfs` compose project held the port and was removed with user approval.
- `pnpm test:integration`: 7 of 8 files, 27 of 28 tests passed. The failure is a 60 s timeout in the test "deletes 2,500 keys in three batches and verifies all are gone". This environment timeout is known from the ui-redesign plan. Only Phase 8 runs this command, and it must not add new failures.
- `pnpm lint`: does not exist at base. Phase 1 creates it, and every later phase runs it.

Run e2e and integration one after the other, never at the same time.

### Phase 1: Biome and regression baseline

**Task Guide Input:** Add Biome as the linter and formatter. Land a format-only change. Enable lint rules with no behavior change. Add characterization tests that later phases rely on.
**Goal:** `pnpm lint` passes on a formatted codebase. Focus return and virtualization behavior are pinned by tests.
**Depends on:** none
**Invariants & Boundaries:** No behavior change. No dependency other than `@biomejs/biome` 2.6.6 pinned exactly. No file under `docs/plans` is formatted or linted.
**Files:**
- Create: `biome.jsonc` (renamed from `biome.json` in Phase 1 because per-rule reason comments need JSONC)
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify, formatting and lint fixes only: `src/**/*.{ts,tsx,css}`, `test/**/*.{ts,tsx}`, `e2e/**/*.ts`, `scripts/**/*.ts`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- Modify: `test/unit/renderer-dialogs.test.tsx`, `test/unit/renderer-object-table.test.tsx`
**Tasks:**
1. Add `biome.jsonc` with `formatter.indentStyle: "tab"`, `javascript.formatter.quoteStyle: "double"`, and `lineWidth: 120`. Ignore `out`, `dist`, `build`, `node_modules`, `test-results`, and `docs`. Add the scripts `"lint": "biome check ."` and `"format": "biome format --write ."`.
2. Run `pnpm format`. Report this format-only diff separately in the ERP, so the Coordinator can checkpoint it before Task 3.
3. Enable the Biome recommended rules. Fix violations with no behavior change. Disable a rule only in `biome.jsonc`, with a one-line reason per rule.
4. Add characterization tests:
   - focus returns to the grid after closing Rename opened from a context-menu item;
   - the table renders at most 40 rows for 10,000 objects at viewport heights 400 px and 1200 px.

   If a test fails against current behavior, mark it `test.fails` with a comment naming Phase 2.
**Acceptance Criteria:**
- `pnpm lint` exits 0.
- `git diff refs/plans/ui-stack-refactor/base -- src` after Task 2 contains whitespace, quote, and wrapping changes only.
- The new tests exist and pass, or are marked `test.fails` with a Phase 2 reference.
**Reviewer Checklist:**
- The format diff hides no logic change.
- Each disabled rule has a reason.
- Changes to the CSP string in `window.ts` and `index.html` are whitespace only, and the strings stay equal.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 2: Base UI primitives

**Task Guide Input:** Port the shadcn wrappers from Radix to `@base-ui/react` 1.9.0 and keep the current TDS look. Replace the module-level focus trackers with Base UI `finalFocus`. Frontend implementation.
**Goal:** No Radix import remains, and dialogs return focus correctly.
**Depends on:** Phase 1
**Invariants & Boundaries:** Visual output unchanged. Keep `tds-*` class names on the new parts. Native `ui/select.tsx` and `ui/checkbox.tsx` stay native. Do not run `shadcn add --overwrite`; port by hand. Before writing code, verify with ctx7 the Base UI 1.9.0 APIs for `finalFocus`, `render`, Dialog Backdrop and Popup, ContextMenu, Tooltip Positioner, and data attributes.
**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `src/renderer/src/components/ui/{alert-dialog,button,context-menu,dialog,sheet,tooltip}.tsx`
- Modify: `src/renderer/src/components/{ObjectTable,Sidebar,Toolbar,TransfersDrawer,Viewer}.tsx` and the dialog components that pass `asChild` or Radix props
- Modify: `src/renderer/src/styles/tds/{dialog,tooltip,dropdown-panel,action-list-item}.css` for data-attribute selectors only
- Modify: `test/unit/renderer-{dialogs,shell,object-table,transfers,appshell,toasts-dom}.test.tsx`, `test/unit/dom-setup.ts`, `e2e/app.spec.ts` only where locators change
**Tasks:**
1. Add `@base-ui/react` 1.9.0. Port `button` from Slot to `useRender` or `render`. Port `dialog`, `alert-dialog`, and `sheet` with Backdrop and Popup as siblings.
2. Delete both `focusin` trackers. Use `finalFocus`, falling back to the grid when the opener is disconnected. Flip any Phase 1 `test.fails`.
3. Port `context-menu` and `tooltip`. Callers move from `asChild` to `render` and from `onSelect` to `onClick`. Context-menu row state stays in React state.
4. Remove `radix-ui` from `package.json`.
**Acceptance Criteria:**
- `grep -rn "radix-ui" src package.json` prints nothing.
- `grep -rn "asChild\|onCloseAutoFocus" src/renderer` prints nothing.
- The focus tests from Phase 1 pass without `test.fails`.
- Closing a dialog opened from a context-menu item focuses the grid.
**Reviewer Checklist:**
- Base UI API usage matches the 1.9.0 docs.
- Exit-animation unmount timing is handled in tests with `waitFor`, not with sleeps.
- Keyboard context-menu anchoring at the active row still works.
- The debt items "stale or detached opener" and "duplicated focusin tracker" from ui-redesign are resolved.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 3: Forms on React Hook Form and Zod

**Task Guide Input:** Rebuild six dialog forms on `react-hook-form` 7.91.0 with `@hookform/resolvers` 7.0.3 and Zod 4 schemas. Frontend implementation.
**Goal:** Every in-scope form validates through a Zod schema and shows field errors through `ui/field.tsx`.
**Depends on:** Phase 2
**Invariants & Boundaries:**
- Label text and accessible names stay identical; e2e uses `getByLabel("... (required)")`.
- Reset-on-close, pending-submit guards, and the connection test-result behavior are preserved.
- Reuse the field schemas in `src/shared/ipc.ts` where they apply, by importing them, never by editing that file.
- `DeleteBucketDialog` stays a plain controlled input.
**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/renderer/src/forms.ts` with renderer-only schemas
- Modify: `src/renderer/src/components/{ConnectionDialog,RenameDialog,OpenUrlDialog,AddBucketDialog,CreateBucketDialog}.tsx`
- Modify: `src/renderer/src/App.tsx`, the new folder dialog only
- Modify: `test/unit/renderer-dialogs.test.tsx`
**Tasks:**
1. Write failing tests first for the validation messages and submit blocking of each form.
2. Migrate `ConnectionDialog`, then the five single-field forms.
3. Remove the `useState` form state that the migration orphans.
**Acceptance Criteria:**
- No in-scope dialog keeps `useState` for field values or field errors.
- Invalid input shows the field error and does not call the IPC API.
- e2e passes with unchanged label locators.
**Reviewer Checklist:**
- Schemas match the main-process limits in `src/shared/ipc.ts`.
- Double submit is blocked.
- Closing a dialog resets its form.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 4: Server state and shell store

**Task Guide Input:** Move IPC data fetching to `@tanstack/react-query` 5.107.1 and shared UI state to a `zustand` 5.1.0 store. Reduce `App.tsx` to providers and the shell. Frontend implementation.
**Goal:** Query owns all IPC request data. The store owns location, selection, viewer target, and dialog state.
**Depends on:** Phase 3
**Invariants & Boundaries:**
- Layout and look unchanged.
- Search and transfer progress stay event-driven subscriptions.
- Server data never enters the store.
- Mutations invalidate targeted query keys; refresh counters are removed.
- `api.ts` stays the only caller of `window.api`.
**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Create: `src/renderer/src/queries.ts`, `src/renderer/src/store.ts`, `src/renderer/src/Shell.tsx`
- Modify: `src/renderer/src/components/{Sidebar,ObjectTable,SearchBar,SsoBanner,Viewer,ConfirmDeleteDialog,ConnectionDialog,RenameDialog,AddBucketDialog,CreateBucketDialog,DeleteBucketDialog,OpenUrlDialog}.tsx`
- Create: `test/unit/renderer-queries.test.tsx`, `test/unit/renderer-store.test.ts`
- Modify: `test/unit/renderer-{shell,object-table,dialogs}.test.tsx`
**Tasks:**
1. Write `queries.ts` with one typed `queryOptions` factory per read channel, using `RequestByChannel` and `ResponseByChannel`. Make the listing an infinite query keyed by connection, bucket, and prefix. Tests first.
2. Write `store.ts` with transition tests first. Move shared state out of `App.tsx`.
3. Move components to the queries and mutations with targeted invalidation. Move the shell JSX to `Shell.tsx`.
**Acceptance Criteria:**
- `App.tsx` renders only `QueryClientProvider`, toaster, and `Shell`.
- Creating a bucket, deleting objects, and renaming refresh the affected list through invalidation.
- No `refresh` counter state remains.
**Reviewer Checklist:**
- Stale responses after rapid navigation are not shown.
- Query keys include the connection id.
- Error toasts still use the sanitized builders in `toasts.ts`.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 5: Apple-style theme with light and dark

**Task Guide Input:** Replace TDS styling with Apple-style tokens and Tailwind utilities. Load the `emil-design-eng`, `apple-design`, and `animate` skills first. Frontend implementation.
**Goal:** No TDS file or class remains, and the UI follows the system light or dark theme.
**Depends on:** Phase 4
**Invariants & Boundaries:**
- Layout unchanged; this phase is visual only.
- Inter stays bundled, as the Linux fallback after the system UI stack.
- Light and dark switch through `prefers-color-scheme` and `color-scheme`.
- Contrast for text and controls meets WCAG AA in both themes.
- Animations honor `prefers-reduced-motion`.
- `src/main` is out of scope.
**Files:**
- Modify: `src/renderer/src/styles/globals.css`
- Delete: `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/tds/`, `src/renderer/src/styles/app.css`
- Modify: every `.tsx` under `src/renderer/src/components`, `src/renderer/src/Shell.tsx`
- Modify: `src/renderer/src/components/ui/sonner.tsx` to remove forced light
- Modify: `test/unit/renderer-tokens.test.ts`, rewritten as a scanner that forbids `tds-` classes and raw color literals outside `globals.css`
- Modify: `e2e/app.spec.ts`, computed-style checks only
**Tasks:**
1. Rewrite the scanner test first, RED against the TDS sources.
2. Define light and dark semantic tokens in `globals.css` under `@theme`. Restyle `components/ui`.
3. Restyle feature components. Delete the TDS files, `tokens.css`, and `app.css`.
**Acceptance Criteria:**
- `ls src/renderer/src/styles` lists only `globals.css`.
- `grep -rn "tds-" src/renderer` prints nothing.
- With emulated `prefers-color-scheme: dark`, the e2e computed-style check reads the dark background token.
**Reviewer Checklist:**
- Dark theme contrast.
- Focus rings are visible in both themes.
- No color literal outside `globals.css`.
- Reduced motion is honored.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 6: Quick Look and Finder bindings

**Task Guide Input:** Replace the docked viewer pane with a Quick Look overlay dialog. Adopt the Finder interaction model. Frontend implementation.
**Goal:** Space or double-click opens Quick Look, arrows move between siblings, and click selects.
**Depends on:** Phase 5
**Invariants & Boundaries:**
- The key map is:

  | Input | Action |
  |---|---|
  | Click | Selects |
  | Ctrl or Shift+click | Extends the selection |
  | Space | Toggles Quick Look |
  | Enter or double-click | Opens a folder, or opens Quick Look on an object |
  | Ctrl+Space | Toggles selection |

  Input and dialog guards in `selection.ts` stay.
- `streamOpen` is debounced by 120 ms on arrow keys and cached with `staleTime: Infinity`. A 403 drops the cache entry and retries once.
- Media unloads and text requests abort on close or navigation.
- The overlay is portaled outside the scroller.
**Files:**
- Modify: `src/renderer/src/selection.ts`, `src/renderer/src/components/ObjectTable.tsx`, `src/renderer/src/components/AppShell.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`, `src/renderer/src/queries.ts`
- Create: `src/renderer/src/components/QuickLook.tsx`
- Delete: `src/renderer/src/components/Viewer.tsx`
- Keep: `src/renderer/src/components/viewer/*` as QuickLook content
- Modify: `test/unit/selection.test.ts`, `test/unit/renderer-object-table.test.tsx`, `test/unit/renderer-appshell.test.tsx`
- Create: `test/unit/renderer-quicklook.test.tsx`
- Modify: `e2e/app.spec.ts`; the preview locator becomes the Quick Look dialog
**Tasks:**
1. Write the key-map tests first, then change `selection.ts` and `ObjectTable.tsx`.
2. Build `QuickLook.tsx` with sibling navigation by index, the debounce, the cache, and retry-once on 403. Tests first.
3. Remove the viewer panel from `AppShell.tsx` and its saved-layout code. Delete `Viewer.tsx`. Update e2e.
**Acceptance Criteria:**
- Space on a selected object opens Quick Look. Space again or Escape closes it, and focus returns to that row.
- Arrow keys show the next and previous sibling.
- Space inside the search input types a space.
- e2e plays the video inside Quick Look.
**Reviewer Checklist:**
- No leaked `<video>` playback after close.
- Debounce and abort are correct.
- After close, focus and scroll restore to the current item in the virtualized list.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 7: Window chrome, unified toolbar, and command palette

**Task Guide Input:** Hide the native title bar and use a Linux title bar overlay that follows the theme. Merge the breadcrumb and toolbar into one draggable toolbar. Add a Cmd or Ctrl+K command palette. Main-process window change plus frontend implementation.
**Goal:** Two-pane window with a unified toolbar and a palette for navigation, bucket switching, and actions.
**Depends on:** Phase 6
**Invariants & Boundaries:**
- In `src/main/window.ts`, change only `buildWindowOptions`: add `titleBarStyle: "hidden"`, `titleBarOverlay`, and `backgroundColor`. Also add a `nativeTheme` `updated` listener that calls `setTitleBarOverlay` and `setBackgroundColor` and is removed on window `closed`.
- `webPreferences`, `CSP`, and the navigation and permission handlers are unchanged.
- No IPC.
- The palette uses Base UI Dialog with Base UI Autocomplete or Combobox, verified in 1.9.0 with ctx7. No `cmdk` dependency.
- Ctrl+K is ignored while another dialog is open.
**Files:**
- Modify: `src/main/window.ts`, `test/unit/window.test.ts`
- Modify: `src/renderer/src/components/{AppShell,Toolbar,Breadcrumb}.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`
- Create: `src/renderer/src/components/CommandPalette.tsx`, `test/unit/renderer-command-palette.test.tsx`
- Modify: `test/unit/renderer-appshell.test.tsx`, `e2e/app.spec.ts`
**Tasks:**
1. Write window option and theme listener tests first, then change `window.ts`.
2. Build the unified toolbar with a drag region, `no-drag` on controls, and reserved space for the overlay controls. Reduce `AppShell` to two panes.
3. Build `CommandPalette.tsx` with tests first. Navigation and bucket switching come from query data, and actions come from the store.
**Acceptance Criteria:**
- `test/unit/window.test.ts` asserts the new options, the unchanged `webPreferences`, and CSP equality.
- Ctrl+K opens the palette. Typing a bucket name and pressing Enter opens that bucket.
- e2e passes with the toolbar locators.
**Reviewer Checklist:**
- The listener is removed on close.
- Controls are not swallowed by the drag region.
- Palette focus is trapped and returns to the opener.
- No invariant 5 drift.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`

### Phase 8: Grid view, thumbnails, and handle LRU

**Task Guide Input:** Add a virtualized grid view with image thumbnails under a load budget. Add a main-only LRU to `HandleRegistry`. Main-process change plus frontend implementation.
**Goal:** The table and grid toggle persists across restarts, and grid thumbnails stay within budget.
**Depends on:** Phase 7
**Invariants & Boundaries:**
- The grid uses row virtualization over N column lanes with 1 to 2 rows of overscan. The mounted-cell bound is DESIGN.md invariant 5.
- Thumbnail budget:
  - image objects of 5 MiB or less, by listing size;
  - visible rows only, after 150 ms of scroll idle;
  - at most 4 concurrent requests;
  - paused while Quick Look plays media;
  - on failure, the type icon with no toast.
- `HandleRegistry` keeps at most 1,024 entries. It evicts the least recently used entry and touches an entry on every `get`.
- An evicted handle returns 403 through the existing proxy path. No IPC change.
- The view mode is persisted in `localStorage`.
**Files:**
- Modify: `src/main/stream/handles.ts`, `test/unit/handles.test.ts`, `test/integration/proxy.test.ts`
- Create: `src/renderer/src/components/ObjectGrid.tsx`, `test/unit/renderer-object-grid.test.tsx`
- Modify: `src/renderer/src/components/Toolbar.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`, `src/renderer/src/queries.ts`, `e2e/app.spec.ts`
**Tasks:**
1. Write LRU tests first: capacity, touch on `get`, eviction order, and dedupe still working. Implement the LRU. Add an integration test that an evicted handle returns 403.
2. Build `ObjectGrid.tsx` with cell-count tests at viewport heights 400 px and 1200 px. Share selection, the key map, and the context menu with the table.
3. Add the thumbnail scheduler with concurrency and size-cap tests. Add the toolbar toggle and its persistence. Add one e2e step that switches to grid and back.
**Acceptance Criteria:**
- 10,000 objects mount at most `(ceil(viewportHeight / cellHeight) + 2 * gridOverscanRows) * columns` grid cells at 400 px and 1200 px.
- No more than 4 thumbnail requests are in flight at once.
- After restart, the app opens in the last view mode.
- The 1,025th distinct handle evicts the least recently used one.
**Reviewer Checklist:**
- Invariant 2 of the original design holds under eviction.
- A playing Quick Look video is never evicted mid-play, since each Range request touches its handle.
- No thumbnail request goes to offscreen rows.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test --maxWorkers=2`
- `pnpm build`
- `xvfb-run -a pnpm e2e`
- `pnpm test:integration`, which must show no failure except the known "deletes 2,500 keys in three batches" timeout

### Phase 9: Documentation and debt

**Task Guide Input:** Update the user documentation and the manual checklist for the new UI. Documentation only.
**Goal:** README and the manual checklist describe the new stack, bindings, themes, and window chrome.
**Depends on:** Phase 8
**Invariants & Boundaries:** No source change.
**Files:**
- Modify: `README.md`, `docs/manual-checklist.md`
**Tasks:**
1. Update the README stack, scripts (`lint`, `format`), keyboard shortcuts, and the `--maxWorkers=2` note.
2. Add manual checklist items:
   - title bar overlay on X11 and Wayland;
   - light and dark switching while the app runs;
   - Quick Look media playback;
   - grid thumbnails on a large prefix;
   - the command palette.
**Acceptance Criteria:**
- Every shortcut in the README matches `selection.ts` and `CommandPalette.tsx`.
**Reviewer Checklist:**
- No claim in the README lacks a matching implementation.
**Verification Checks:**
- `pnpm lint`
- `pnpm build`
