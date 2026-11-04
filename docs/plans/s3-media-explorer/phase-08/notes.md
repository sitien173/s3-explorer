# Phase 8 — Decision Notes

Workers append under their batch. The Coordinator reviews these before each checkpoint.

## Scope A: Debt Sweep (Non-UI)

### D1: Proxy CSP and nosniff Headers
- Added `applyCspHeader` in `src/main/stream/proxy.ts` attaching `Content-Security-Policy: sandbox; default-src 'none'` to every response whose MIME type is not `application/pdf` (case-insensitive, parameters stripped).
- Ensured `X-Content-Type-Options: nosniff` is sent on every response.
- Added unit tests in `test/unit/proxy.test.ts` for S3 and pass-through with HTML, SVG, and PDF.
- RED evidence: 4 tests failed with expected null CSP before proxy changes.

### D2: Download Transfer Part File Isolation
- Downloads write to `${destPath}.${id}.part` per transfer to avoid collisions.
- Error path redacts `${destPath}.${id}.part` before `${destPath}.part` and `destPath`.
- Added unit tests in `test/unit/transfers.test.ts` for unique part file lifecycle and two concurrent downloads to the same destination path.
- RED evidence: test asserting `${destPath}.${id}.part` existence failed before runner change.

### D3: Shared Error Code Mapper
- Exported `toErrorCode` helper in `src/main/ipc/register.ts`.
- Swapped `src/main/s3/ops.ts` `renamePrefix` to use `toErrorCode`, removing orphaned `errorSchema` import.
- Existing ops plan and IPC tests stay green.

### D4: TransferManager Pump Error Handling
- Replaced synchronous-throw catch block in `pump` to assign `task = Promise.reject(error)`.
- Reused existing rejection handler to finish transfer without duplicated status mapping.

### D5: Deterministic ipc-browse Tests
- Replaced all seven fixed 50 ms sleeps in `test/unit/ipc-browse.test.ts` with `vi.waitFor` watching concrete conditions (`search:done` event, queue drainage, listener deregistration).

### D6: Store Unit Test Temp Directory Cleanup
- Added `afterEach` hook in `test/unit/store.test.ts` removing all `mkdtemp` test directories recursively.

### D7: Refuse Dangerous Executables in openExternal & Quit Cleanup
- Refused opening sanitized names whose extension case-insensitively matches any of the 16 blocked extensions (`desktop`, `sh`, `bash`, `zsh`, `run`, `bin`, `appimage`, `jar`, `py`, `pl`, `rb`, `exe`, `msi`, `deb`, `rpm`, `command`) with `REQUEST_FAILED ("This file type cannot be opened")`.
- Tracked created `s3me-open-*` directories in `activeTempDirs` and exported `cleanupOpenExternal()`.
- Hooked `cleanupOpenExternal()` into `app.on("before-quit")` in `src/main/index.ts`.
- Updated test fixtures in `test/unit/openExternal.test.ts` using `.bin` for generic byte stream testing to `.dat` so blocked-extension check does not mask stream assertions.
- RED evidence: 20 tests failed before implementing the extension blacklist and cleanup export.

## Scope B: Smoke Flag and End-to-End Tests

- Added a `--smoke`-only listener on the first window's `did-finish-load` that exits the app with status 0; no renderer or IPC path was added.
- Added Playwright config with one worker and a cold-start timeout, plus the `pnpm e2e` script. Typecheck includes the E2E sources and config.
- Added an isolated fixture that creates temporary AWS config/credentials and user data, starts RustFS under a dedicated Compose project, seeds the generated `faststart.mp4`, and closes the app and removes the Compose project and temporary files on teardown.
- The end-to-end flow covers manual connection/session-only warning, bucket prefix browsing, MP4 seek and playback advancement, `s3://` Open URL, and upload/rename/delete verified with `ListObjectsV2` from the test process.
- Evidence: `pnpm typecheck` exit 0; `pnpm test` exit 0 (563 tests); `pnpm build` exit 0; `xvfb-run -a pnpm e2e` exit 0 twice (1 test each); `docker ps` showed no RustFS container; isolated `--smoke` launch under Xvfb exited 0.

## Scope C: Packaging, Smoke Script, and Docs

- Added electron-builder metadata for `S3 Media Explorer`, limited app files to
  `out/**` and `package.json`, and configured AppImage plus deb output in
  `dist/`. The Linux shared options are under `linux`; electron-builder 26.18.0
  defines Debian-specific options at top-level `deb`, so `libsecret-1-0` is
  declared there. No signing or publishing configuration was added.
- Generated `build/icon.png` locally with ffmpeg; verified it is a 512x512 PNG.
- Added an AppImage smoke script requiring exactly one artifact, falling back
  to `--appimage-extract-and-run` when `/dev/fuse` is unavailable, and using
  isolated user data, `--password-store=basic`, `--smoke`, and a 60-second
  timeout. It removes its temporary profile on exit.
- Added the README run/test/package/security overview and the manual checklist
  for AWS SSO, expired sessions, region redirects, keyring storage, and both
  package install paths. `dist/` was already gitignored; no lockfile or
  dependency changes were needed.
- First `pnpm dist` attempt exited 1 because Debian options were nested under
  `linux`; corrected the config to the 26.18.0 top-level `deb` field. Removed
  `dist/` before the successful final build to avoid stale artifacts.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0 (563 tests);
  `pnpm build` exit 0; final `pnpm dist` exit 0; `bash
  scripts/smoke-appimage.sh` exit 0; `dpkg-deb -I dist/*.deb` exit 0 and showed
  `Package: s3-media-explorer` and `Depends: libsecret-1-0`; artifact count
  check exit 0 (one `.AppImage`, one `.deb`).

## FIX 1

- F1: `before-quit` now calls synchronous recursive/forced temp cleanup; cleanup
  clears its tracked set and ignores removal errors. The unit test verifies the
  tracked directory and file are absent immediately after cleanup returns.
- F2: Moved `toErrorCode` into `src/main/ipc/browse.ts`; both IPC registration
  and S3 ops import the shared helper there, removing the register/S3 ops cycle.
- F3: Added an isolated synchronous-throw runner test asserting one failed
  terminal event and an empty manager.
- F4: The destroy-listener test waits for its injected search registry to empty
  after first confirming that the job was registered; removed the duplicate
  listener-count assertion.
- F5: Concurrent same-destination downloads block on held streams and verify
  both unique `.part` paths while active, then release one at a time and check
  each result. A second latched pair verifies both distinct final files intact.
- F6: Smoke script changes to the repository root before searching and uses
  `timeout -k 5 60s`.
- F7: README states that integration and e2e tests share RustFS port 19000 and
  must run sequentially.
- Verification: `pnpm typecheck` exit 0; `pnpm test` exit 0 (565 tests);
  `pnpm build` exit 0; `bash scripts/smoke-appimage.sh` exit 0. Build emitted
  existing unresolved spinner-asset warnings; AppImage smoke emitted a Wayland/
  Vulkan warning but exited successfully.
