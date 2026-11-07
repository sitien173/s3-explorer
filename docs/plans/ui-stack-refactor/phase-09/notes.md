<!-- refract-shared-version: 2.5.0 -->

# Phase 9 — Decision Notes

## Task 1

### Decisions made
- Documented exact library versions directly from `package.json`.
- Restructured `README.md` to document runtime, framework, styling tokens, UI primitives, forms, queries, client state, and linter.
- Replaced outdated keyboard shortcuts section with an exact table and breakdown for list navigation, grid navigation, selection, Quick Look, and command palette.
- Recorded the full keyboard shortcut mapping table with source file and line locations below.

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
  - RED: none (documentation only task)
  - GREEN: `pnpm lint` -> 0 errors, 1 info (deprecated recommended field); `pnpm build` -> exit 0; `pnpm test --maxWorkers=2` -> 40 files passed, 986 passed
- Root cause (bugfix only): none

### Keyboard Shortcut Mapping

| README Shortcut | Scope | Code Action | File and Line Reference |
|---|---|---|---|
| `ArrowUp` / `ArrowDown` | Browser List | Move active row and selection up or down by 1 item | `src/renderer/src/selection.ts:114-117`, `src/renderer/src/useBrowserSelection.ts:190-200`, `src/renderer/src/components/ObjectTable.tsx:127` |
| `Shift + ArrowUp` / `Shift + ArrowDown` | Browser List | Extend row selection up or down | `src/renderer/src/selection.ts:114-117`, `src/renderer/src/useBrowserSelection.ts:190-200` |
| `ArrowLeft` / `ArrowRight` | Browser Grid | Move active item and selection left or right by 1 column | `src/renderer/src/useBrowserSelection.ts:176-188`, `src/renderer/src/components/ObjectGrid.tsx:172` |
| `Shift + ArrowLeft` / `Shift + ArrowRight` | Browser Grid | Extend selection left or right by 1 column | `src/renderer/src/useBrowserSelection.ts:176-188` |
| `ArrowUp` / `ArrowDown` | Browser Grid | Move active item and selection up or down by row | `src/renderer/src/useBrowserSelection.ts:190-200`, `src/renderer/src/components/ObjectGrid.tsx:172` |
| `Shift + ArrowUp` / `Shift + ArrowDown` | Browser Grid | Extend selection up or down by row | `src/renderer/src/useBrowserSelection.ts:190-200` |
| `Home` | Browser Common | Move selection to first item | `src/renderer/src/selection.ts:118`, `src/renderer/src/useBrowserSelection.ts:234-235` |
| `End` | Browser Common | Move selection to last item | `src/renderer/src/selection.ts:119`, `src/renderer/src/useBrowserSelection.ts:234-235` |
| `PageUp` | Browser Common | Move active item and selection up by one page | `src/renderer/src/selection.ts:120`, `src/renderer/src/useBrowserSelection.ts:225-233` |
| `PageDown` | Browser Common | Move active item and selection down by one page | `src/renderer/src/selection.ts:121`, `src/renderer/src/useBrowserSelection.ts:225-233` |
| `Ctrl + Space` / `Cmd + Space` | Browser Common | Toggle selection of active item | `src/renderer/src/selection.ts:122`, `src/renderer/src/useBrowserSelection.ts:236-243` |
| `Ctrl + A` / `Cmd + A` | Browser Common | Select all items in current view | `src/renderer/src/selection.ts:113`, `src/renderer/src/useBrowserSelection.ts:247-248` |
| `Escape` | Browser Common | Clear selection | `src/renderer/src/selection.ts:123`, `src/renderer/src/useBrowserSelection.ts:249-250` |
| `Space` | Browser Common | Open Quick Look preview for active or selected object | `src/renderer/src/selection.ts:122`, `src/renderer/src/useBrowserSelection.ts:244-246` |
| `Enter` | Browser Common | Open selected folder or open object in media viewer | `src/renderer/src/selection.ts:124`, `src/renderer/src/useBrowserSelection.ts:251-264` |
| `Alt + ArrowUp` / `Backspace` | Browser Common | Navigate to parent folder | `src/renderer/src/selection.ts:112`, `src/renderer/src/useBrowserSelection.ts:304` |
| `Delete` | Browser Common | Delete selected item or items | `src/renderer/src/selection.ts:125`, `src/renderer/src/useBrowserSelection.ts:265-270` |
| `F2` | Browser Common | Rename selected item | `src/renderer/src/selection.ts:126`, `src/renderer/src/useBrowserSelection.ts:304` |
| `ContextMenu` / `Shift + F10` | Browser Common | Open context menu at active row | `src/renderer/src/selection.ts:127`, `src/renderer/src/useBrowserSelection.ts:271-301` |
| `Space` | Quick Look Modal | Close Quick Look preview | `src/renderer/src/components/QuickLook.tsx:196-199` |
| `Escape` | Quick Look Modal | Close Quick Look preview | `src/renderer/src/components/QuickLook.tsx:219-221` |
| `ArrowLeft` / `ArrowUp` | Quick Look Modal | Navigate to previous object sibling | `src/renderer/src/components/QuickLook.tsx:200-203` |
| `ArrowRight` / `ArrowDown` | Quick Look Modal | Navigate to next object sibling | `src/renderer/src/components/QuickLook.tsx:200-203` |
| `Ctrl + K` / `Cmd + K` | Command Palette | Open or close command palette | `src/renderer/src/components/CommandPalette.tsx:73-106` |
| `Escape` | Command Palette | Close command palette and restore focus | `src/renderer/src/components/CommandPalette.tsx:58,232-236,244` |

## Task 2

### Decisions made
- Updated manual verification checklist in `docs/manual-checklist.md` to reflect the current selection and Quick Look shortcuts.
- Added verification items for title bar overlay on X11 and Wayland, macOS traffic lights, dynamic theme switching, Quick Look media playback, grid thumbnail concurrency budget, command palette interaction, search status banner, and dialog validation error positioning.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Execute the manual verification items on desktop environments across Linux X11, Wayland, and a macOS darwin host.

### Test evidence
- RED -> GREEN:
  - RED: none (documentation only task)
  - GREEN: `pnpm lint` -> 0 errors, 1 info (deprecated recommended field); `pnpm build` -> exit 0; `pnpm test --maxWorkers=2` -> 40 files passed, 986 passed
- Root cause (bugfix only): none

## Coordinator corrections to Job A

- Restored the "Linux" scope sentence, the `## Run` section (`pnpm install`, `pnpm dev`, add a connection), and the `## Package` section with `scripts/smoke-appimage.sh`. Job A had dropped them.
- Replaced the unverified claim "traffic lights are centered in the 44 px toolbar" with "the toolbar reserves a left inset". Centering is a manual checklist item, because there was no darwin host.
- Enter: replaced "open selected object in the media viewer" with the neutral "open the selected folder or object".
- Security: restored "session-only basic password store". Verified `sandbox: true`, `contextIsolation: true` and `nodeIntegration: false` at `src/main/window.ts:149-151`.
- Verified Quick Look keys at `QuickLook.tsx:192-203`. Space closes unless focus is in a text input or a button. The arrows navigate unless focus is in a text input or a media element.

## Task 3

### Decisions made
- Kept constructor parameter `_store: ConnectionStore` in `S3ClientFactory` and `directory: string` in `SecretVault` without `private` to preserve call-site compatibility.
- Exported `BANNER_BASE_CLASS`, `BANNER_DESTRUCTIVE_CLASS`, and `BANNER_SEPARATOR_CLASS` from `alert.tsx` and `SPINNER_CLASS` from `spinner.tsx` for shared styling without visual changes.
- Used `!important` Tailwind modifiers in Sonner `toastOptions.classNames` to override Sonner unlayered styles while removing dead `group-[.toaster]` selectors.

### Spec deviations
- Coordinator-authorized addition to the PLAN.md Phase 9 rule "No source change" to resolve Phase 9 debt batch items 3a to 3j.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm lint` -> `DEPRECATED: The use of the recommended field has been deprecated` with 1 info diagnostic on biome.jsonc
  - GREEN: `pnpm lint` -> `Checked 149 files in 227ms. No fixes applied.` with 0 info, 0 warnings, 0 errors
  - GREEN: `pnpm typecheck` -> exit 0
  - GREEN: `pnpm test --maxWorkers=2` -> 40 files passed, 986 passed
  - GREEN: `pnpm build` -> exit 0
  - GREEN: `pnpm test --maxWorkers=2 test/unit/transfers.test.ts test/unit/renderer-toasts-dom.test.tsx` run 1 of 3 -> 2 files passed, 27 passed in 1.86s
  - GREEN: `pnpm test --maxWorkers=2 test/unit/transfers.test.ts test/unit/renderer-toasts-dom.test.tsx` run 2 of 3 -> 2 files passed, 27 passed in 1.79s
  - GREEN: `pnpm test --maxWorkers=2 test/unit/transfers.test.ts test/unit/renderer-toasts-dom.test.tsx` run 3 of 3 -> 2 files passed, 27 passed in 1.88s

### Root cause (bugfix only)
- 3f in test/unit/transfers.test.ts: The test resolved `streamStarted` synchronously inside `Readable.read()` and immediately asserted on file existence before Node.js `createWriteStream` completed opening the file descriptor asynchronously on disk under system load. Fixed by polling for file creation with `waitFor(() => existsSync(partPath))` before asserting.
- 3g in test/unit/renderer-toasts-dom.test.tsx: Sonner automatically schedules dismiss timers when rendering toasts. These unmanaged timers executed after test completion and jsdom environment teardown, causing unhandled timer rejections. Fixed by explicitly dismissing all active toasts with `act(() => { toast.dismiss(); })` in `afterEach`.

### Debt Item Resolution
- 3a: resolved; replaced deprecated `linter.rules.recommended` with `preset: "recommended"` in `biome.jsonc`; `pnpm lint` now outputs 0 info.
- 3b: resolved; annotated 5 `let` statements in `src/main/s3/ops.ts` with SDK command output types and removed `noImplicitAnyLet` disable in `biome.jsonc`.
- 3c: resolved; removed unused `private store` in `src/main/s3/client.ts` and `private readonly directory` in `src/main/connections/secrets.ts`, and re-enabled `noUnusedPrivateClassMembers` in `biome.jsonc`.
- 3d: resolved; replaced optional chaining with `expect(endpoint).toBeDefined()` in `test/unit/client.test.ts` and re-enabled `noUnsafeOptionalChaining` in `biome.jsonc`.
- 3e: resolved; converted `isMac` to const in `src/renderer/src/platform.ts`, removed `setIsMacForTesting`, and stubbed `navigator.userAgent` via `vi.spyOn` with `vi.resetModules` and dynamic import in `test/unit/renderer-shell.test.tsx`.
- 3f: resolved; eliminated timing race in `test/unit/transfers.test.ts` by using `waitFor(() => existsSync(partPath))` to ensure file creation before asserting.
- 3g: resolved; eliminated post-teardown timer leak in `test/unit/renderer-toasts-dom.test.tsx` by invoking `act(() => { toast.dismiss(); })` in `afterEach`.
- 3h: resolved; exported shared banner and spinner class constants from `ui/alert.tsx` and `ui/spinner.tsx`, replacing duplicated class strings across 24 banner sites and 7 spinner sites.
- 3i: resolved; verified Sonner styling API with ctx7, applied `!important` utility modifiers to `toastOptions.classNames`, and removed dead `group-[.toaster]` classes that were overridden by unlayered Sonner CSS.
- 3j: resolved; added code comment in `src/renderer/src/components/ui/sheet.tsx` documenting opener focus capture dependency on the controlled `open` prop.
