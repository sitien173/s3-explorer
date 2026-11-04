# S3 Media Explorer Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `s3-media-explorer`
**Base:** `refs/plans/s3-media-explorer/base` (`578a6ac`)
**Commit:** `feat(app): add S3 media explorer desktop app with streaming, browsing, URL playback, and multi-bucket management`

## Outcome & Scope

Build the Linux desktop app specified in [DESIGN.md](DESIGN.md). It is an Electron app with a sandboxed React renderer styled with TDS. The main process holds the AWS SDK for JavaScript v3 and serves all object bytes through a `127.0.0.1` signing proxy. The app ships as AppImage and .deb.

Preserved invariants, which are DESIGN.md invariants 1 to 5 and apply in every phase:

1. App-held AWS secrets, session tokens, and app-generated signed URLs never cross IPC to the renderer.
2. The stream proxy binds only to `127.0.0.1`. It returns 403 when the token is missing, when the handle is unknown, and when the method is not GET or HEAD.
3. A source object is never deleted before its copy is confirmed.
4. No secret is persisted unless `safeStorage.getSelectedStorageBackend()` is neither `basic_text` nor `unknown` and `safeStorage.isEncryptionAvailable()` is true.
5. Every BrowserWindow uses `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`. A strict CSP is set. Navigation and `window.open` are blocked except through `shell.openExternal`.

Out of scope: every DESIGN.md non-goal. No ESLint: `typescript-eslint@8.72.1` requires `typescript <6.1.0`, and the design does not require linting, so `pnpm typecheck` is the static gate.

Secret-bearing paths are out of scope for every worker:

- Do not read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, or any real key.
- Tests use temporary fixture directories and the RustFS defaults `rustfsadmin`/`rustfsadmin` only.

Pinned toolchain, read from the npm registry on 2026-11-03:

| Package | Version |
|---|---|
| `electron` | `45.2.1` |
| `electron-vite` | `6.0.0` |
| `electron-builder` | `26.18.0` |
| `vite` | `8.3.5` |
| `@vitejs/plugin-react` | `6.2.1` |
| `react`, `react-dom` | `19.3.1` |
| `@types/react`, `@types/react-dom` | `19.3.0` |
| `typescript` | `6.0.3` |
| `@types/node` | `26.6.6` |
| `vitest` | `5.1.0` |
| `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner` | `3.1161.0` |
| `@smithy/shared-ini-file-loader` | `4.7.2` |
| `zod` | `4.6.7` |
| `@tanstack/react-virtual` | `3.14.25` |
| `@playwright/test` | `1.64.1` |
| RustFS test image | `rustfs/rustfs:1.0.4` |

Verified facts the phases rely on:

- AWS SDK JS v3 `S3Client` accepts a client-level `profile` option, available since v3.714.0. That profile then drives region, credentials including SSO, and shared-config `endpoint_url`.
- `S3Client` accepts `followRegionRedirects: true`.
- On Linux, Electron `safeStorage.getSelectedStorageBackend()` returns `basic_text` when no secret store exists. It returns `unknown` before `ready`.
- pnpm 11 blocks dependency build scripts unless they are listed under `allowBuilds` in `pnpm-workspace.yaml`. `/home/ngosi/pnpm-workspace.yaml` exists, so the repository needs its own `pnpm-workspace.yaml` to be its own workspace root.
- MinIO no longer publishes Docker images. RustFS `1.0.4` serves S3 on port 9000 with default credentials `rustfsadmin`/`rustfsadmin`.

## Baseline Evidence

- `git status --porcelain` at base `578a6ac`: empty.
- `pnpm test` at base: exit 1. pnpm resolved the parent workspace `/home/ngosi/pnpm-workspace.yaml` and failed with `ERR_PNPM_IGNORED_BUILDS` for that workspace's dependencies. The repository has no `package.json`. Phase 1 repairs the baseline, and no verification command below exists before Phase 1.
- Tooling present: Node `v24.18.0`, pnpm `11.22.0`, Docker `29.1.3`, Docker Compose `2.40.3`, ffmpeg, `xvfb-run`, WebKitGTK not required.

### Phase 1: Toolchain scaffold and secure window shell

**Task Guide Input:**
- Create the pnpm, TypeScript, electron-vite, Vitest, and RustFS test harness for a new Electron app.
- Add a secure BrowserWindow with an empty React renderer.
- Use cases: repository scaffolding, build configuration, Docker test infrastructure, unit and integration test harness.

**Goal:** `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exist and pass on a minimal secure app shell.

**Invariants & Boundaries:**
- Invariant 5 is established here and must be covered by a unit test.
- No S3 logic and no UI beyond a placeholder root.
- Pin exactly the versions in the toolchain table. Use exact versions, not caret ranges.
- `allowBuilds` lists only packages whose install scripts are needed, such as `electron`. Every other package that pnpm reports is set to `false` explicitly.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main/index.ts`
- Create: `src/main/window.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `test/unit/window.test.ts`
- Create: `test/rustfs/compose.yaml`
- Create: `test/integration/global-setup.ts`
- Create: `test/integration/rustfs.test.ts`

**Tasks:**
1. Write `package.json` and `pnpm-workspace.yaml`.
   - `package.json` holds the pinned dependencies and these scripts:
     - `typecheck`: `tsc` for the node and web projects.
     - `test`: Vitest `unit` project.
     - `test:integration`: Vitest `integration` project.
     - `build`: `electron-vite build`.
     - `dev`: `electron-vite dev`.
   - `pnpm-workspace.yaml` sets `packages: ['.']` and `allowBuilds`.
   - `.gitignore` excludes `node_modules/`, `out/`, `dist/`, `test/.tmp/`, `test-results/`, `playwright-report/`.
2. Write the failing test `test/unit/window.test.ts` first. It asserts the `webPreferences` and CSP that `src/main/window.ts` exports, from a pure function such as `buildWindowOptions()` and a `CSP` constant. Then implement `window.ts`, `index.ts`, and the preload, which exposes an empty frozen `api` through `contextBridge`. Also implement the renderer placeholder. Block `will-navigate` and route `setWindowOpenHandler` through `shell.openExternal` only for `https:` URLs.
3. Write `test/rustfs/compose.yaml`: `rustfs/rustfs:1.0.4`, host port `19000` mapped to `9000`, a tmpfs or named-volume data dir. Write `test/integration/global-setup.ts`, which runs `docker compose -f test/rustfs/compose.yaml up -d`, polls until a `ListBuckets` call with `rustfsadmin`/`rustfsadmin`, `forcePathStyle: true`, and region `us-east-1` succeeds within 60 s, and runs `docker compose ... down -v` in teardown. Write `test/integration/rustfs.test.ts`, which creates a bucket, puts an object, and reads it back with a `Range` header that yields 206 bytes.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- `test/unit/window.test.ts` fails if any of `sandbox`, `contextIsolation`, or `nodeIntegration` is changed or if the CSP lacks `default-src 'self'`.
- `pnpm install --frozen-lockfile` prints no `ERR_PNPM_IGNORED_BUILDS`.

**Reviewer Checklist:**
- Exact pinned versions with no caret ranges, matching the table.
- The CSP has no `unsafe-eval`. `unsafe-inline` is allowed only for `style-src` if Vite requires it in dev, and never in production.
- The preload exposes nothing but a frozen object.
- Compose uses `1.0.4`, not `latest`, and teardown removes volumes.

**Verification Checks:**
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`

### Phase 2: Connections, credentials, and S3 client factory

**Task Guide Input:**
- Implement main-process connection management: AWS profile discovery, manual-key connections with `safeStorage` encryption, an `S3Client` factory with endpoint, path-style, and region redirect handling, SSO error mapping, and `aws sso login` spawning.
- Expose these through zod-validated IPC.
- Use cases: backend logic, credential security, unit and integration tests.

**Goal:** The main process can create, list, update, and delete connections and build a working `S3Client` for each. The renderer can reach these only through typed IPC that never returns secrets.

**Invariants & Boundaries:**
- Invariants 1 and 4.
- Profile connections construct `new S3Client({ profile, region?, endpoint?, forcePathStyle, followRegionRedirects: true })`, so the SDK resolves profile credentials, SSO, and `endpoint_url`. A user override of the endpoint or region applies only to that `S3Client`.
- `safeStorage` is reached through an injectable `SecretCipher` interface, so unit tests run without Electron.
- No UI in this phase.

**Files:**
- Create: `src/shared/ipc.ts`
- Create: `src/main/connections/profiles.ts`
- Create: `src/main/connections/store.ts`
- Create: `src/main/connections/secrets.ts`
- Create: `src/main/s3/client.ts`
- Create: `src/main/sso.ts`
- Create: `src/main/ipc/register.ts`
- Create: `src/main/ipc/connections.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `test/unit/profiles.test.ts`
- Create: `test/unit/store.test.ts`
- Create: `test/unit/client.test.ts`
- Create: `test/unit/sso.test.ts`
- Create: `test/unit/secret-scan.ts`
- Create: `test/unit/ipc-connections.test.ts`
- Create: `test/fixtures/aws/config`
- Create: `test/fixtures/aws/credentials`
- Create: `test/integration/client.test.ts`

**Tasks:**
1. Profile discovery in `profiles.ts`. Use `@smithy/shared-ini-file-loader` `loadSharedConfigFiles` with explicit `filepath` and `configFilepath` for tests. It returns `{ name, region?, endpointUrl?, kind: 'sso' | 'static' | 'other' }` and never key material. Fixtures include `[default]` with `endpoint_url = http://127.0.0.1:19000` plus an `sso-session` profile, and fake keys `AKIAFIXTUREFIXTURE00`.
2. Connection store and secrets.
   - `store.ts` persists `connections.json` under an injected directory. Each record holds `{ id, name, kind: 'profile' | 'manual', profile?, region?, endpoint?, forcePathStyle, pinnedBuckets: string[], extraBuckets: string[] }`.
   - `secrets.ts` encrypts manual secrets into a separate `secrets.json` through `SecretCipher`. When the cipher reports `basic_text`, `unknown`, or unavailable encryption, secrets stay in an in-memory map and the connection is flagged `sessionOnly: true`.
3. `client.ts` builds a cached `S3Client` for each connection and region. `sso.ts` maps SDK errors whose name or message indicates an expired or missing SSO token to `{ code: 'SSO_LOGIN_REQUIRED', profile }`. It spawns `aws sso login --profile <p>` with an argument array and no shell, and returns `CLI_MISSING` when `aws` is not on `PATH`.
4. IPC.
   - `src/shared/ipc.ts` defines zod schemas and channel names for `connections:list|create|update|delete|testConnection|ssoLogin|listProfiles`.
   - `register.ts` validates every request and every response.
   - `secret-scan.ts` is a helper that fails when a value contains `AKIA`, `ASIA`, `aws_secret`, `SecretAccessKey`, `SessionToken`, or `X-Amz-Signature`. `ipc-connections.test.ts` applies it to every handler response, using fixtures that include the fake key.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- The profiles test proves that `[default]` reports `endpointUrl` and that the SSO profile reports `kind: 'sso'` with no `endpointUrl`.
- The store test proves that `secrets.json` never contains the plaintext fake secret, and that a `basic_text` cipher leaves no secrets file.
- The integration test connects to RustFS through a manual connection with endpoint `http://127.0.0.1:19000` and path-style, and lists buckets. It also connects through a profile connection from a temporary `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` whose profile sets `endpoint_url` to RustFS.

**Reviewer Checklist:**
- No IPC response type includes a secret field. Check the zod schemas, not only the tests.
- `spawn` uses an argument array, not `shell: true`.
- `connections.json` and `secrets.json` are written with mode `0o600`.
- No real `~/.aws` paths are read in tests.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`

### Phase 3: Browse, buckets, and bucket-wide search

**Task Guide Input:**
- Implement the main-process listing of buckets, which merges `ListBuckets` with pinned and manually added buckets and handles `AccessDenied`.
- Implement paginated prefix listing with delimiter.
- Implement a cancellable bucket-wide substring search that streams batches over IPC.
- Use cases: backend logic, IPC, integration tests against RustFS.

**Goal:** The renderer API can list buckets, pin and unpin them, add a bucket by name, list a prefix page by page, and run or cancel a search with progress events.

**Invariants & Boundaries:**
- Invariant 1.
- A search job emits at most 10,000 matches, then stops with `truncated: true`.
- Cancel aborts the in-flight `ListObjectsV2` through `abortSignal`.
- No UI.

**Files:**
- Create: `src/main/s3/buckets.ts`
- Create: `src/main/s3/list.ts`
- Create: `src/main/s3/search.ts`
- Create: `src/main/ipc/browse.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Create: `test/unit/search-match.test.ts`
- Create: `test/unit/ipc-browse.test.ts`
- Create: `test/integration/list.test.ts`
- Create: `test/integration/search.test.ts`

**Tasks:**
1. `buckets.ts`: `ListBuckets` merged with `pinnedBuckets` and `extraBuckets`. On `AccessDenied` it returns `{ buckets: [...extras], listDenied: true }`. Pin, unpin, and add-by-name persist through the Phase 2 store.
2. `list.ts`: `ListObjectsV2` with `Delimiter: '/'` and `MaxKeys: 1000`. It returns `{ folders, objects: [{ key, size, lastModified, etag }], nextToken }`. `AccessDenied` maps to a typed error code.
3. `search.ts`: case-insensitive substring match on the key basename and full key under a prefix, with no delimiter. It emits `search:batch` and `search:progress` events with `{ jobId, scanned, matched }` to the requesting `webContents` and `search:done` with `{ truncated, cancelled }`. `search:cancel` aborts.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- The integration test seeds 2,500 keys across nested prefixes and proves pagination returns every key exactly once.
- A search across the 2,500 keys finds the expected matches.
- A cancel issued after the first batch yields `cancelled: true` and no further batches.
- The `ipc-browse` responses pass the Phase 2 secret scan.

**Reviewer Checklist:**
- Search jobs are cleaned up on completion, cancel, and `webContents` destroy.
- No unbounded arrays: matches are capped, and batches are sent incrementally.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`

### Phase 4: File operations and transfers

**Task Guide Input:**
- Implement main-process S3 file operations: new folder, delete objects and folders in `DeleteObjects` batches of 1,000, rename or move objects and folders through `CopyObject` then `DeleteObject` with a 5 GB limit and stop on first failure, multipart upload through `lib-storage` with progress and abort, and streamed download to a temp file renamed on completion.
- Use cases: backend logic with data-loss risk, IPC, integration tests.

**Goal:** Every file operation in DESIGN.md flow 7 works against RustFS with progress, cancel, and the stated failure semantics.

**Invariants & Boundaries:**
- Invariants 1 and 3.
- The 5 GB rename limit is checked from `HeadObject` `ContentLength` before any copy.
- A folder rename or delete stops on the first failure and reports `{ completed: string[], remaining: string[], error }`. There is no rollback.
- An upload abort calls `Upload.abort()`. A failed or cancelled download removes its temp file.
- Save and open dialogs are invoked in main. Paths never come from untrusted renderer strings without a main-side dialog. Exception: drag and drop, where the preload reads `webUtils.getPathForFile` and main verifies that the path exists and is a regular file.

**Files:**
- Create: `src/main/s3/ops.ts`
- Create: `src/main/s3/transfers.ts`
- Create: `src/main/ipc/ops.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Create: `test/unit/ops-plan.test.ts`
- Create: `test/integration/ops.test.ts`
- Create: `test/integration/transfers.test.ts`

**Tasks:**
1. `ops.ts`: `createFolder`, `deleteKeys`, `deletePrefix`, `rename`, and `renamePrefix`. The rename functions are copy then delete per key. Delete runs only after a successful `CopyObject` response for that key. Unit-test the pure planning helpers, such as key mapping for a prefix rename and batch splitting.
2. Integration-test rename partial failure by injecting a failing copy through a client middleware or a wrapper. Assert that the source objects of uncopied keys still exist and that the report is correct.
3. `transfers.ts`: a queue with `transfer:progress` and `transfer:done` events, `upload(localPath, bucket, key)` through `Upload` with `partSize` 8 MiB, `download(bucket, key, destPath)` to `destPath + '.part'` then renamed, and cancel by transfer ID.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- An integration test uploads a 20 MiB file, which forces multipart. It downloads the file and compares SHA-256.
- A cancelled 50 MiB upload leaves no completed object and no pending multipart upload, checked with `ListMultipartUploads`.
- A cancelled download leaves no `.part` file.
- An object reported larger than 5 GB is rejected before any copy. Use a stubbed `HeadObject` in a unit test.

**Reviewer Checklist:**
- There is no code path where `DeleteObject` for a key can run when its `CopyObject` failed or did not run.
- `CopySource` keys are URL-encoded correctly for keys with spaces and unicode, with an integration test case.
- Transfers are cleaned up on window close.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`

### Phase 5: Stream proxy and URL resolver

**Task Guide Input:**
- Implement the `127.0.0.1` signing stream proxy and the URL resolver.
- The proxy holds a per-launch 256-bit token and an opaque handle registry, forwards `Range` to `GetObject` or to a presigned pass-through `fetch`, handles HEAD and returns 200, 206, or 416 with `Content-Range`, `Accept-Ranges`, and CORS headers, aborts upstream on client close, and maps upstream errors.
- The resolver parses `s3://`, virtual-hosted, path-style, and presigned URLs with the DESIGN.md host rules.
- Generate media fixtures with ffmpeg.
- Use cases: security-sensitive networking, unit and integration tests.

**Goal:** `api.open(...)` and `api.openUrl(...)` return proxy URLs that stream with correct seeking, and the opt-in 2 GB seek check meets success criterion 1.

**Invariants & Boundaries:**
- Invariants 1 and 2.
- The proxy listens on `127.0.0.1` port `0` only.
- The token is compared with `crypto.timingSafeEqual`.
- Handles are random 128-bit IDs scoped to the launch.
- Presigned pass-through adds no credentials, forwards only `Range`, `If-Range`, and `Accept`, and follows at most 3 redirects, all of them http or https.
- Unsigned HTTPS URLs are accepted only for `*.amazonaws.com` or a configured connection endpoint host.

**Files:**
- Create: `src/main/stream/range.ts`
- Create: `src/main/stream/handles.ts`
- Create: `src/main/stream/proxy.ts`
- Create: `src/main/url/resolve.ts`
- Create: `src/main/ipc/stream.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/window.ts`
- Modify: `src/preload/index.ts`
- Modify: `test/unit/window.test.ts`
- Create: `test/unit/range.test.ts`
- Create: `test/unit/resolve.test.ts`
- Create: `test/fixtures/make-media.sh`
- Create: `test/integration/proxy.test.ts`
- Create: `scripts/seek-2gb.ts`
- Modify: `package.json`

**Tasks:**
1. `range.ts`: parse a single-range `Range` header, covering `bytes=a-b`, `bytes=a-`, and `bytes=-n`. Multi-range requests are treated as no range. Unit-test the 416 and edge cases. `resolve.ts`: unit-test every URL form and the host allowlist, including presign detection by `X-Amz-Signature`, or by `Signature` with `Expires`, on any host.
2. `proxy.ts` and `handles.ts`.
   - Routes: `GET` and `HEAD` on `/o/<handle>?t=<token>`.
   - For S3 handles, send `HeadObject` for HEAD and `GetObject` with `Range` and `abortSignal` for GET.
   - Response headers: `Content-Type` from the object, `Content-Length`, `Content-Range` on 206, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin` set to the app origin, and `Access-Control-Expose-Headers`.
   - On `req` close, abort upstream.
   - Error mapping: 403, 404, 416, and 502 for other upstream failures.
   - Update the CSP so `media-src`, `img-src`, `connect-src`, and `frame-src` include the proxy origin, and update `window.test.ts`.
3. `make-media.sh` generates the following into `test/.tmp/media/` by default:
   - A 10 s faststart MP4/H.264+AAC.
   - The same MP4 with `moov` at the end.
   - WebM VP9+Opus.
   - MKV with H.264+Opus.
   - MP3.
   - FLAC.
   - A 3-page PDF made with ffmpeg-free means, such as a minimal hand-written PDF.
   - With `--large`, a 2 GB MP4.

   `proxy.test.ts` covers:
   - 200 and 206 responses.
   - 416 responses.
   - Missing or wrong token returning 403.
   - Unknown handle returning 403.
   - `POST` returning 403.
   - Upstream abort on client destroy, asserted by a counting wrapper around the S3 client or the RustFS request count.
   - A mid-file `Range` on a 200 MiB object that transfers under 15 MB when the client reads 4 MiB and closes.
   - Presigned pass-through using a URL from `@aws-sdk/s3-request-presigner` against RustFS.
4. `scripts/seek-2gb.ts`, run with `pnpm seek:2gb`, uploads the large fixture to RustFS and requests a range at 50%. It prints time-to-first-byte and bytes received, and fails above 2,000 ms or above 15 MB. It is not part of `pnpm test:integration`.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- The unit tests cover every URL form in DESIGN.md flow 5, including rejection of unsigned non-S3 hosts.
- `api.open` and `api.openUrl` responses pass the secret scan. The proxy URL contains only the local token, never `X-Amz-*`.

**Reviewer Checklist:**
- Server bind address is `127.0.0.1`, never `0.0.0.0` or `localhost`.
- There is no path where the proxy forwards credentials or `Authorization` to a pass-through host.
- Redirects are bounded, and only http and https are followed.
- Backpressure: the body is piped or streamed, never buffered whole.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`
- `pnpm seek:2gb`

### Phase 6: Renderer shell, connections, and browsing UI

**Task Guide Input:**
- Build the React renderer UI with the Trulioo Design System.
- Run `tds rules`, `tds search`, `tds component <id>`, and `tds tokens all` before writing UI, and use only TDS semantic tokens and `tds-*` classes in a light theme.
- Bundle the Inter font locally.
- Build the sidebar with connections, the add and edit connection dialog, the SSO sign-in banner, and pinned buckets.
- Build the main pane with breadcrumb, folder filter, bucket-wide search with progress and cancel, a virtualized object table using `@tanstack/react-virtual`, and the add-bucket-by-name dialog.
- Use cases: UI implementation, client state, CSS.

**Goal:** A user can add a connection, see buckets, pin buckets, navigate prefixes in a 10,000-object folder smoothly, filter, and search, all through the Phase 2 and 3 IPC.

**Invariants & Boundaries:**
- Invariants 1 and 5.
- No hardcoded hex colors and no core tokens. Component CSS is copied from `tds component <id>` output into `src/renderer/src/styles/`.
- Tobias is not bundled. Headings use the `--font-family-display` fallback.
- The renderer talks only to `window.api`.
- No viewer and no file operations UI in this phase.

**Files:**
- Create: `src/renderer/src/styles/tokens.css`
- Create: `src/renderer/src/styles/components.css`
- Create: `src/renderer/src/styles/app.css`
- Create: `src/renderer/src/assets/fonts/InterVariable.woff2`
- Create: `src/renderer/src/assets/fonts/OFL.txt`
- Create: `src/renderer/src/api.ts`
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/components/ConnectionDialog.tsx`
- Create: `src/renderer/src/components/SsoBanner.tsx`
- Create: `src/renderer/src/components/AddBucketDialog.tsx`
- Create: `src/renderer/src/components/Breadcrumb.tsx`
- Create: `src/renderer/src/components/ObjectTable.tsx`
- Create: `src/renderer/src/components/SearchBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/index.html`
- Create: `test/unit/renderer-tokens.test.ts`

**Tasks:**
1. TDS foundation.
   - Copy the token definitions from `tds rules` into `tokens.css` and the component CSS from `tds component` into `components.css`.
   - Bundle Inter.
   - Add `renderer-tokens.test.ts`, which scans `src/renderer/src/**/*.{css,tsx}` and fails on hex colors outside `tokens.css`, on `--color-*` or `--spacing-*` use outside `tokens.css`, and on class names that are neither `tds-` nor `app-`.
2. Sidebar, connection dialog, and SSO banner. The connection dialog follows TDS form-field structure and shows a session-only warning when the backend reports it.
3. Breadcrumb, filter, virtualized `ObjectTable` with incremental page loading on scroll, `SearchBar` with progress and cancel, and the add-bucket dialog shown when `listDenied`.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- `tds` usage is evidenced by `components.css` containing only classes from TDS component output.
- Manual dev run, recorded in the phase journal, against RustFS with 10,000 seeded objects in one prefix: scrolling stays responsive, and the DOM row count stays under 200.

**Reviewer Checklist:**
- Light theme only. No dark surfaces.
- Keyboard focus is visible, using `--border-focus`. Dialogs trap focus and close on Escape.
- No `dangerouslySetInnerHTML`.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

### Phase 7: Viewer, URL playback, and file-operation UI

**Task Guide Input:**
- Build the TDS-styled React UI for:
  - The media and document viewer: video, audio, image, PDF via iframe, and text, Markdown, JSON, and code from the first 2 MB. It handles errors with "Playback interrupted, Retry at currentTime", "Format not supported" with Open with system app, and the MKV no-audio notice.
  - The Open URL dialog with a signing-connection picker, including Anonymous.
  - Toolbar actions: upload with picker and drag and drop, new folder, download, rename or move, delete with a count confirmation, and a partial-failure report.
  - The transfers drawer with progress and cancel.
- Add the main-side "open with system app" path, which downloads to a temp file and calls `shell.openPath`.
- Use cases: UI implementation, client state.

**Goal:** Every user-facing feature in DESIGN.md flows 4, 5, and 7 is reachable and works in the app.

**Invariants & Boundaries:**
- Invariants 1, 3, and 5.
- Markdown renders as escaped plain text with monospace formatting. No HTML rendering and no new Markdown dependency.
- The viewer uses only proxy URLs.
- The text preview requests `Range: bytes=0-2097151`.

**Files:**
- Create: `src/renderer/src/components/Viewer.tsx`
- Create: `src/renderer/src/components/viewer/MediaView.tsx`
- Create: `src/renderer/src/components/viewer/TextView.tsx`
- Create: `src/renderer/src/components/viewer/PdfView.tsx`
- Create: `src/renderer/src/components/viewer/ImageView.tsx`
- Create: `src/renderer/src/components/OpenUrlDialog.tsx`
- Create: `src/renderer/src/components/Toolbar.tsx`
- Create: `src/renderer/src/components/RenameDialog.tsx`
- Create: `src/renderer/src/components/ConfirmDeleteDialog.tsx`
- Create: `src/renderer/src/components/OperationReport.tsx`
- Create: `src/renderer/src/components/TransfersDrawer.tsx`
- Create: `src/renderer/src/mediaKind.ts`
- Create: `src/main/openExternal.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/components.css`
- Modify: `src/renderer/src/styles/app.css`
- Create: `test/unit/mediaKind.test.ts`

**Tasks:**
1. `mediaKind.ts` maps content type and extension to a viewer kind, with unit tests. Build the viewer components and their error states.
2. Open URL dialog wired to `api.openUrl`, with the default signing connection chosen as described in DESIGN.md flow 5.
3. Toolbar, rename, delete, operation report, and transfers drawer wired to the Phase 4 IPC. Add `openExternal.ts` for Open with system app.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- Manual dev run, recorded in the phase journal, against RustFS with the Phase 5 fixtures:
  - Every fixture format plays or previews.
  - Seeking works on both MP4 variants.
  - An unsupported file offers Open with system app.

**Reviewer Checklist:**
- Text preview escapes content.
- Delete confirmation shows the exact object count before any request.
- The renderer never builds S3 or presigned URLs itself.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

### Phase 8: End-to-end tests, packaging, and manual checklist

**Task Guide Input:**
- Add Playwright `_electron` end-to-end tests against RustFS: add a manual connection, browse, play a video and seek, open an `s3://` URL, upload, rename, and delete.
- Configure electron-builder for Linux AppImage and .deb.
- Add an AppImage launch smoke script.
- Write the manual checklist for real AWS SSO sign-in and region redirects, plus a README with run, test, and package instructions.
- Use cases: test infrastructure, packaging and CI scripts, documentation.

**Goal:** Success criteria 2 to 5 are evidenced by automated runs, and the app ships as AppImage and .deb.

**Invariants & Boundaries:**
- Every invariant applies.
- End-to-end tests launch the built app with an isolated `--user-data-dir` under `test/.tmp/` and `--password-store=basic`. This exercises the session-only path; no real keyring is touched.
- Run end-to-end tests and the smoke test under `xvfb-run -a`.
- No code signing or publishing configuration.

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/app.spec.ts`
- Create: `e2e/fixtures.ts`
- Create: `electron-builder.yml`
- Create: `build/icon.png`
- Create: `scripts/smoke-appimage.sh`
- Create: `docs/manual-checklist.md`
- Create: `README.md`
- Modify: `package.json`

**Tasks:**
1. Write the Playwright config and `e2e/app.spec.ts`. They reuse the RustFS compose, seed fixtures, and drive the full flow. They assert:
   - The video `currentTime` advances after a seek.
   - The uploaded, renamed, and deleted objects are reflected through the S3 SDK.
   - The session-only warning appears.
2. Write `electron-builder.yml` with Linux targets `AppImage` and `deb`, a category, maintainer metadata, and `.deb` dependencies `libsecret-1-0`. Add a `dist` script: `electron-vite build && electron-builder --linux AppImage deb`.
3. Write `scripts/smoke-appimage.sh`. It launches `dist/*.AppImage` under `xvfb-run -a` with an isolated user data dir and `--password-store=basic`, waits for the main window through a `--smoke` flag that makes main exit 0 after the renderer reports ready, and exits non-zero on timeout. Also write `docs/manual-checklist.md` and `README.md`.

**Acceptance Criteria:**
- Every Verification Check below exits 0.
- `dist/` contains exactly one `.AppImage` and one `.deb`. `dpkg-deb -I dist/*.deb` shows the package name and the `libsecret-1-0` dependency.

**Reviewer Checklist:**
- The `--smoke` flag cannot be triggered from the renderer and does nothing beyond the ready-then-exit behaviour.
- End-to-end tests never read the real `~/.aws` or user keyring. Check for `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointing to temporary files.
- The README documents RustFS as the test backend and lists `docker`, `ffmpeg`, and `xvfb-run` prerequisites.

**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`
- `xvfb-run -a pnpm e2e`
- `pnpm dist`
- `bash scripts/smoke-appimage.sh`
- `dpkg-deb -I dist/*.deb`
