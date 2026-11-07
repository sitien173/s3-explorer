# UI Stack Refactor Design

**Status:** Confirmed 2026-11-07
**Consultation:** Two read-only consults, Refract jobs 10b8a02f (openai) and 8b3fc7ac (anthropic), agreed on the phase order, Base UI risks, the thumbnail lifecycle gap, and the main-process scope. The Coordinator checked their package claims against npm.

## Purpose

Refactor the renderer of S3 Media Explorer onto the user's preferred frontend stack. Replace the Trulioo Design System look with an Apple-style interface that has light and dark themes. Redesign the layout around a unified toolbar, a command palette, a table and grid toggle, and a Quick Look overlay.

## Users and Success Criteria

Users: people who browse, preview, and manage S3 objects in the desktop app.

Success criteria:

1. Every flow in `e2e/app.spec.ts` passes on the new UI. Locators may change. The flows are add connection, open bucket, open folder, play video, Open URL, upload, rename, and delete.
2. The renderer uses Base UI primitives. React Hook Form with Zod 4 validates every dialog form. TanStack Query owns IPC server state. A Zustand store owns shared shell UI state. Biome lints and formats the codebase.
3. No file under `styles/tds`, no `tokens.css`, and no `tds-*` class remains.
4. The UI follows the system light or dark theme, including the title bar overlay.
5. Cmd or Ctrl+K opens a command palette for navigation, bucket switching, and actions.
6. The table and grid toggle persists across restarts. The grid shows image thumbnails within the bound under Architecture.
7. Space toggles Quick Look. Arrow keys move between siblings while the overlay is open.
8. `App.tsx` contains only providers and the shell.

## Constraints, Invariants, and Non-Goals

User decisions:

- D1. Keep electron-vite 6 and Vite 8. Next.js does not fit a sandboxed Electron renderer, and AGENTS.md says to follow an existing project's established stack.
- D2. An Apple-style visual language per the `emil-design-eng` and `apple-design` skills replaces TDS.
- D3. Adopt Base UI, Biome, React Hook Form with Zod, TanStack Query, Zustand, and CSS with View Transitions. Motion is used only for enter/exit.
- D4. Layout redesign in scope: macOS-style window chrome, command palette, grid view, and a Quick Look overlay that replaces the docked viewer.
- D5. Light and dark themes follow the system. No in-app toggle.
- D6. Thumbnails cover images only and load through existing `streamOpen` proxy handles, under a budget and a main-only LRU.
- D7. Finder interaction model: click selects. Ctrl or Shift+click extends the selection. Space toggles Quick Look. Enter or double-click opens a folder or opens Quick Look. Ctrl+Space toggles selection.
- D8. Approach: behavior first, then look.

Constraints:

- Pins are exact and were checked on npm on 2026-11-07:

  | Package | Version |
  |---|---|
  | `@base-ui/react` | 1.9.0 |
  | `@biomejs/biome` | 2.6.6 |
  | `react-hook-form` | 7.91.0 |
  | `@hookform/resolvers` | 7.0.3 |
  | `@tanstack/react-query` | 5.107.1 |
  | `zustand` | 5.1.0 |
  | `motion` | 14.10.1, only if CSS falls short |

  `@base-ui-components/react` is deprecated with the message "Package was renamed to @base-ui/react".
- shadcn CLI 4.23.0 supports a Base UI base, but `shadcn add --overwrite` would erase the customized wrappers. Use generated output as a reference only and port by hand.
- Native `select` and `checkbox` stay native.
- Electron `vibrancy` is macOS only. On Linux the sidebar is a solid neutral surface.
- Icons come from `lucide-react`.

Invariants:

1. Invariants 1 to 5 of `docs/plans/s3-media-explorer/DESIGN.md` are unchanged. `webPreferences` in `src/main/window.ts` is not modified.
2. The `CSP` constant in `src/main/window.ts` is unchanged and equals the meta CSP in `src/renderer/index.html`.
3. No IPC channel, schema, or preload API changes.
4. No presigned URL reaches the renderer. Copy actions copy only an object key, a prefix, or an `s3://bucket/key` URI.
5. Rendering is bounded by the viewport, not the listing size. The table mounts at most `ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN + 1` row elements, the extra one being the header. The grid mounts at most `(ceil(viewportHeight / cellHeight) + 2 * gridOverscanRows) * columns` cells. Both bounds are tested with 10,000 objects at viewport heights 400 px and 1200 px. Amended 2026-11-07 in Phase 1: the earlier flat cap of 40 rows held only at 400 px.
6. A handle evicted by the LRU returns 403 through the existing proxy path. Invariant 2 of the original design still holds.
7. Every phase ends with `pnpm typecheck`, `pnpm test`, `pnpm build`, and `xvfb-run -a pnpm e2e` passing.

Non-goals:

- Next.js or any build-system change.
- An in-app theme toggle.
- Vibrancy or translucency.
- Main-side thumbnail resizing and video poster frames.
- A Base UI Select.
- A docked viewer pane.
- Gestures.
- New IPC channels.

## Chosen Approach

Incremental migration, behavior first, then look. Each phase changes one layer and keeps e2e green. Primitives migrate before the retheme, so styles target Base UI `data-open` and `data-starting-style` once. State leaves `App.tsx` before the layout changes, so the layout phases mostly move JSX.

Rejected alternatives:

- Look first, then internals: primitives would be styled twice, and visual and behavior diffs would mix.
- Parallel new shell: long-lived duplication, and e2e would have no guard until the switchover.

## Architecture and Data Flow

| Layer | Design |
|---|---|
| Build | electron-vite 6 and Vite 8, unchanged. |
| Lint and format | Biome. A format-only commit lands alone, before lint rules. |
| Primitives | Wrappers in `components/ui` ported to `@base-ui/react`. The module-level `focusin` trackers in `ui/dialog.tsx` and `ui/alert-dialog.tsx` are replaced by Base UI `finalFocus`. When the opener is unmounted, for example a context-menu item or a virtualized row, focus falls back to the grid. |
| Forms | React Hook Form with a Zod 4 schema per dialog: connection, rename, Open URL, add bucket, create bucket, and new folder. Label text stays stable. Reset-on-close and pending-submit guards are preserved. |
| Server state | TanStack Query. One typed `queryOptions` factory per IPC channel uses `RequestByChannel` and `ResponseByChannel` from `src/shared/ipc.ts`. The listing is an infinite query keyed by connection, bucket, and prefix. Mutations invalidate targeted keys instead of refresh counters. Search and transfer progress stay event-driven. `streamOpen` results are cached with `staleTime: Infinity`. |
| UI state | Zustand shell store holding location, selection, the Quick Look target, the view mode, and whether the palette is open. Server data never enters the store. |
| Theme | Apple-style tokens in `globals.css`. Light and dark are selected through `prefers-color-scheme`, with `color-scheme` set. Sonner's forced light theme is removed. |
| Window | `buildWindowOptions` adds `titleBarStyle: "hidden"`, a Linux `titleBarOverlay`, and a theme-matched `backgroundColor`. A `nativeTheme` `updated` listener calls `setTitleBarOverlay` and `setBackgroundColor` and is removed when the window is destroyed. The toolbar uses `-webkit-app-region: drag`; its controls use `no-drag`. |
| Layout | Two panes, sidebar and content, under a unified toolbar. The content pane switches between table and grid; the view mode is persisted in `localStorage`. A Cmd or Ctrl+K palette. |
| Quick Look | Dialog rendered in a portal outside the scroller. Sibling navigation goes by item index, not DOM. `streamOpen` is debounced by 120 ms on arrow keys. On close, the content pane scrolls to the current item, and media is unloaded and text requests aborted. |
| Grid | Row virtualization over N column lanes with 1 to 2 rows of overscan. |
| Thumbnail budget | Thumbnails load for visible rows only, after 150 ms of scroll idle. At most 4 requests run at once, paused while Quick Look plays media. Objects over 5 MiB by listing size show a type icon. |
| Handle registry | `HandleRegistry` in `src/main/stream/handles.ts` gains a 1,024-entry LRU, touched on every proxied request. This is a main-only change. |
| Motion | CSS transitions first. View Transitions only for the table and grid toggle and for opening Quick Look, never on the virtualized list. `motion` only for overlay enter/exit if CSS falls short. |

## Errors and Edge Cases

- **Thumbnail fails to load, or the object is over 5 MiB:** the cell shows the type icon. No toast.
- **Quick Look stream error:** inline error with Retry and Open with system app.
- **Handle evicted by the LRU:** the proxy returns 403. The renderer drops the cached `streamOpen` result and re-runs it once.
- **Query errors:** go through the existing sanitized toast builders in `toasts.ts`. List failures also show an inline empty state with Retry.
- **Dialog opener unmounted:** focus returns to the grid.
- **Ctrl+K pressed while a dialog is open:** ignored.
- **Space pressed in an input:** does not open Quick Look. The input and dialog guards in `selection.ts` are preserved.
- **Window manager without overlay support:** Electron falls back to its default behavior. This is recorded on the manual checklist.

## Migration

| Phase | Scope |
|---|---|
| 1 | Biome: format-only commit, then lint rules. Baseline regression tests for focus return and virtualization at two viewports. |
| 2 | Base UI port with the current look kept. Remove the focus trackers. |
| 3 | React Hook Form and Zod for all six dialog forms. |
| 4 | TanStack Query and the Zustand shell store. Split `App.tsx`. |
| 5 | Apple-style retheme and dark mode. Delete `styles/tds` and `tokens.css`. Rewrite `test/unit/renderer-tokens.test.ts`. |
| 6 | Quick Look overlay and Finder bindings. Remove the docked viewer. |
| 7 | Window chrome, unified toolbar, two-pane layout, command palette. |
| 8 | Grid view, thumbnail budget, `HandleRegistry` LRU. |
| 9 | README, manual checklist for X11, Wayland, light, and dark. Open debt. |

## Testing

- Each phase adds Vitest DOM tests for the behavior it changes and updates e2e locators in the same phase.
- Required new coverage:
  - focus return, including from a context-menu item and from an unmounted row;
  - form validation messages;
  - targeted query invalidation;
  - shell store transitions;
  - the Finder key and click map;
  - table and grid element counts at two viewports;
  - the thumbnail concurrency limit;
  - LRU eviction and the 403 on an evicted handle, as an integration test.
- `test/unit/window.test.ts` keeps asserting the unchanged `webPreferences` and CSP equality.
- Title bar overlay on X11 and Wayland, and both themes, go on `docs/manual-checklist.md`.

## Risks and Open Questions

Risks:

- Linux title bar overlay behavior varies across window managers and Wayland compositors.
- Base UI keeps popups mounted during exit animations. jsdom close assertions may need `waitFor`.
- e2e locators churn in Phases 2, 5, 6, and 7.
- Thumbnails can still download originals of up to 5 MiB each.
- Rebinding Space from selection to Quick Look changes existing muscle memory.
- The Biome reformat conflicts with any open branches.
- The exact `finalFocus` signature in `@base-ui/react` 1.9.0 is not yet verified. Phase 2 verifies it with ctx7 before use.

Open questions: none.
