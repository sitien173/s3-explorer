# Phase 1 — Decision Notes

## Task 1

### Decisions made
- Listed optional/native dependency build scripts as explicitly disallowed; only Electron's script is enabled.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- pnpm-generated `minimumReleaseAgeExclude` entries are lockfile-policy metadata and remain as generated.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm install` -> `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: electron-winstaller@5.4.0`.
  - GREEN: `pnpm install --frozen-lockfile` -> `Already up to date`; no ignored-build warning. `pnpm exec electron --version` -> `v45.2.1`.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Applied the strict CSP both as an Electron session response header and renderer HTML meta policy.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- External link opening should dispatch only HTTPS URLs and should always deny the in-window popup.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> 2 failures: `expected false to be true` for sandbox and `expected 'default-src \'none\'' to contain 'default-src \'self\''` for CSP.
  - GREEN: `pnpm test` -> 1 file passed, 2 tests passed; `pnpm typecheck` -> exit 0; `pnpm build` -> main, preload, renderer bundles built.
  - Security assertion coverage checks all three preferences and the CSP directive and unsafe tokens; any changed expected setting or removal of `default-src 'self'` fails its corresponding expectation.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Used RustFS tmpfs at the documented `/data` volume path with mode 1777 to permit the container's runtime user to initialize it.

### Spec deviations
- none

### Tradeoffs accepted
- Integration setup requires Docker and removes its test container/volumes on teardown.

### Assumptions
- RustFS serves S3 with path-style requests at port 9000 and accepts its specified default test credentials.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test:integration` -> initially failed readiness after 60 seconds; root-cause reproduction via `docker compose ... logs` showed `[FATAL] Server runtime failed: Io error: Permission denied (os error 13)` on tmpfs `/data`.
  - GREEN: `pnpm test:integration` -> 1 file passed, 1 test passed; verified 206, content range and returned bytes. Teardown removed container and network. Fresh `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test` (2 passed), and `pnpm build` also exited 0.
- Root cause (bugfix only): RustFS process could not write its default data directory on default-permission tmpfs; relaxed tmpfs mode resolves initialization.

## FIX batch 1

### Decisions made
- Set the sandbox-compatible preload to CommonJS output `out/preload/index.cjs`; used electron-vite 6's `build.rolldownOptions.output.format` and `entryFileNames` options confirmed in its installed type declarations and implementation.
- Disable the React plugin only in dev to omit its inline Fast Refresh preamble; standard Vite React/TSX rendering and HMR remain enabled.

### Spec deviations
- none

### Tradeoffs accepted
- Dev doesn't provide React Fast Refresh. HMR socket remains allowed; dev CSP permits inline styles only, and production CSP remains unchanged.

### Assumptions
- Electron-vite's `out/main/index.js` ESM shim `const __dirname = import.meta.dirname` resolves relative to its output path; verified in the built bundle and through successful preload assertion launch.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED F1: `xvfb-run -a pnpm exec electron .` -> `Unable to find Electron app` / `Cannot find module '/home/ngosi/projects/s3-explorer'`, confirming missing package entry point.
  - RED F2: before preload changes, `xvfb-run -a node test/.tmp/probe.cjs` -> `PROBE {"apiType":"undefined","requireType":"undefined","processType":"undefined"}`. Prior build artifacts were `out/preload/index.mjs` while the configured path targeted `index.js`; `out/main/index.js` contained `const __dirname = import.meta.dirname`.
  - GREEN F1/F2: after `pnpm build`, `timeout 20 xvfb-run -a pnpm exec electron-vite preview` launched and remained running until timeout (exit 124), with no `No entry point` error. Built output contains `out/preload/index.cjs`; `xvfb-run -a node test/.tmp/probe.cjs` -> `PRELOAD_ASSERTIONS {"apiType":"object","frozen":true,"keys":0,"requireType":"undefined","processType":"undefined"}`.
  - RED F5: temporarily changed renderer meta CSP from `default-src 'self'` to `default-src 'none'`; `pnpm test` -> assertion expected production CSP equality, received different meta content. Restored exact production CSP.
  - GREEN F5: `pnpm test` -> 4 tests passed, including exact CSP match.
  - RED F4: `timeout 30 xvfb-run -a env ELECTRON_ENABLE_LOGGING=1 pnpm dev` -> console reported inline script violation under `script-src 'self'` and `@vitejs/plugin-react can't detect preamble`.
  - GREEN F4: same command -> placeholder rendered, Vite connected; no `Refused to`/CSP violation messages. Only harmless meta `frame-ancestors` ignored warning. Dev-specific CSP is tested and production `CSP` remains constant.
  - Final fresh checks: `pnpm install --frozen-lockfile` exit 0; `pnpm typecheck` exit 0; `pnpm test` 4 passed; `pnpm test:integration` 1 passed; `pnpm build` exit 0.
- Root cause (bugfix only): F1 package lacked Electron `main`; F2 ESM preload naming/path incompatible with Electron sandbox's CommonJS preload. F4 React dev inline refresh preamble violated strict script policy.

## FIX batch 2

### Decisions made
- Permission handlers deny all permissions unconditionally, leaving any future allowlist decision to a later implementation phase.
- External URL parsing returns canonical `URL.href` only for valid HTTPS URLs with a non-empty hostname.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- Electron permission request/check callback signatures match the documented runtime API and callbacks are available on the BrowserWindow session.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` after adding the runtime security regressions and inert `toExternalHttpsUrl` scaffolding -> 5 behavioral failures: missing `will-redirect` prevention, non-normalized HTTPS popup URL, both valid URL normalization cases returning null, and missing permission callback denial. 15 existing/new tests passed.
  - GREEN: `pnpm test` -> 1 file passed, 20 tests passed. Covers navigation/redirect/webview prevention, all allowed and rejected URL inputs, rejected `openExternal` promise, deny-all permissions, production/dev CSP response values, and existing CSP/meta assertions.
  - GREEN C2: `timeout 30 xvfb-run -a env ELECTRON_ENABLE_LOGGING=1 pnpm dev` -> Vite on `http://localhost:5173/`, `[vite] connected.`, no `Refused to` CSP messages. Process remained running until timeout (124); only non-CSP compositor/frame-ancestors notices appeared.
  - GREEN C1 and final checks: `pnpm install --frozen-lockfile` exit 0; `pnpm typecheck` exit 0, with no `tsbuildinfo` entries in `git status --porcelain`; `pnpm test` 20 passed; `pnpm test:integration` 1 passed; `pnpm build` exit 0.
- Root cause (bugfix only): Window runtime lacked redirect/webview and permission denial defenses; URL prefix checking did not canonicalize URLs and could dispatch rejected external-open promises; TypeScript build artifacts were not ignored and the dev port was not pinned.
