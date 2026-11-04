# Phase 7 — Decision Notes

Workers append under their batch. The Coordinator reviews these before each checkpoint.

## Batch 1: Scope A

### Decisions made
- Implemented Contract 1 in `src/renderer/src/mediaKind.ts` exporting `mediaKind`, `isMkv`, and `isPdfContentType`.
- Dynamic module import pattern used in `test/unit/mediaKind.test.ts` to satisfy `tsconfig.node.json` project boundaries without editing out-of-scope config files.
- Implemented Contract 2 in `src/renderer/src/components/Viewer.tsx` and `src/renderer/src/components/viewer/{MediaView,ImageView,PdfView,TextView}.tsx`.
- MediaView handles error code 4, playback interruptions with retry at saved `currentTime`, and MKV audio track detection.
- TextView streams first 2 MB using `Range: bytes=0-2097151` with UTF-8 replacement decoding.
- Implemented Contract 3 in `src/main/openExternal.ts` with origin validation, filename sanitization, streamed filesystem write, and `openPath` invocation.
- Added IPC channel `files:openWithSystemApp` across channels, ipc schemas, preload, and register.
- Wired `App.tsx` and `ObjectTable.tsx` so selecting object rows launches Viewer in a side pane, and folder rows navigate.

### Spec deviations
- None.

### Tradeoffs accepted
- None.

### Assumptions
- `shell.openPath` returning an empty string indicates success per Electron API contracts.

### Follow-ups for human
- None.

### Test evidence
- `pnpm typecheck` -> exit 0
- `pnpm test` -> exit 0 (20 test files, 448 tests passed)
- `pnpm build` -> exit 0

## Batch 2: Scope B

### Decisions made
- Implemented pure URL connection chooser in `src/renderer/src/urlChoice.ts`.
- Added unit tests for URL parsing in `test/unit/renderer-url-choice.test.ts`.
- Implemented `OpenUrlDialog` with connection picker and Anonymous option.
- Implemented `Toolbar` with actions for upload, folder, download, rename, delete.
- Implemented `RenameDialog` with progress and partial failure reporting.
- Implemented `ConfirmDeleteDialog` with exact count check via `ops.countPrefix`.
- Implemented `OperationReport` displaying completed and remaining keys.
- Implemented `TransfersDrawer` tracking active and completed jobs.
- Implemented drag-and-drop upload handling with rejected file reporting.
- Maintained transfer metadata map in `App.tsx` for done events.
- Wired table mutations to refresh object listings.

### Spec deviations
- None.

### Tradeoffs accepted
- None.

### Assumptions
- Transfer done payload relies on progress payload metadata for bucket context.

### Follow-ups for human
- None.

### Test evidence
- `pnpm typecheck` -> exit code 0
- `pnpm test` -> exit code 0 (21 test files, 467 tests passed)
- `pnpm vitest run test/unit/renderer-tokens.test.ts` -> exit code 0 (12 tests passed)
- `pnpm build` -> exit code 0

## FIX 1

### Decisions made
- B1: Reset OpenUrlDialog only on isOpen false-to-true transitions using prevIsOpenRef; memoized currentBucketList in App.
- N1: Bumped loadIdRef on every Viewer load path and in effect cleanup to cancel in-flight stream opens.
- N2: Implemented readBoundedStream pure helper in src/renderer/src/textReader.ts to cap text stream reading at 2,097,152 bytes with reader cancellation; TextView skips fetching when size === 0 and avoids unbounded arrayBuffer() calls. Added unit tests in test/unit/renderer-text-cap.test.ts.
- N3: Removed shell and app fallbacks in register.ts; enforced complete OpenExternalDeps and returning REQUEST_FAILED on missing dependencies; wired concrete openExternal deps from Electron in src/main/index.ts; updated openExternal.test.ts.
- N4: Added redirect: "error" and AbortSignal.timeout(30000) to fetch in openExternal.ts; removed dead non-web-stream branch; implemented truncateUtf8 to cap sanitized names at 200 UTF-8 bytes preserving extension; added unit tests.
- N5: Handled transfer errors in App.tsx by displaying messages in the app announcement banner; recorded transferIds immediately in state; cleared transferMetaMapRef on done; removed misleading comments.
- N6: Cleared viewerTarget in App.tsx after rename/delete when viewed key matches or is under affected prefix.
- N7: Ignored duplicate row selection in handleSelectObject when viewer already displays the target key.
- N8: Returned "unsupported" for .pdf with generic content type; registered specific media types (video/x-m4v, audio/x-aac, audio/aacp, audio/x-m4a, application/ogg, video/ogg, audio/x-flac, audio/x-wav); updated unit tests.
- N9: Handled MediaError code 2 as playback interruption with Retry; retained MKV audio probe and noted that mozHasAudio and webkitAudioDecodedByteCount are absent in Chromium.
- N10: Added useId with htmlFor/id pairings to all labels and input fields in OpenUrlDialog, New folder dialog (App.tsx), and RenameDialog.
- N11: Ignored onClose during active submission/deletion in RenameDialog and ConfirmDeleteDialog.
- N12: Converted TransfersDrawer header to a single button without nested buttons; implemented TDS progress-indicator markup with role="progressbar" and aria values.

### Spec deviations
- None.

### Tradeoffs accepted
- None.

### Assumptions
- Note on Chromium audio properties: `mozHasAudio` and `webkitAudioDecodedByteCount` are absent in Chromium, so HTMLMediaElement.audioTracks is the standard interface when supported.

### Follow-ups for human
- None.

### Test evidence
- `pnpm typecheck` -> exit code 0
- `pnpm test` -> exit code 0 (22 test files, 513 tests passed)
- `pnpm vitest run test/unit/renderer-tokens.test.ts` -> exit code 0 (12 tests passed)
- `pnpm build` -> exit code 0

## FIX 2

### Decisions made
- B1: Removed post-response metadata sets in `App.tsx`.
- B1: Retained error handling and banner notifications.
- B1: Extracted transfer state helpers with unit tests.
- B2: Scoped 30s timeout to headers only.
- B2: Cleared header timeout timer on all paths.
- B2: Added slow stream and timeout unit tests.
- N1: Restricted viewer clear logic to S3 targets.
- N1: Matched target connection ID and bucket before clear.
- N2: Blocked close in New Folder during submit.
- N2: Blocked close in Open URL during submit.
- N3: Trimmed incomplete trailing UTF-8 sequences in `textReader.ts`.
- N3: Prevented trailing replacement character decoding at preview cap.

### Spec deviations
- None.

### Tradeoffs accepted
- None.

### Assumptions
- None.

### Follow-ups for human
- None.

### Test evidence
- `pnpm typecheck` -> exit code 0
- `pnpm test` -> exit code 0 (23 test files, 533 tests passed)
- `pnpm vitest run test/unit/renderer-tokens.test.ts` -> exit code 0 (12 tests passed)
- `pnpm build` -> exit code 0


