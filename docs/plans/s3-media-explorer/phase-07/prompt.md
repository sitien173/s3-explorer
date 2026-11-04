# Phase 7: Viewer, URL playback, and file-operation UI

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with the Trulioo Design System (TDS). Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/PLAN.md` (Phase 7) and `DESIGN.md` (flows 4, 5, 7 and the Errors and Edge Cases table).
- Phase Outcome: Every user-facing feature in DESIGN.md flows 4, 5, and 7 is reachable and works in the app. A user can preview or play a selected object, open an S3 or presigned URL with a chosen signing connection or Anonymous, upload by picker or drag and drop, create a folder, download, rename or move, delete with an exact-count confirmation, see a partial-failure report, watch and cancel transfers, and open an unsupported file with the system app.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-07/base`
- Prior State: Phases 1 to 6 are complete. At the base commit `pnpm typecheck`, `pnpm test` (368 unit tests), `pnpm test:integration` (25), and `pnpm build` exit 0. Do not add or change dependencies.
- Code Context:
  - `src/shared/ipc.ts` exports the `Api` type and every request and response shape. Relevant: `stream.open({ connectionId, bucket, key })` and `stream.openUrl({ url, connectionId? , anonymous? })` both return `{ url, contentType, size }` where `url` is a proxy URL on `http://127.0.0.1:<port>`. `ops.*` (createFolder, delete, deletePrefix, countPrefix, rename, renamePrefix, onProgress) and `transfers.*` (upload opens a main-side picker, uploadPaths takes absolute paths, `pathsForFiles(files)` maps dropped `File` objects to paths, download opens a save dialog and returns `transferId` or null when cancelled, cancel, onProgress, onDone). Prefix operations return `{ completed, remaining, error? }` and take a renderer-generated `opId` (check the `jobId` schema for its format).
  - Channel names live in `src/shared/channels.ts`. `src/preload/index.ts` builds the frozen `window.api`. `src/main/ipc/register.ts` registers handler maps; `src/main/ipc/stream.ts` shows the handler-map pattern and receives `deps.stream.proxy` (`urlFor(handle)` returns `<origin>/...`). `src/main/stream/proxy.ts` does not check the request Origin, so a Node `fetch` from main to a proxy URL works.
  - Phase 6 renderer: `App.tsx`, `components/Sidebar.tsx`, `ObjectTable.tsx` (selection via `selectedRowKey`, rows keyboard-accessible), `SearchBar.tsx`, `Dialog.tsx` (shared focus trap and Escape; reuse it for every dialog), `SsoBanner.tsx`, `api.ts`, `format.ts`, `styles/tokens.css`, `styles/components.css` (verbatim `tds component <id>` output, sections headed `/* tds component: <id> */`), `styles/app.css` (`app-` layout classes, semantic tokens only).
  - `test/unit/renderer-tokens.test.ts` scans renderer CSS and TSX for hex colors, primitive tokens, undefined `var(--x)`, and non-`tds-`/`app-` classes. New code must pass it.
  - Unit tests run in Node without a DOM. Put testable logic in pure modules.
- Environment facts established by the Coordinator:
  - The window CSP already allows `img-src`, `media-src`, `connect-src`, and `frame-src` for `http://127.0.0.1:*`. Do not change `src/main/window.ts` or `src/renderer/index.html`.
  - Existing TDS sections in `components.css`: button, icon-button, text-input, select, checkbox, field-label, field-caption, field-validation, dialog, data-table, breadcrumb, announcement, side-nav, nav-list, nav-item, spinner, progress-indicator, tag. If you need more, append only verbatim `tds component <id>` output with the same section header; candidates are `listed-progress-item`, `radio`, `radio-group`, `tooltip`. There is no TDS drawer or toolbar: build them as `app-` layout over `tds-btn`, `tds-icon-button`, and `progress-indicator`.

## Invariants & Boundaries
- DESIGN invariants 1, 3, and 5. The renderer never builds S3 URLs or presigned URLs and never receives secrets; every viewer source is a URL returned by `stream.open` or `stream.openUrl`. Source objects are deleted only by main after a confirmed copy (already implemented; do not reimplement in the renderer).
- Proxy content safety (carry-forward from Phase 5): the proxy may serve attacker-chosen `text/html` or `image/svg+xml`. The viewer must never put a proxy URL into an `<iframe>`, `<object>`, `<embed>`, or `window.open` unless the `contentType` returned by `stream.open`/`openUrl` is exactly `application/pdf` (parameters stripped, case-insensitive). SVG is shown only through `<img>`. HTML, XML, and every other text type are shown as escaped text through `TextView`.
- Markdown renders as escaped plain text with monospace formatting. No HTML rendering, no `dangerouslySetInnerHTML`, and no new Markdown dependency.
- The text preview fetches the proxy URL with header `Range: bytes=0-2097151` and decodes as UTF-8 with replacement; it shows a "Showing first 2 MB" note when `size` exceeds 2,097,152.
- TDS rules (`tds rules`) are binding: light theme, semantic tokens only, `tds-*` component classes copied from TDS, `app-` layout classes. Do not invent component styles.
- Allowed files. Create: `src/renderer/src/components/Viewer.tsx`, `components/viewer/{MediaView,TextView,PdfView,ImageView}.tsx`, `components/{OpenUrlDialog,Toolbar,RenameDialog,ConfirmDeleteDialog,OperationReport,TransfersDrawer}.tsx`, `src/renderer/src/mediaKind.ts`, `src/main/openExternal.ts`, `test/unit/mediaKind.test.ts`, `test/unit/openExternal.test.ts`, and other pure helpers under `src/renderer/src/` with tests in `test/unit/renderer-*.test.ts`. Modify: `src/main/ipc/register.ts`, `src/main/ipc/stream.ts`, `src/shared/ipc.ts`, `src/shared/channels.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/ObjectTable.tsx` (selection and refresh hooks only), `src/renderer/src/api.ts`, `styles/components.css` (verbatim appends only), `styles/app.css`, and existing unit tests that enumerate channels or the `Api` shape. Anything else is out of scope; if you need it, ask.
- Out of scope: `src/main/stream/**`, `src/main/s3/**`, `src/main/window.ts`, `src/main/index.ts` unless the handler cannot receive the proxy any other way (ask first), `test/integration/**`, `package.json`, `pnpm-lock.yaml`, configs. Secret-bearing paths: never read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, or any real key.

## Contracts

### Contract 1: `mediaKind.ts`
`mediaKind(contentType: string, key: string): ViewerKind` where `ViewerKind` is `"video" | "audio" | "image" | "pdf" | "text" | "unsupported"`. Content type wins when it is specific; fall back to the key extension when the type is empty, `application/octet-stream`, or `binary/octet-stream`. Formats per DESIGN constraints: video mp4, m4v, webm, mkv (`video/x-matroska`), mov only if `video/mp4`-compatible type; audio mp3, aac, m4a, flac, ogg, oga, opus, wav; images jpeg, png, gif, webp, avif, svg; pdf only for `application/pdf` (an extension of `.pdf` with a non-pdf specific type is not `pdf`); text for `text/*`, json, xml, yaml, toml, markdown, and common code extensions (ts, tsx, js, py, go, rs, java, c, h, cpp, sh, css, html, sql, csv, log, ini, conf). Export `isMkv(contentType, key)` and `isPdfContentType(contentType)` helpers. Unit tests cover every listed format, the octet-stream fallback, the pdf-extension-with-html-type case (must be `text`), and an unknown binary (`unsupported`).

### Contract 2: Viewer
- Selecting an object row (click or Enter) calls `stream.open` and shows `Viewer` in a pane beside or below the table (layout is yours, `app-` classes). A close button returns to the table-only layout. Opening a new object aborts the previous load. Folder rows keep navigating.
- `MediaView` uses `<video controls>` or `<audio controls>` with `src` = proxy URL. On `error` with `MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) show the "Format not supported" announcement with an "Open with system app" button. On a network or decode error after playback started show "Playback interrupted" with Retry; Retry reloads the same URL and seeks to the saved `currentTime` once metadata loads. For MKV, after `loadedmetadata`, if the element exposes no audio track (use `audioTracks?.length === 0` when available, else `mozHasAudio`/`webkitAudioDecodedByteCount === 0` after 3 seconds of playback) show a non-blocking notice offering Open with system app.
- `ImageView` uses `<img>` with `alt` = file name; error shows "Format not supported" with Open with system app.
- `PdfView` uses `<iframe title=... src=proxyUrl>` only when `isPdfContentType` is true.
- `TextView` fetches with the Range header above, renders inside `<pre class="app-...">` as a React text child (escaped), monospace via tokens.
- `unsupported` shows file name, size, and the Open with system app button.

### Contract 3: Open with system app (main)
- New channel `files:openWithSystemApp` (name the constant `filesOpenWithSystemApp`) with request `{ url: string (max 8192), fileName: string (1..255) }` and response `{ opened: boolean }`, added to the schemas, response schemas, `Api` (`files.openWithSystemApp`), preload, and register.
- `src/main/openExternal.ts` exports a pure-ish function taking injected deps `{ proxyOrigin(): string, fetch, tempRoot: string, openPath(path): Promise<string> }`. It rejects with `REQUEST_FAILED` unless `new URL(url).origin === proxyOrigin()`. It sanitizes `fileName` to a basename without path separators, NUL, or leading dots (fallback `download`), creates a fresh directory with `fs.mkdtemp(path.join(tempRoot, "s3me-open-"))`, streams the response body to the file (no full buffering), and calls `openPath`; a non-empty string from `openPath` is an error. On failure it removes the partial file. Non-2xx proxy responses reject with the status in the message and no URL in the message.
- Wire it in `register.ts` (or `stream.ts`) with `proxyOrigin` derived from `deps.stream.proxy.urlFor("x")`, `tempRoot = app.getPath("temp")`, `openPath = shell.openPath`, global `fetch`.
- `test/unit/openExternal.test.ts` covers: wrong origin rejected without fetching, filename sanitization (`../../etc/passwd`, `a/b`, `.hidden`, empty), streamed write and openPath call, non-2xx rejects and leaves no file, openPath error string rejects.

### Contract 4: Open URL dialog
Toolbar or header button "Open URL" opens `OpenUrlDialog` (shared `Dialog`). Fields: URL text input and a signing-connection `select` listing every connection plus "Anonymous". Default per DESIGN flow 5: if the URL parses (renderer-side only for the default choice; a pure helper may extract bucket from `s3://bucket/...`, `bucket.s3.<region>.amazonaws.com`, `s3.<region>.amazonaws.com/bucket/...`, or `<endpoint-host>/bucket/...`) and a connection lists or pins that bucket (use pinned and extra buckets from connection views plus the currently loaded bucket list), preselect it; otherwise the selected sidebar connection; if the URL contains `X-Amz-Signature` or both `Signature` and `Expires`, preselect Anonymous. Submit calls `stream.openUrl` and shows the result in `Viewer` with the file name from the URL path's last segment. Errors show inline in the dialog. Put the default-choice logic in a pure helper with unit tests.

### Contract 5: Toolbar and file operations
- `Toolbar` above the table when a bucket is open: Upload (calls `transfers.upload`), New folder (dialog with name input; rejects empty or `/`-containing names; calls `ops.createFolder` with `prefix + name + "/"` as the folder key per the schema), Download (selected object only), Rename or move (selected object or folder), Delete (selected object or folder), Open URL, and Refresh. Buttons are disabled when not applicable. Drag and drop of files onto the table area calls `transfers.uploadPaths` with `transfers.pathsForFiles(files)`; show `rejectedCount` if non-zero.
- `RenameDialog`: target key input prefilled with the current key or prefix; object uses `ops.rename`, folder uses `ops.renamePrefix` with progress from `ops.onProgress` filtered by `opId`. Show a result through `OperationReport`.
- `ConfirmDeleteDialog`: for an object, the count is 1; for a folder, call `ops.countPrefix` first and show the exact count ("Delete 1,234 objects under photos/?") before any delete request; the confirm button is disabled until the count is known. Then `ops.delete` or `ops.deletePrefix` with progress.
- `OperationReport`: shows completed and remaining counts, the error message when present, and up to 50 remaining keys with a "+N more" line. No rollback.
- After any successful mutation, refresh the current listing.

### Contract 6: Transfers drawer
`TransfersDrawer` is a collapsible `app-` panel at the bottom listing transfers from `transfers.onProgress` and `transfers.onDone` (subscribe once in App, unsubscribe on unmount), with name, direction, a `progress-indicator`, bytes as `formatBytes`, state (running, done, failed, cancelled), and a Cancel `tds-icon-button` for running transfers. Download start returns `transferId` or null (user cancelled the save dialog: show nothing). Completed uploads into the current prefix refresh the listing.

## Tasks and Scopes
Work in two scopes in this order, with typecheck, test, and build passing at the end of each:
- Scope A: Contracts 1, 2, 3, and App wiring for the viewer.
- Scope B: Contracts 4, 5, 6.
The Coordinator will tell you which scope to run.

## Done When
- `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- `test/unit/mediaKind.test.ts`, `test/unit/openExternal.test.ts`, and the Open URL default-choice tests exist and pass.
- No `dangerouslySetInnerHTML`, no `<iframe>`/`<object>`/`<embed>` outside `PdfView`, no S3 or `amazonaws` URL construction in `src/renderer` beyond the pure default-choice parser.
- The token and class scanner passes.

## Rules
- Style: tabs, double quotes, one statement per line, braces on control flow, lines near 80 columns. Match surrounding code.
- Minimum code that meets the contracts. No speculative options.
- Do not commit, reset, stash, or run git commands that write. The Coordinator owns Git.
- Append decisions, deviations, assumptions, and test evidence to `docs/plans/s3-media-explorer/phase-07/notes.md` under the batch for your scope.
- If a contract conflicts with the code, stop and ask through a clarification instead of guessing.

## Response Format
Reply with the ERP block: `STATUS`, `FILES MODIFIED`, `CHECKS` (command and exit code, test count), `CONTRACT COVERAGE` (one line per contract), `CLARIFICATIONS NEEDED`, and `NEXT: TASK_COMPLETE | BLOCKED | CONTINUE_CONTEXT`.
