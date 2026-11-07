# Phase 6: Quick Look and Finder bindings

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: The docked viewer pane is gone. A Quick Look overlay dialog previews objects. Space or double-click opens it, arrow keys move between siblings, and the table follows the Finder interaction model.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-06/base`
- Prior State:
  - Phases 1 to 5 are done. The renderer uses Base UI wrappers in `components/ui`, React Hook Form with Zod (`forms.ts`), TanStack Query (`queries.ts`), and a Zustand store (`store.ts`, which also holds the `ViewerTarget` types).
  - The shell is `Shell.tsx`, about 890 lines, and `App.tsx` holds providers only.
  - Styling is Apple-style tokens in `styles/globals.css` with Tailwind utilities. No color literal is allowed outside globals.css.
  - Checks at base: `pnpm typecheck` 0; `pnpm lint` 0, with 1 known info about the deprecated `recommended` field that you should ignore; `pnpm test --maxWorkers=2` 36 files, 908 passed; `pnpm build` 0; e2e 1 passed.
  - Always pass `--maxWorkers=2`. `test/unit/transfers.test.ts` "unique part file" is a known load flake; if it alone fails, re-run once.
- Code Context:
  - `src/renderer/src/selection.ts`
    - `keyboardAction` maps Space to `"toggle"`, Enter to `"open"` when one item is selected, and Escape to `"clear"`.
    - Its input and dialog guards must stay.
  - `src/renderer/src/components/AppShell.tsx`, 71 lines
    - Holds a resizable docked viewer panel with saved-layout code: `useDefaultLayout`, the `app-shell-last-viewer-width` localStorage key, and `viewerPanelRef`.
    - Remove the viewer panel and that layout code. Keep the sidebar and main panes.
  - `src/renderer/src/components/Viewer.tsx`, 177 lines
    - Uses `streamOpenQuery` from `queries.ts`, which already has `staleTime: Infinity`.
    - Renders `viewer/{ImageView,MediaView,PdfView,TextView}.tsx`. Keep those files as Quick Look content.
    - Viewer is also opened by the Open URL dialog. That target has no sibling list, so Quick Look must handle a target without siblings, where the arrows do nothing.
  - `e2e/app.spec.ts`, about line 50: `page.getByRole("region", { name: "Object preview" })` locates the viewer, and the flow plays a video inside it. The Open URL flow, about lines 86 to 95, expects the viewer to contain `faststart.mp4` and show a `<video>`. Switch these locators to the Quick Look dialog. Read the whole e2e flow first: it may rely on the viewer staying open while it does other things. If the dialog's modality blocks a later step, close Quick Look at the right point instead of weakening any assertion.
  - The renderer cannot read an HTTP status from `<img>` or `<video>` error events. Implement "a 403 drops the cache entry and retries once" this way: on the first load error for a target, remove the `streamOpen` query for that target and re-run it once. On a second error, show the inline error with Retry. `Retry` and "Open with system app" are the existing viewer error affordances; keep them. Phase 8 adds the LRU that makes this path real.

## Invariants & Boundaries
- Key map, per PLAN.md Phase 6. Implement exactly this:

  | Input | Action |
  |---|---|
  | Click | Selects |
  | Ctrl or Shift+click | Extends the selection |
  | Space | Toggles Quick Look |
  | Enter or double-click | Opens a folder, or opens Quick Look on an object |
  | Ctrl+Space | Toggles selection |

  - Space inside an input, textarea, select, or an open non-Quick-Look dialog does not open Quick Look. For example, Space in the search input types a space.
  - While Quick Look is open: ArrowLeft, ArrowRight, ArrowUp and ArrowDown move to the previous or next sibling object. Siblings are the current listing's objects in display order; skip folders. Space and Escape close Quick Look. Navigation is by item index, not by DOM, because the list is virtualized.
- `streamOpen` is debounced by 120 ms on arrow-key navigation. It stays cached with `staleTime: Infinity`.
- Media unloads and text requests abort on close and on navigation, so no `<video>` or `<audio>` keeps playing.
  - Media: pause, remove `src`, then `load()`, or unmount.
  - Text: `AbortController`.
- The overlay is portaled outside the scroller, using the Base UI Dialog wrapper in `components/ui/dialog.tsx`.
- On close:
  - Focus returns to the current item's row; `useFinalFocus` falls back to the grid.
  - The table scrolls so the current item is visible, even if the user navigated to a sibling that was off-screen.
- Selection follows Quick Look navigation, so the current item is selected after close.
- Quick Look has an accessible name that includes the object's file name. It looks Apple-style: dark-tinted backdrop, an elevated panel, the file name in a compact title bar, and a close button. Honor reduced motion. Use only tokens from globals.css.
- Out of Scope:
  - New dependencies.
  - `src/main/**`, `src/preload/**`, `src/shared/**`, and IPC.
  - The window chrome, toolbar, command palette, and grid view, which belong to Phases 7 and 8.
  - Any file under `docs/` except your phase records.
  - `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- Modify: `src/renderer/src/selection.ts`, `src/renderer/src/components/ObjectTable.tsx`, `src/renderer/src/components/AppShell.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`, `src/renderer/src/queries.ts`
- Modify, only if needed for media unload, abort, or 403 retry: `src/renderer/src/components/viewer/{ImageView,MediaView,PdfView,TextView}.tsx`
- Create: `src/renderer/src/components/QuickLook.tsx`
- Delete: `src/renderer/src/components/Viewer.tsx`
- Modify: `test/unit/selection.test.ts`, `test/unit/renderer-object-table.test.tsx`, `test/unit/renderer-appshell.test.tsx`, `test/unit/renderer-shell.test.tsx`, and any existing test that imports `Viewer.tsx`. Move its coverage to Quick Look; do not drop it.
- Create: `test/unit/renderer-quicklook.test.tsx`
- Modify: `e2e/app.spec.ts`. The preview locator becomes the Quick Look dialog.
- If a new renderer `.ts` file is imported by a `test/*.ts` file, add it to `tsconfig.node.json` `include`, or typecheck fails with TS6307.

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-06/notes.md`: append `## Task <M>` blocks.
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-06/journal.md`: append the `# EXTERNAL RESPONSE` block under `## Implementation Response`.

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
Use TDD: write each test first and record the RED failure in notes.

- task-1: Key-map tests first in `selection.test.ts` and `renderer-object-table.test.tsx`, then change `selection.ts` and `ObjectTable.tsx`:
  - Space gives `"quicklook"`.
  - Ctrl+Space toggles selection.
  - Enter or double-click opens a folder or opens Quick Look on an object.
  - Click selects; Ctrl or Shift+click extends.
  - Keep the guards.
- task-2: `QuickLook.tsx`, with tests first in `renderer-quicklook.test.tsx`:
  - Open and close via Space and Escape.
  - Sibling navigation by index, skipping folders, with no navigation for a target without siblings.
  - The 120 ms debounce, tested with fake timers so only one `streamOpen` call happens for rapid arrows.
  - Cache reuse.
  - The retry-once-on-error flow.
  - Media unload and text abort on close and navigation.
  - Focus return to the row.
  - The store holds the Quick Look target. Shell renders `<QuickLook>` and the Open URL flow opens it.
- task-3: Remove the viewer panel and its saved-layout code from `AppShell.tsx` and delete `Viewer.tsx`. Update `renderer-appshell.test.tsx` and the e2e locators. Remove orphaned imports and code.

## Done When
- `Viewer.tsx` does not exist. `grep -rn "Object preview\|app-shell-last-viewer-width" src test e2e` prints nothing, unless the Quick Look dialog's accessible name deliberately reuses "Object preview"; if so, say so in notes.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 908 passed; expect more)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary:
- You are the phase implementer, not the Coordinator.
- Edit code only in `/home/ngosi/projects/s3-explorer`. Write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-06/`.
- Do not run Git commits, resets, stashes, branch changes, or ref updates.
- Do not invoke Coordinator skills or submit nested jobs.
- Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if it is unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-06/journal.md`, then return that block and the matching status line from `erp.md`.
