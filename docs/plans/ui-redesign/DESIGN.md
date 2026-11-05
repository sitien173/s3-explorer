# Renderer UI Redesign Design

**Status:** Pending user approval 2026-11-05. D1 to D4 below were answered by the user. All other decisions are Coordinator decisions made after the user said to continue without consultation.
**Consultation:** skipped - the user cancelled consult jobs 4c4614f5 and be257d2c before they returned.

## Purpose

Move the renderer of S3 Media Explorer from hand-written CSS and custom dialogs to Tailwind CSS v4 and shadcn/ui, styled with the Trulioo Design System. Add targeted UX gains without changing the layout or the flows.

## Users and Success Criteria

Users: people who browse, preview, and manage S3 objects in the desktop app.

Success criteria:

1. Every current flow in `e2e/app.spec.ts` still passes: add connection, open bucket, open folder, play video, Open URL, upload, rename, delete.
2. Object table keyboard map works as specified under Architecture.
3. Right-click on an object row, a folder row, a multi-selection, or a bucket opens the specified context menu.
4. Operation and transfer outcomes raise toasts. Partial failures still open the existing operation report with exact key lists.
5. Listing shows skeleton rows while loading. Empty bucket, empty folder, no search results, and no connection each show an empty state.
6. Sidebar and viewer panes are resizable and keep their sizes across restarts.
7. The rewritten styling scanner passes, and no legacy CSS selector remains that no TSX file references.

## Constraints, Invariants, and Non-Goals

User decisions:

- D1. Scope is stack migration plus targeted UX. Layout and flows stay.
- D2. UX scope: keyboard navigation, context menus, toasts and status, skeleton loading, empty states, resizable panes.
- D3. TSX may use Tailwind layout and spacing utilities with TDS token values. Color, type, radius, and shadow come only from TDS tokens or `tds-*` classes.
- D4. CSP `style-src` becomes `'self' 'unsafe-inline'`. `script-src` stays `'self'`.

Constraints:

- shadcn/ui uses the Radix base. Behavior comes from Radix. Look comes from TDS.
- Light theme only. No `.dark` block and no `@custom-variant dark`.
- Icons come from `lucide-react`, the shadcn default for Radix.
- Exact dependency pins, matching the repository's existing style.

Invariants:

1. Invariants 1 to 4 of `docs/plans/s3-media-explorer/DESIGN.md` are unchanged.
2. Invariant 5 there is amended only by D4. `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, navigation blocking, and the permission denial handlers are unchanged.
3. `CSP` in `src/main/window.ts` equals the meta CSP in `src/renderer/index.html`.
4. No IPC channel, schema, or preload API changes.
5. No presigned URL reaches the renderer. "Copy" actions copy only an object key, a prefix, or an `s3://bucket/key` URI.
6. The listing stays virtualized: a 10,000-object listing renders at most 40 row elements.

Non-goals:

- New layout, navigation model, or command palette.
- Dark theme.
- Multi-object download, multi-object rename, and folder download.
- Changes to the main process other than the CSP constant.
- Tobias font bundling.

## Chosen Approach

Incremental migration. A foundation phase adds the toolchain and the token bridge with no visible change. Later phases migrate one UI area each and keep e2e green. A final phase deletes legacy CSS.

- Rejected: parallel rewrite. Two UIs diverge for the whole effort and nothing ships until the swap.
- Rejected: big-bang rewrite. The review surface is too large and every flow regresses at once.

## Architecture and Data Flow

### Toolchain

- `tailwindcss` and `@tailwindcss/vite` 4.3.4. Peer range includes Vite 8, verified with `npm view` on 2026-11-05. The plugin is added to `renderer.plugins` in `electron.vite.config.ts` for both `serve` and `build`.
- `components.json` for shadcn 4.23.0: style per CLI default, Radix base, `tsx: true`, `rsc: false`, CSS file `src/renderer/src/styles/globals.css`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`, icon library `lucide`.
- `tsconfig.web.json` gains `baseUrl` and `paths` for `@/*` to `src/renderer/src/*`, which matches the existing Vite alias.
- Runtime deps: `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.68.0, `sonner` 2.0.8, `react-resizable-panels` 4.18.1, plus whatever Radix packages `shadcn add` installs, pinned exactly.
- Dev deps for DOM tests: `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8.

### Stylesheets

`src/renderer/src/styles/globals.css` becomes the only stylesheet imported by `main.tsx`:

```css
@layer theme, base, components, utilities;
@import "tailwindcss";
@import "./tokens.css";
@import "./tds/button.css" layer(components);
/* one import per styles/tds/<id>.css */
@import "./app.css" layer(components);

@theme {
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --text-*: initial;
  --font-*: initial;
}
@theme inline {
  --font-sans: var(--font-family);
  --color-background: var(--surface-neutral-01);
  /* remaining bridge rows */
}
```

- `components.css` is split, byte for byte, at its `/* tds component: <id> */` markers into `styles/tds/<id>.css`. TDS components added later come from `tds component <id>`.
- Clearing `--color-*` removes Tailwind's palette, so `--color-neutral-100` and `--color-teal-50` resolve only to TDS values. Clearing `--radius-*` stops Tailwind and shadcn from overriding TDS `--radius-md` and the chain behind `--radius-button` and `--radius-card`. shadcn's `--radius` variable and its `calc()` radius rows are not added.
- Bridge rows map shadcn color names to TDS semantic tokens per the table in the user's AGENTS.md section 6, for example `--color-primary: var(--interactive-default)` and `--color-ring: var(--border-focus)`.
- Tailwind's `--spacing` default stays, so shadcn primitive files keep their numeric spacing utilities. App TSX outside `components/ui` uses token-valued spacing only.

### Components

| shadcn component | Look layer |
|---|---|
| Button | `tds-btn` variants and sizes per AGENTS.md mapping; `size="icon"` maps to `tds-icon-btn` |
| Input, Field, Label | `tds-text-input`, `tds-field-label`, `tds-field-caption`, `tds-field-validation` |
| Select | `tds-select` and `tds-dropdown-panel` |
| Checkbox, Switch | `tds-checkbox`, `tds-switch` |
| Dialog, AlertDialog | `tds-dialog` center sizes |
| Sheet | `tds-dialog` right drawer, used by the transfers drawer |
| Breadcrumb | `tds-breadcrumbs`, `tds-breadcrumb-item` |
| Tooltip | `tds-tooltip` |
| ContextMenu | `tds-dropdown-panel`, `tds-action-list-item` |
| Badge | `tds-tag` |
| Spinner | `tds-spinner` |
| Alert | `tds-announcement`, used by the SSO banner and session warning |
| Table | `tds-data-table` classes on the existing virtualized grid |
| Sidebar nav | `tds-side-nav`, `tds-nav-list`, `tds-nav-item` |
| Sonner, Skeleton, Empty, Resizable, Separator | No TDS component. shadcn styled with TDS semantic tokens. |

The transfers progress bar keeps its current markup, because TDS `progress-indicator` is a step tracker.

### Object table

- One tab stop. The grid container has `role="grid"`, `aria-multiselectable="true"`, and `aria-activedescendant` set to the active row id. Rows keep `role="row"` and `aria-selected`.
- On every active-row move, the virtualizer calls `scrollToIndex`, so the active row is always mounted.
- Selection state moves from `selectedItem: BrowserRow | null` to an ordered key set plus an active key and an anchor key. A pure reducer in `src/renderer/src/selection.ts` owns every transition and is unit tested.
- Keyboard map, active only while the grid has focus:

| Key | Action |
|---|---|
| ArrowUp, ArrowDown | Move active row; selection follows |
| Shift+ArrowUp, Shift+ArrowDown | Extend range from anchor |
| Home, End, PageUp, PageDown | Move by list or by visible row count |
| Space | Toggle active row in selection |
| Ctrl+A | Select all loaded rows |
| Escape | Clear selection |
| Enter | Open folder, or open object in viewer |
| Backspace, Alt+ArrowUp | Go to parent prefix |
| Delete | Open delete confirmation for the selection |
| F2 | Open rename for a single selection |
| ContextMenu, Shift+F10 | Open context menu for the active row |

- Mouse: click selects one, Ctrl+click toggles, Shift+click selects a range, double-click opens.
- Ctrl+A selects only loaded rows. It does not fetch further pages.

### Context menus

| Target | Items |
|---|---|
| Object row | Open, Open with system app, Download, Rename or move, Copy key, Copy S3 URI, Delete |
| Folder row | Open, Rename folder, Copy prefix, Delete folder |
| Multi-selection | Delete N objects |
| Bucket in sidebar | Open, Pin or Unpin, Copy bucket name |

Every item calls the same handler as the toolbar button or dialog it mirrors. Multi-object delete uses the existing `opsDelete` channel, whose `keys` accept 1 to 10,000 items (`src/shared/ipc.ts:109-114`).

### Toasts

- One `<Toaster />` at the app root.
- Success toasts: upload done, download done, folder created, rename done, delete done.
- Error toasts: transfer failed, operation failed. A partial failure raises an error toast whose action opens the existing operation report.
- Info toast: rejected upload count, replacing the current inline count.
- The SSO banner and the session-only warning stay persistent `Alert` elements, because they describe state, not events.

### Panes

`ResizablePanelGroup` holds sidebar, main pane, and viewer. Sizes persist through the library's `autoSaveId`, which uses `localStorage`. The viewer panel collapses when no viewer target exists.

### Styling scanner

`test/unit/renderer-tokens.test.ts` is rewritten:

- Hex colors are forbidden outside `tokens.css` and `styles/tds/**`.
- Core tokens are forbidden outside `tokens.css`, `styles/tds/**`, and the `@theme` blocks of `globals.css`.
- Class strings are checked in JSX `className`, and in `cn()` and `cva()` arguments. Variant prefixes such as `hover:` and `data-[state=open]:` are stripped first.
- Outside `components/ui`, each class is `tds-*`, `app-*`, or a layout utility from an explicit allowlist. Spacing and sizing utilities must use a TDS token value such as `gap-(--gap-md)`, or a fraction, `full`, `auto`, or `0`.
- Inside `components/ui`, color utilities must name a bridged color. Font size, font family, radius, and shadow utilities must use a TDS token value.
- Every `app-*` selector in `app.css` must be referenced by at least one TSX file.
- `dangerouslySetInnerHTML` stays forbidden.

## Errors and Edge Cases

- A keyboard shortcut never fires while focus is in an input, select, or dialog.
- F2, Enter on an object, and single-item menu entries are disabled for a multi-selection.
- Selection is cleared on prefix change, bucket change, connection change, and search start.
- Selected keys that vanish after a refresh drop out of the selection.
- Toasts never include secrets or local file paths. Transfer errors already scrub local paths in main.
- Copy actions use `navigator.clipboard.writeText`. If the promise rejects, an error toast says the copy failed.

## Migration

- Each phase leaves the app buildable, all tests green, and e2e green.
- During migration, legacy `app-*` and `tds-*` classes coexist with Tailwind utilities. The final phase deletes every unreferenced legacy rule and `components.css`.
- e2e selectors that use `.app-*` classes move to role and label selectors when their markup changes.
- `localStorage` gains pane sizes only. No migration of stored data.

## Testing

- Unit project include widens to `test/unit/**/*.test.{ts,tsx}`. DOM tests opt in with `// @vitest-environment jsdom`. Polyfills for `ResizeObserver`, `scrollIntoView`, and pointer capture live in one setup file.
- Pure logic tests: selection reducer, keyboard-to-action map, toast message builders.
- DOM tests: keyboard map on the grid, context menu items per target, toast on operation outcome, dialog labels used by e2e.
- e2e: the existing flow, plus computed-style assertions for `--color-neutral-100`, `--radius-md`, and body background in Phase 1, plus keyboard delete, context-menu rename, and a toast in later phases.
- Every phase runs `pnpm typecheck`, `pnpm test`, `pnpm build`, and `xvfb-run -a pnpm e2e`. Phases that touch transfer or ops wiring also run `pnpm test:integration`.

## Risks and Open Questions

Risks:

- R1. Tailwind preflight may change elements that no TDS or app rule styles, such as headings and lists. Phase 1 captures screenshots before and after for manual comparison.
- R2. Radix primitives in jsdom need polyfills. Tests that cannot run in jsdom move to e2e.
- R3. A Tailwind `@theme` clear may not stop a variable from reaching `:root`. Phase 1 asserts computed values in e2e.
- R4. shadcn CLI init may not detect electron-vite. `components.json` is then written by hand from the schema at `https://ui.shadcn.com/schema.json`.

Open questions:

- Q1. Clipboard. The permission handlers in `src/main/window.ts:179-182` deny every request and check. `navigator.clipboard.writeText` may fail under them. Default: Phase 4 checks it in e2e. If it fails, copy items are removed, unless the user approves allowing `clipboard-sanitized-write` in both handlers.
