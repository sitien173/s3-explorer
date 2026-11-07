<!-- refract-shared-version: 2.5.0 -->

# Phase 7 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-07/notes.md, fill the
heading, then append one `## Task <M>` block per task (and additional batch
sections on resumed `FIX:` rounds). Keep the file; never overwrite earlier task
blocks. Empty sub-sections = `- none`. Every task gets a block even if all
`none`.
-->

## Task 1

### Decisions made
- Exported TOOLBAR_HEIGHT = 44 from src/main/window.ts as the shared constant for titleBarOverlay height.
- Used #ffffff background / #1d1d1f symbolColor for light theme and #1c1c1e background / #f5f5f7 symbolColor for dark theme per globals.css tokens.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 -- test/unit/window.test.ts` -> 5 failed (hides titleBarStyle across platforms: expected undefined to be 'hidden'; includes titleBarOverlay on Linux: expected undefined to deeply equal { color: '#ffffff', height: 44, symbolColor: '#1d1d1f' }; sets backgroundColor matching light and dark themes: expected undefined to be '#ffffff'; updates overlay and background on nativeTheme updated event: expected "vi.fn()" to be called with arguments: [ 'updated', Any<Function> ]; removes the nativeTheme updated listener on window closed event: expected undefined to be 1)
  - GREEN: `pnpm test --maxWorkers=2` -> 37 passed, 933 passed
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Integrated Breadcrumb and SearchBar into the unified 44px (`h-11`) Toolbar container over the content pane, eliminating the stacked separate header.
- Rendered compact icon buttons with tooltips for Toolbar actions using `lucide-react` icons (`Upload`, `FolderPlus`, `Download`, `FilePenLine`, `Trash2`, `Globe`, `RotateCw`) and retained exact accessible button names via `aria-label` and `sr-only` spans.
- Added `.app-drag` and `.app-no-drag` utility classes to `globals.css` with automatic no-drag styling for interactive descendants.
- Reserved space on the right of the Toolbar for title bar overlay controls on Linux/Windows via `max(calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100%)), 138px)`.
- Reserved 78px left inset (`pl-[78px]`) on the Sidebar top strip on macOS for traffic lights.
- Maintained a 44px draggable top strip with overlay reservation in the content pane when no bucket is selected to keep window chrome draggable in all views.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 -- test/unit/renderer-shell.test.tsx` -> 2 failed (configures Toolbar as a drag region with no-drag controls: expected 'flex shrink-0 items-center justify-be…' to contain 'app-drag'; configures Sidebar top strip as a drag region: expected 'inline-flex shrink-0 cursor-default i…' to contain 'app-no-drag')
  - GREEN: `pnpm test --maxWorkers=2` -> 37 passed, 935 passed
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Added `paletteOpen: boolean` and `setPaletteOpen(open: boolean)` to Zustand shell store (`src/renderer/src/store.ts`) with initial state `false`.
- Implemented `CommandPalette` component (`src/renderer/src/components/CommandPalette.tsx`) with Base UI Dialog and Autocomplete/Combobox primitives (`inline`, `open`, and `autoHighlight="always"`).
- Supported Navigation, Buckets, and Actions command groups with Lucide icons (`FolderUp`, `Folder`, `HardDrive`, `Upload`, `Globe`, `FolderPlus`, `RotateCw`, `UserPlus`, `ArrowLeftRight`).
- Added global keyboard listener for Ctrl+K / Cmd+K to open or toggle close the palette, ignoring shortcut triggers when another dialog or Quick Look is active, or focus is in an editable input element.
- Restored focus to opener element upon palette close using `useFinalFocus`.
- Mounted `CommandPalette` in `src/renderer/src/Shell.tsx` wired to shell actions.
- Added e2e Ctrl+K step in `e2e/app.spec.ts` navigating into a folder, triggering `Control+K`, typing the bucket name, pressing Enter, asserting the bucket root is shown again, and re-entering the seeded folder.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 renderer-store` failed with `expected undefined to be false` on `state().paletteOpen`; `pnpm test --maxWorkers=2 renderer-command-palette` failed with `Unable to find role="dialog" and name "Command palette"`.
  - GREEN: `pnpm test --maxWorkers=2` -> 38 files passed, 942 passed.
- Root cause (bugfix only): none

## FIX-1

### Decisions made
- Added `document.querySelector('[role="dialog"],[role="alertdialog"]') !== null` check to CommandPalette's Ctrl/Cmd+K handler so the palette does not open over any dialogs (including Sidebar dialogs).
- Ordered `bucketItems` before `navItems` (`[...bucketItems, ...navItems, ...actionItems]`) so exact bucket name queries auto-highlight and select the bucket even when a bucket and prefix are active.
- Verified Base UI 1.9.0 `Autocomplete` documentation via `ctx7`: passing `filter={null}` to `Autocomplete.Root` disables internal filtering so Base UI respects external filtering (`filteredItems`) while keeping `Autocomplete.Empty` in sync with the rendered list.
- Replaced `100%` with `100vw` in overlay inset computation and extracted to `.app-overlay-inset` utility in `globals.css`: `padding-right: max(calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)), 138px);`. Verified with MDN Window Controls Overlay specification: `titlebar-area-x` is the distance from the window left edge to the app titlebar content area and `titlebar-area-width` is the width of that content area, so the space reserved for controls on the right is `100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)` with a 138px minimum fallback.
- Created `src/renderer/src/platform.ts` exporting `isMac` (and `setIsMacForTesting`), added to `tsconfig.node.json`, and imported in `Sidebar.tsx`, `Toolbar.tsx`, `Shell.tsx`, and `test/unit/renderer-shell.test.tsx`.
- Made all `CommandPaletteProps` required and removed `useShellStore.getState()` fallback branches and dead code.
- Restricted Upload, New folder, and Refresh palette items to only appear when `currentBucket` is truthy.
- Added tests in `test/unit/renderer-command-palette.test.tsx`:
  - Palette stays closed on Ctrl+K when an AlertDialog not in store is present in the DOM.
  - Palette selects the bucket on exact bucket-name match when a bucket and prefix are open.
  - Palette matches items on group name ("actions") without showing Empty.
  - Upload, New folder, and Refresh appear only when `currentBucket` is set.
  - Keydown listener is removed on unmount.
- Added Shell-level test in `test/unit/renderer-shell.test.tsx`: choosing "New folder" in CommandPalette opens the New folder dialog (`dialog.kind === "newFolder"`).

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- `pnpm typecheck` -> exit 0
- `pnpm lint` -> exit 0 (1 known deprecation info on recommended in biome.jsonc)
- `pnpm test --maxWorkers=2` -> 38 test files, 948 passed
- `pnpm build` -> exit 0
- Root cause (bugfix only):
  - Finding 1: CommandPalette only verified store dialog state and ignored non-store modal dialogs in the DOM.
  - Finding 2: `navItems` preceded `bucketItems`, causing breadcrumb root items containing the bucket name to match before bucket items.
  - Finding 3: Default Autocomplete filter filtered already manually-filtered items by label only.
  - Finding 4: Inset formula resolved `100%` against content pane width instead of window viewport width (`100vw`).
  - Finding 5: Multiple divergent platform detection regexes were inlined across components.
  - Finding 6: Palette props were optional with store fallbacks that Shell never relied on.
  - Finding 7: Bucket-specific actions were unconditionally included regardless of whether a bucket was selected.
  - Finding 8: Missing tests for keydown listener teardown and Shell command palette integration.

