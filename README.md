# S3 Media Explorer

S3 Media Explorer is a Linux Electron desktop app for browsing, searching,
managing, and streaming media objects in S3 and S3-compatible storage.

## Prerequisites

- Node.js and pnpm
- Docker (for RustFS-backed integration and end-to-end tests)
- ffmpeg (to generate media test fixtures)
- `xvfb-run` (for headless Electron end-to-end and packaging smoke tests)

## Run

Install dependencies with `pnpm install`, then start the development app with
`pnpm dev`. Add an AWS profile or S3-compatible connection in the app.

## Test

- `pnpm typecheck` checks TypeScript.
- `pnpm test` runs unit tests.
- `pnpm test:integration` runs integration tests against RustFS, not AWS.
- Integration tests and e2e both use RustFS on port 19000; run them
  sequentially, not at the same time.
- `pnpm build` builds the app.
- `xvfb-run -a pnpm e2e` runs the Electron end-to-end test against RustFS.
- `pnpm seek:2gb` runs the large-file seeking check.

## Package

`pnpm dist` creates Linux AppImage and Debian packages in `dist/`. After
building, `bash scripts/smoke-appimage.sh` launches the AppImage in an isolated
headless profile.

## Security

The renderer is sandboxed and does not receive credentials or construct S3
URLs. The main process signs S3 requests through a loopback-only proxy, and
secrets use Electron's OS-backed secure storage when available. Headless tests
use an isolated user-data directory and the session-only basic password store.
