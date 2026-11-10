# S3 Media Explorer

S3 Media Explorer is a Linux Electron desktop app for browsing, searching, managing, and streaming media objects in S3 and S3-compatible storage.

## Stack

The application uses the following stack:

- **Desktop runtime:** Electron 45.2.1 and electron-vite 6.0.0.
- **Frontend framework:** React 19.3.1 and TypeScript 6.0.3.
- **Styling:** Tailwind CSS 4.3.4 with CSS-first tokens defined in `src/renderer/src/styles/globals.css`.
- **UI primitives:** Base UI 1.9.0 with package `@base-ui/react`.
- **Forms and validation:** React Hook Form 7.91.0 with Zod 4.6.7 and `@hookform/resolvers` 7.0.3.
- **Data fetching:** TanStack Query 5.107.1 with package `@tanstack/react-query`.
- **Client state:** Zustand 5.1.0 with `persist` middleware.
- **Linter and formatter:** Biome 2.6.6 with package `@biomejs/biome`.

## Prerequisites

- Node.js and pnpm.
- Docker for RustFS-backed integration and end-to-end tests.
- ffmpeg to generate media test fixtures.
- `xvfb-run` for headless Electron end-to-end and packaging smoke tests on Linux.

## Run

Install dependencies with `pnpm install`, then start the development app with
`pnpm dev`. Add an AWS profile or S3-compatible connection in the app.

## Scripts

All scripts match `package.json`:

- `pnpm dev`: Start the Electron application in development mode.
- `pnpm build`: Build main, preload, and renderer bundles via electron-vite.
- `pnpm dist`: Build bundles and package Linux AppImage and Debian distributions via electron-builder.
- `pnpm typecheck`: Run TypeScript checks across node and web projects via `tsc -b tsconfig.node.json tsconfig.web.json`.
- `pnpm lint`: Run the Biome linter across the project via `biome check .`.
- `pnpm format`: Format files using Biome via `biome format --write .`.
- `pnpm test`: Run unit tests with Vitest via `vitest run --project unit`. On loaded machines, passing `--maxWorkers=2` is recommended.
- `pnpm test:integration`: Run integration tests against RustFS via `vitest run --project integration`. On loaded machines, passing `--maxWorkers=2` is recommended.
- `pnpm e2e`: Run Playwright end-to-end tests against RustFS via `playwright test`.
- `pnpm seek:2gb`: Execute the large file stream seeking benchmark via `jiti scripts/seek-2gb.ts`.

Integration tests and end-to-end tests share RustFS on port 19000. Run them sequentially, not at the same time. Run the Electron end-to-end test headless with `xvfb-run -a pnpm e2e`.

## Package

`pnpm dist` creates Linux AppImage and Debian packages in `dist/`. After
building, `bash scripts/smoke-appimage.sh` launches the AppImage in an isolated
headless profile.

## User Interface

- **Theme:** The application follows system light and dark mode automatically via `prefers-color-scheme` and `nativeTheme`. There is no in-app theme toggle.
- **Window Chrome:** The window uses a hidden title bar. On Linux and Windows, Electron title bar overlay controls render inside a 44 px toolbar with colors matching the active theme. On macOS, the toolbar reserves a left inset for the native traffic light controls.
- **View Modes:** The object browser supports both a virtualized list table and a virtualized grid view. The selected view mode persists in `localStorage` under key `s3-view-mode`.
- **Thumbnail Budget:** In grid view, thumbnails are loaded with a concurrency limit of 4 after scrolling pauses for 150 ms, restricted to image objects up to 5 MiB.
- **Command Palette:** Pressing `Ctrl + K` or `Cmd + K` opens a command palette for bucket navigation, breadcrumbs, and common actions.
- **Quick Look:** Pressing `Space` on an object opens a modal preview supporting video, audio, images, PDF, and text.

## Keyboard Shortcuts

### Object Browser (List and Grid Views)

- `ArrowUp` / `ArrowDown`: Move active row and selection up or down by one item in list view, or by one row in grid view.
- `Shift + ArrowUp` / `Shift + ArrowDown`: Extend selection up or down in list view, or by one row in grid view.
- `ArrowLeft` / `ArrowRight`: Move active item and selection left or right by one column in grid view.
- `Shift + ArrowLeft` / `Shift + ArrowRight`: Extend selection left or right in grid view.
- `PageUp` / `PageDown`: Move active item and selection up or down by one viewport page.
- `Home` / `End`: Move selection to the first or last item in the current prefix.
- `Ctrl + Space` / `Cmd + Space`: Toggle selection of the active item.
- `Ctrl + A` / `Cmd + A`: Select all items in the current view.
- `Escape`: Clear current selection.
- `Space`: Open Quick Look preview for the active or selected object.
- `Enter`: Open the selected folder or object. Active only when exactly one item is selected.
- `Alt + ArrowUp` / `Backspace`: Navigate to the parent folder.
- `Delete`: Delete the selected object, folder, or multi-selected objects. Deletion is blocked if multiple items are selected and any of them is a folder.
- `F2`: Rename or move the selected item. Active only when exactly one item is selected.
- `ContextMenu` / `Shift + F10`: Open the context menu for the active row.

Object browser shortcuts are disabled when focus is inside an `input`, `textarea`, or `select` element, or when a modal dialog is open.

### Quick Look Modal

- `Space`: Close Quick Look preview. Space closes the preview even when video or audio playback is focused.
- `Escape`: Close Quick Look preview.
- `ArrowLeft` / `ArrowUp`: Navigate to the previous object in the current listing.
- `ArrowRight` / `ArrowDown`: Navigate to the next object in the current listing.

Arrow navigation in Quick Look is ignored while focus is inside an editable input or media playback element.

### Command Palette

- `Ctrl + K` / `Cmd + K`: Open or close the command palette.
- `Escape`: Close the command palette and restore focus to the previous element.

## Context Menus

Context menus open on right-click or via `ContextMenu` / `Shift + F10`:

- **Object items:** Open, Open with system app, Download, Rename or move, and Delete.
- **Folder items:** Open, Rename folder, and Delete folder.
- **Multi-selection:** Delete N objects for multiple objects; disabled Delete when folders are included because folders cannot be multi-deleted.
- **Sidebar bucket items:** Open, Pin or Unpin, and Delete bucket. A New bucket button in the selected connection creates a bucket.

## Security

The renderer runs in an Electron sandbox with `nodeIntegration: false` and `contextIsolation: true`. It does not receive AWS credentials or build direct S3 URLs. The main process signs S3 requests through a loopback streaming proxy at `127.0.0.1`. Secrets use Electron `safeStorage` backed by the operating system keychain when available. Headless tests use an isolated user data directory and the session-only basic password store. A Content Security Policy restricts media, image, frame, and connect sources to self and loopback proxy ports.

## License

Released under the [MIT License](LICENSE).
