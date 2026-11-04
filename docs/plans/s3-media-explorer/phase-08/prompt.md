# Phase 8: End-to-end tests, packaging, debt sweep, and manual checklist

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with TDS. Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/PLAN.md` (Phase 8) and `DESIGN.md`.
- Phase Outcome: Success criteria 2 to 5 are evidenced by automated Playwright `_electron` runs against RustFS, open debt from earlier phases is swept, and the app ships as AppImage and .deb with a smoke-tested launch.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-08/base`
- Prior State: Phases 1 to 7 are complete. `pnpm typecheck`, `pnpm test` (533 unit tests), `pnpm test:integration` (25), `pnpm build`, and `pnpm seek:2gb` exit 0.
- Installed and pinned already, do not add or change dependencies: `@playwright/test` 1.64.1, `electron` 45.2.1, `electron-builder` 26.18.0. Host tools: `xvfb-run`, `dpkg-deb`, `fakeroot`, `ffmpeg`, `docker`.
- RustFS harness: `test/rustfs/compose.yaml`, helpers in `test/integration/helpers.ts`. Media fixtures come from `test/fixtures/make-media.sh` into `test/.tmp/media` (check the script for exact names). `test/.tmp/`, `dist/`, `test-results/`, `playwright-report/` are gitignored.
- A working Playwright `_electron` probe the Coordinator used in Phase 7 lives at `/tmp/p7/probe.mjs` (read-only reference). It shows the selectors that work: `.tds-breadcrumbs`, rows as `[role=row]` (single click selects a folder, a second click or double-click or Enter opens it), `.app-viewer`, `Open URL` button, `.tds-select__trigger`, dialogs as `[role=dialog]`.
- `src/main/index.ts` passes the Electron `dialog` module to `register` as `deps.dialog`; handlers call `deps.dialog.showOpenDialog` and `showSaveDialog` at call time, so an e2e test can stub them with `electronApp.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [...] }) })`.
- With `--password-store=basic` the vault is session-only, so the session-only warning appears after adding a manual connection.

## Invariants & Boundaries
- Every DESIGN invariant applies. The renderer never receives secrets and never builds S3 URLs.
- End-to-end tests launch the built app (`out/main/index.js`) with an isolated `--user-data-dir` under `test/.tmp/` and `--password-store=basic`, with `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointing to temporary files under `test/.tmp/`. Never read the real `~/.aws` or the user keyring.
- E2E and smoke run under `xvfb-run -a`. No code signing or publishing configuration.
- Never read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, or any real key.

## Contracts

### Scope A: debt sweep (non-UI)
- D1 `src/main/stream/proxy.ts`: every proxy response whose content type is not exactly `application/pdf` (case-insensitive, parameters stripped) carries `Content-Security-Policy: sandbox; default-src 'none'`. Every response carries `X-Content-Type-Options: nosniff`. Unit tests in `test/unit/proxy.test.ts` for S3 and pass-through, HTML, SVG, and PDF.
- D2 `src/main/s3/transfers.ts`: each download writes to a part file unique per transfer (for example `${destPath}.${id}.part`), and the failure-path path redaction uses the same name. Unit test with two concurrent downloads to one `destPath`.
- D3 `src/main/s3/ops.ts` `renamePrefix`: drop its own `errorSchema.shape.code.safeParse` mapper and use one shared helper with `register.ts` (export it from a single place). No behaviour change; existing tests stay green.
- D4 `src/main/s3/transfers.ts` `pump`: in the synchronous-throw catch, set the task to `Promise.reject(error)` and let the existing rejection handler finish it; remove the duplicated mapping.
- D5 `test/unit/ipc-browse.test.ts`: replace the seven fixed 50 ms sleeps with `vi.waitFor` on a concrete condition or an awaited event.
- D6 `test/unit/store.test.ts`: remove every `mkdtemp` directory in `afterEach`.
- D7 `src/main/openExternal.ts`: refuse (REQUEST_FAILED "This file type cannot be opened") sanitized names whose extension, case-insensitive, is one of `desktop sh bash zsh run bin appimage jar py pl rb exe msi deb rpm command`; track created `s3me-open-*` directories and export a cleanup function that removes them, called from `before-quit` in `src/main/index.ts`. Unit tests for both.

### Scope B: smoke flag and end-to-end tests
- `--smoke` in `src/main/index.ts`: only when `process.argv` includes `--smoke`, the first window's `webContents` `did-finish-load` triggers `app.exit(0)`. There is no IPC channel or renderer path for it, and it does nothing else. Unit-test the argv check if you extract it into a pure helper.
- `playwright.config.ts`: testDir `e2e`, one worker, timeout suited to a cold Electron start, no browsers projects.
- `e2e/fixtures.ts`: starts RustFS through the compose file (reuse `test/integration/helpers.ts` if it fits), generates media through `make-media.sh` when missing, seeds a bucket, writes the temp AWS files, launches the app with the isolation flags and env, and tears everything down, including the container.
- `e2e/app.spec.ts` drives one full flow and asserts:
  - add a manual connection to RustFS and see the session-only warning;
  - browse into the seeded prefix;
  - select an MP4, seek to the middle, and see `currentTime` advance after the seek;
  - Open URL with an `s3://bucket/key` URL shows the object in the viewer;
  - upload (stub `showOpenDialog`), rename, and delete, each confirmed through the S3 SDK (`HeadObject` or `ListObjectsV2`) from the test process.
- `package.json` script `"e2e": "playwright test"`. The run command is `xvfb-run -a pnpm e2e` after `pnpm build`.

### Scope C: packaging, smoke script, docs
- `electron-builder.yml`: appId, productName "S3 Media Explorer", `directories.output: dist`, files limited to `out/**` and `package.json`, Linux targets `AppImage` and `deb`, category `Utility` or `AudioVideo`, maintainer metadata, deb `depends` including `libsecret-1-0`, icon `build/icon.png`. No publish, no signing.
- `build/icon.png`: 512x512 PNG generated locally (ffmpeg is fine).
- `package.json`: `"dist": "electron-vite build && electron-builder --linux AppImage deb"`, plus `description`, `author` with email, and `homepage` if electron-builder needs them for deb. Use placeholder maintainer `S3 Media Explorer Maintainers <maintainers@example.invalid>`.
- `scripts/smoke-appimage.sh`: `set -euo pipefail`, finds exactly one `dist/*.AppImage`, runs it under `xvfb-run -a` with `--appimage-extract-and-run` if FUSE is unavailable, an isolated `--user-data-dir` in a mktemp dir, `--password-store=basic`, and `--smoke`, with a timeout (60 s); exits 0 only when the app exits 0; removes its temp dir.
- `docs/manual-checklist.md`: real AWS SSO sign-in, expired SSO session banner, region redirect for a bucket outside the profile region, keyring-backed secrets on a desktop session, AppImage and .deb install.
- `README.md`: what the app does, prerequisites (`node`, `pnpm`, `docker`, `ffmpeg`, `xvfb-run`), run, test (unit, integration with RustFS as the test backend, e2e, seek check), package, and the security model in a few lines.

## Tasks and Scopes
Run the scope the Coordinator names. Each scope ends with `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0, plus the scope's own checks:
- Scope A: `pnpm test:integration`.
- Scope B: `xvfb-run -a pnpm e2e` exit 0 twice, and no RustFS container left afterwards (`docker ps`).
- Scope C: `pnpm dist`, `bash scripts/smoke-appimage.sh`, `dpkg-deb -I dist/*.deb` showing the package name and `libsecret-1-0`; `dist/` holds exactly one `.AppImage` and one `.deb`.

## Done When
- Every Verification Check in PLAN.md Phase 8 exits 0: typecheck, test, test:integration, build, `xvfb-run -a pnpm e2e`, `pnpm dist`, `bash scripts/smoke-appimage.sh`, `dpkg-deb -I dist/*.deb`.
- D1 to D7 are done with tests.

## Rules
- Style: tabs, double quotes, one statement per line, braces on control flow, about 80 columns. Match surrounding code.
- Minimum code that meets the contracts.
- Do not commit, reset, stash, or run git commands that write. The Coordinator owns Git.
- Append decisions, deviations, and evidence to `docs/plans/s3-media-explorer/phase-08/notes.md` under your scope.
- If a contract conflicts with the code, stop and ask instead of guessing.

## Response Format
Reply with the ERP block: `STATUS`, `FILES MODIFIED`, `CHECKS` (command, exit code, test count), `CONTRACT COVERAGE` (one line per item), `CLARIFICATIONS NEEDED`, and `NEXT: TASK_COMPLETE | BLOCKED | CONTINUE_CONTEXT`.
