# Phase 7: Window chrome, unified toolbar, and command palette

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome:
  - The native title bar is hidden. On Linux and Windows, a title bar overlay follows the system theme.
  - The breadcrumb, search, and actions form one draggable toolbar over the content pane.
  - The window has two panes, sidebar and content.
  - Cmd or Ctrl+K opens a command palette for navigation, bucket switching, and actions.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-07/base`
- Prior State:
  - Phases 1 to 6 are done.
  - Base UI wrappers live in `components/ui`.
  - Forms use RHF with Zod (`forms.ts`).
  - Server state uses TanStack Query (`queries.ts`), and the shell store is Zustand (`store.ts`).
  - Apple-style tokens live in `styles/globals.css`. In dark mode the background is `rgb(28, 28, 30)`; in light mode it is `rgb(255, 255, 255)`. Read the exact token values from globals.css.
  - The `QuickLook.tsx` overlay replaced the docked viewer, and `AppShell.tsx` already has only sidebar and main panes.
  - Checks at base:
    | Check | Baseline |
    |---|---|
    | `pnpm typecheck` | exit 0 |
    | `pnpm lint` | exit 0, with 1 known info about the deprecated `recommended` field; ignore it |
    | `pnpm test --maxWorkers=2` | 37 files, 927 passed |
    | `pnpm build` | exit 0 |
    | e2e | 1 passed |
  - Always pass `--maxWorkers=2`. Two tests are known load flakes; if only one of them fails, re-run once:
    - `test/unit/transfers.test.ts` "unique part file".
    - An unhandled Sonner-timer error from `renderer-toasts-dom.test.tsx`.
- Code Context:
  - `src/main/window.ts`
    - `buildWindowOptions()` (line 130) returns width, height, and `webPreferences`.
    - `createWindow()` (line 143) adds navigation, permission, window-open, and CSP handlers.
    - `test/unit/window.test.ts` (593 lines) mocks electron and asserts `webPreferences` and CSP equality.
  - `src/renderer/src/Shell.tsx`, around lines 595 to 700, renders:
    - `<AppShell sidebar=… main=…>`.
    - A `<header>` with `<Breadcrumb>` (`nav` named "Breadcrumb") and `<SearchBar>`.
    - Then `<Toolbar>`, which has the Upload, Open URL, and other action buttons.
    - Then the file drop zone and `ObjectTable`.
  - The sidebar holds connections and buckets. e2e clicks:
    - Buttons named "Add connection", the connection name, and the bucket name.
    - "Open URL" and "Upload" in the toolbar.
    - The "Breadcrumb" navigation.
    - Keep those accessible names.
- Electron facts to verify with `npx ctx7@latest` before use: `titleBarStyle`, `titleBarOverlay` `{ color, symbolColor, height }`, `BrowserWindow.setTitleBarOverlay`, `setBackgroundColor`, the `nativeTheme` `updated` event, and `nativeTheme.shouldUseDarkColors`. Also check whether the Window Controls Overlay CSS env variables (`titlebar-area-x`, `titlebar-area-width`, `titlebar-area-height`) are available in the renderer when `titleBarOverlay` is set. Use them to reserve space for the overlay controls if they are; otherwise reserve a fixed right inset on Linux and Windows and a left inset for the macOS traffic lights.
- Base UI facts to verify with `npx ctx7@latest` for `@base-ui/react` 1.9.0 before use: Dialog with Autocomplete or Combobox for a command list (input, list, item, keyboard highlight, Enter to select). Do not add `cmdk` or any dependency.

## Invariants & Boundaries
- `src/main/window.ts`: only `buildWindowOptions` and a theme listener may change.
  - Add `titleBarStyle: "hidden"`, a theme-matched `backgroundColor`, and, on non-macOS platforms, `titleBarOverlay` with theme-matched `color` and `symbolColor` and a `height` equal to the renderer toolbar height. Share one exported constant for the height.
  - In `createWindow`, add a `nativeTheme.on("updated", …)` listener that calls `setTitleBarOverlay`, on non-macOS only, and `setBackgroundColor`. Remove it with `nativeTheme.removeListener` on the window `closed` event.
  - `webPreferences`, `CSP`, and the navigation, permission, window-open, and CSP handlers are unchanged.
- No IPC change. `src/preload/**` and `src/shared/**` are out of scope. The renderer reads the platform only if it is already available without IPC; if it is not, use CSS env variables or a neutral inset.
- Drag region: the toolbar uses `-webkit-app-region: drag`, via a Tailwind arbitrary property or a small utility in globals.css. Every interactive control inside it uses `no-drag`: buttons, inputs, breadcrumb links, and menus. The sidebar top strip is also a drag region with `no-drag` controls.
- The palette:
  - Uses the Base UI Dialog through `components/ui/dialog.tsx`, or the same composition with `useFinalFocus`.
  - Traps focus and returns focus to the opener.
  - Ignores Ctrl or Cmd+K while another dialog or Quick Look is open.
  - Ignores Ctrl+K when focus is in a text input other than its own. Record this decision in notes.
- Palette content:
  - Navigation: parent folder and breadcrumb ancestors.
  - Buckets of the active connection, from query data.
  - Actions: Upload, Open URL, New folder, Refresh, Add connection, and Transfers, each calling the same handler as the toolbar or sidebar.
  - Store only `paletteOpen` in the Zustand store.
- Invariant 5, the viewport-bounded row count, must not drift. Keep the table's scroll container height correct after the toolbar change, and keep the existing two-viewport tests passing.
- Apple style: compact toolbar about 44 px tall, hairline bottom separator, icon buttons with tooltips, and tokens only from globals.css. No color literal outside globals.css in the renderer; main-process colors are fine in window.ts. Honor reduced motion.
- Out of Scope:
  - New dependencies.
  - `src/preload/**` and `src/shared/**`.
  - The grid view and thumbnails, which belong to Phase 8.
  - Any file under `docs/` except your phase records.
  - `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- Modify: `src/main/window.ts`, `test/unit/window.test.ts`
- Modify: `src/renderer/src/components/{AppShell,Toolbar,Breadcrumb,SearchBar,Sidebar}.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`, `src/renderer/src/styles/globals.css`
- Create: `src/renderer/src/components/CommandPalette.tsx`, `test/unit/renderer-command-palette.test.tsx`
- Modify: `test/unit/renderer-appshell.test.tsx`, `test/unit/renderer-shell.test.tsx`, `test/unit/renderer-store.test.ts` or the existing store test, and `e2e/app.spec.ts`
- If a new renderer `.ts` file is imported by a `test/*.ts` file, add it to the `tsconfig.node.json` `include`.

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-07/notes.md`: append `## Task <M>` blocks.
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-07/journal.md`: append `# EXTERNAL RESPONSE` under `## Implementation Response`.

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
This phase runs as two jobs. Use TDD and record RED in notes.

**Job A: Tasks 1 and 2 only. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2.**
- task-1: Write the window option and theme listener tests first in `window.test.ts`:
  - `titleBarStyle`.
  - `titleBarOverlay` on Linux, and its absence on macOS.
  - `backgroundColor` for both themes.
  - The listener updates the overlay and the background, and is removed on `closed`.
  - `webPreferences` unchanged.
  - CSP equality.
  Then change `window.ts`.
- task-2: Build the unified toolbar:
  - Breadcrumb, search, and actions go in one row, or a compact layout if width requires.
  - Add the drag region with `no-drag` controls and reserve space for the overlay controls.
  - The sidebar top strip becomes a drag region.
  - `AppShell` stays two panes.
  - Update unit tests and e2e locators only where names changed. Prefer keeping names.

**Job B: Task 3, sent later as "Continue Phase 07".**
- task-3: Build `CommandPalette.tsx`, with tests first in `renderer-command-palette.test.tsx`. Cover:
  - Ctrl+K and Cmd+K open it; a second press or Escape closes it.
  - It is ignored while a dialog or Quick Look is open.
  - Typing a bucket name and pressing Enter opens that bucket.
  - Each action calls its handler.
  - Focus returns to the opener.
  - Add `paletteOpen` to the store with a store test.
  - Add one short e2e step after the bucket opens in `e2e/app.spec.ts`: press `Control+K`, type the bucket name, press Enter, and assert the bucket is still or again shown. Make it a real check: open a different location first if needed.

## Done When
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 927 passed; expect more)
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
- Edit code only in `/home/ngosi/projects/s3-explorer`.
- Write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-07/`.
- Do not run Git commits, resets, stashes, branch changes, or ref updates.
- Do not invoke Coordinator skills or submit nested jobs.
- Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if it is unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-07/journal.md`, then return that block and the matching status line from `erp.md`.
