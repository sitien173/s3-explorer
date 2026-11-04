# Phase 2: Connections, credentials, and S3 client factory

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with TDS. Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/DESIGN.md` (read-only).
- Phase Outcome: The main process can create, list, update, and delete connections and build a working, cached `S3Client` for each. The renderer reaches this only through zod-validated typed IPC whose responses never contain a secret. Profile discovery, `safeStorage`-backed manual keys, SSO error mapping, and `aws sso login` spawning all exist and are tested. No UI.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-02/base`
- Prior State: Phase 1 is complete. The toolchain is pinned and installed. Every package you need, including `zod`, `@smithy/shared-ini-file-loader`, and `@aws-sdk/client-s3`, is already in `package.json`. Do not touch dependencies.
  - `src/main/index.ts` only creates the window on `app.whenReady()`.
  - `src/main/window.ts` holds the secure window, CSP, and navigation controls. Do not edit it.
  - `src/preload/index.ts` exposes `Object.freeze({})` as `api` through `contextBridge`.
  - Vitest has two projects. `unit` runs `test/unit/**/*.test.ts`. `integration` runs `test/integration/**/*.test.ts` after `test/integration/global-setup.ts` starts RustFS at `http://127.0.0.1:19000` with `rustfsadmin`/`rustfsadmin`, region `us-east-1`, path-style.
  - `tsconfig.node.json` is a composite project that includes `src/main/**/*.ts`, `src/preload/**/*.ts`, and `test/**/*.ts`. A composite project fails with TS6307 on any imported file that its `include` does not match, so this phase adds `src/shared/**/*.ts` to that `include`.
  - `electron.vite.config.ts` builds the preload as CommonJS to `out/preload/index.cjs` with `externalizeDepsPlugin()`. A sandboxed preload can `require` only `electron` and a few Node built-ins. A bare `require("zod")` left in the preload bundle makes the preload fail to load, and `window.api` then silently does not exist.
- Code Context: no connection or S3 code exists. Verify SDK and library behaviour by reading the installed packages under `node_modules`, not from memory. In particular read `@smithy/shared-ini-file-loader` for how `[profile x]`, `[sso-session x]`, and credentials-file sections are returned, and read `@aws-sdk/token-providers`, `@aws-sdk/credential-provider-sso`, and `@aws-sdk/credential-provider-ini` for the actual error names and messages raised when an SSO token is missing or expired. Do not guess either.

## Invariants & Boundaries
- Invariant 1: app-held AWS secrets, session tokens, and signed URLs never cross IPC to the renderer. Requests may carry the secret the user typed, inbound only. No response, error message, or log line may carry a secret value.
- Invariant 4: no secret is persisted unless `cipher.isEncryptionAvailable()` is true and `cipher.getSelectedStorageBackend()` returns neither `basic_text` nor `unknown`. Otherwise the secret lives only in an in-memory map for the session.
- Window invariants from Phase 1 stay as they are. Do not edit `src/main/window.ts`, `electron.vite.config.ts`, `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Never read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, `~/.aws/config`, or any real key. Unit tests pass explicit fixture paths. Integration tests point `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` at temporary files and restore the environment afterwards. Tests use only the fixture fake keys and the RustFS defaults.
- Tests and the store write only under a temporary directory such as `fs.mkdtemp(os.tmpdir())`, never under the real Electron `userData` or home directory.
- Out of Scope: listing buckets or objects for the UI, search, transfers, the stream proxy, the URL resolver, any renderer code, any new IPC error code beyond the list below, and later phases.

### Contracts fixed by the Coordinator
These remove ambiguity. Follow them exactly. Anything not listed is your decision, recorded in `notes.md`.

1. **Result envelope.** Every handler returns `{ ok: true, data } | { ok: false, error: { code, message, profile? } }` and never throws across IPC. `code` is one of `INVALID_REQUEST`, `NOT_FOUND`, `SSO_LOGIN_REQUIRED`, `CLI_MISSING`, `SSO_LOGIN_FAILED`, `REQUEST_FAILED`.
2. **Channels.** Exactly `connections:list`, `connections:create`, `connections:update`, `connections:delete`, `connections:testConnection`, `connections:ssoLogin`, `connections:listProfiles`.
3. **Request and response schemas are separate zod objects.** Request schemas may contain `accessKeyId`, `secretAccessKey`, and `sessionToken`. Response schemas are `.strict()` and have no field that can hold key material, so a handler that returns an extra field fails loudly. `register.ts` validates every request, validates every response, and returns the parsed output.
4. **Connection view.** The response shape for a connection is `{ id, name, kind, profile?, region?, endpoint?, forcePathStyle, pinnedBuckets, extraBuckets, sessionOnly, hasSecret }`. `hasSecret` is true for a profile connection and for a manual connection whose secret is available now. `sessionOnly` is derived at read time and never persisted. It is true for a manual connection whose secret is held only in memory. A manual connection whose in-memory secret was lost on restart reports `hasSecret: false`.
5. **Create and update requests.** `create` is a discriminated union on `kind`. A `profile` request carries `name`, `profile`, and optional `region`, `endpoint`, and `forcePathStyle`. A `manual` request carries `name`, `region`, `accessKeyId`, `secretAccessKey`, optional `sessionToken`, optional `endpoint`, and optional `forcePathStyle`. `endpoint` must parse as an `http:` or `https:` URL. `forcePathStyle` defaults to `false`. `update` takes `id` plus optional fields and cannot change `kind`. `region` and `endpoint` accept `string | null`, where `null` clears the value. Secrets are replaced only when supplied, and only for manual connections.
6. **Profile names.** A profile name matches `/^[A-Za-z0-9][A-Za-z0-9_.@+=,:-]*$/` and is at most 128 characters, so it can never start with `-`.
7. **`SecretCipher`.** An interface in `secrets.ts` with exactly `isEncryptionAvailable(): boolean`, `getSelectedStorageBackend(): string`, `encryptString(plain: string): Buffer`, and `decryptString(data: Buffer): string`. Electron's `safeStorage` satisfies it structurally, and `src/main/index.ts` passes `safeStorage` directly. The cipher is consulted only when a manual secret is written or read. Nothing touches it at startup, because that can prompt for a keyring unlock. When persistence is not allowed, the vault does not attempt to decrypt a stored `secrets.json` and reports no secret. A decrypt failure also reports no secret and never throws a value-bearing error.
8. **Files.** `connections.json` is an array of the non-secret records from `PLAN.md` Task 2. `secrets.json` maps connection id to base64 ciphertext of the JSON secret. Both are created with mode `0o600`, rewritten through a temporary file and rename, and created lazily on the first write. Nothing is written at app startup. A test asserts the mode with `fs.stat`.
9. **Preload and shared files.** Channel name constants live in `src/shared/channels.ts`, which imports nothing. `src/shared/ipc.ts` imports zod and the constants and exports the schemas, the inferred types, and an `Api` type for `window.api`. The preload imports only `import type` from `ipc.ts` and values from `channels.ts`, so no `require` other than `electron` can appear in the built preload. The preload builds a frozen `api` with `connections: { list, create, update, delete, testConnection, ssoLogin, listProfiles }`, each calling `ipcRenderer.invoke(channel, input)`, typed as `Api`.
10. **Profile discovery.** `listProfiles` returns `{ name, region?, endpointUrl?, kind: 'sso' | 'static' | 'other' }` sorted by name. It never returns key material. `[sso-session x]` sections are not profiles. `kind` is `sso` when the profile has `sso_session` or `sso_start_url`. It is `static` when it has `aws_access_key_id` and is not `sso`. Otherwise it is `other`. `endpointUrl` comes only from the profile's own `endpoint_url`.
11. **S3 client factory.** The factory returns a cached client per `connectionId` and region. A profile connection is built as `new S3Client({ profile, region?, endpoint?, forcePathStyle, followRegionRedirects: true })`, passing `region` and `endpoint` only when the connection sets them, so the SDK resolves profile credentials, SSO, and `endpoint_url`. A manual connection is built with `region`, optional `endpoint`, `forcePathStyle`, `followRegionRedirects: true`, and a credentials provider function that reads the secret from the vault at call time, so no secret is captured in a closure at construction. Updating or deleting a connection destroys and evicts its cached clients.
12. **SSO mapping and login.** `sso.ts` exports a mapper that returns `{ code: 'SSO_LOGIN_REQUIRED', profile }` for an expired or missing SSO token error, using the error names and messages you verified in the installed SDK, and `null` otherwise. It also exports `ssoLogin(profile, deps?)`, which spawns `aws` with the argument array `['sso', 'login', '--profile', profile]`, no `shell` option, and `stdio: 'ignore'`. It resolves `{ ok: true }` on exit code 0, `CLI_MISSING` when spawn emits `ENOENT`, and `SSO_LOGIN_FAILED` for any other exit. `deps` allows injecting `spawn` and `env`. The `connections:ssoLogin` handler first confirms the profile is among the discovered profiles and returns `NOT_FOUND` otherwise.
13. **`testConnection`.** It builds the client, sends `ListBucketsCommand`, and returns `{ bucketCount }`. For a profile connection it maps SSO errors through the mapper. Any other failure returns `REQUEST_FAILED` with message `<error.name>: <error.message>` where every match of `/(AKIA|ASIA)[A-Z0-9]{16}/` is replaced by `[redacted]`.
14. **Wiring.** `register.ts` exports a function that takes an `ipcMain`-like object with `handle(channel, listener)` plus the dependencies, and registers every channel. `src/main/index.ts` builds the dependencies from `app.getPath('userData')` and `safeStorage` and registers IPC before `createWindow()`. Tests pass a fake `ipcMain` and call the registered listeners directly, with no Electron import.

## Files
Allowed production and test paths:
- `src/shared/channels.ts` (create: zod-free channel name constants. This is a deviation from the PLAN file list, required by the preload constraint in contract 9.)
- `src/shared/ipc.ts` (create: zod request and response schemas, inferred types, `Api` type)
- `tsconfig.node.json` (modify: add `src/shared/**/*.ts` to `include`, nothing else)
- `src/main/connections/profiles.ts` (create)
- `src/main/connections/store.ts` (create)
- `src/main/connections/secrets.ts` (create)
- `src/main/s3/client.ts` (create)
- `src/main/sso.ts` (create)
- `src/main/ipc/register.ts` (create)
- `src/main/ipc/connections.ts` (create)
- `src/main/index.ts` (modify: build dependencies and register IPC before `createWindow()`)
- `src/preload/index.ts` (modify: expose the typed frozen `api`)
- `test/unit/profiles.test.ts` (create)
- `test/unit/store.test.ts` (create)
- `test/unit/client.test.ts` (create)
- `test/unit/sso.test.ts` (create)
- `test/unit/secret-scan.ts` (create: helper, not a test file)
- `test/unit/ipc-connections.test.ts` (create)
- `test/fixtures/aws/config` (create)
- `test/fixtures/aws/credentials` (create)
- `test/integration/client.test.ts` (create)

Worker-owned phase records:
- `docs/plans/s3-media-explorer/phase-02/notes.md` (append `## Task <M>` blocks)
- `docs/plans/s3-media-explorer/phase-02/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, dependencies, `src/main/window.ts`, `electron.vite.config.ts`, or secrets.
- Do not run `git commit`, `git reset`, `git stash`, branch changes, or ref writes. Do not leave `*.tsbuildinfo` or `out/` in the Git status, since both are ignored.

## Tasks
Write each failing test first and show a behavioral RED before the implementation, not an import error.

- task-1: Profile discovery. Create the fixtures. `config` holds `[default]` with `region = us-east-1` and `endpoint_url = http://127.0.0.1:19000`, `[profile static-keys]` with a region, `[profile sso-dev]` with `sso_session`, `sso_account_id`, `sso_role_name`, and a region, no `endpoint_url`, `[sso-session corp]` with `sso_start_url`, `sso_region`, and `sso_registration_scopes`, and `[profile assume]` with `role_arn` and `source_profile`. `credentials` holds `[default]` and `[static-keys]` with `aws_access_key_id = AKIAFIXTUREFIXTURE00` and a fake `aws_secret_access_key`. Write `test/unit/profiles.test.ts`, then `profiles.ts` using `loadSharedConfigFiles` with explicit `filepath` and `configFilepath`. The test proves `default` reports `endpointUrl: 'http://127.0.0.1:19000'` with kind `static`, `sso-dev` reports kind `sso` with no `endpointUrl`, `assume` reports `other`, `corp` is absent, and no result contains the fake key or secret.
- task-2: Secrets and store. Write `test/unit/store.test.ts` first with a fake reversible cipher and a switchable backend. Prove that `secrets.json` never contains the plaintext fake secret, that a `basic_text` cipher, an `unknown` backend, and an unavailable cipher each leave no `secrets.json` and make the connection `sessionOnly: true` with the secret still readable in-process, that both files have mode `0o600`, that no file exists before the first write, that a persisted secret round-trips, that `delete` removes the record and the secret, and that `update` replaces a secret only when one is supplied. Then implement `secrets.ts` and `store.ts`.
- task-3: Client factory and SSO. Write `test/unit/client.test.ts` and `test/unit/sso.test.ts` first. Client test: with `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointed at the fixtures for the duration of the test, a profile connection on `default` with no overrides resolves its endpoint to `127.0.0.1:19000`, an explicit endpoint override wins, a region override applies, `forcePathStyle` and `followRegionRedirects` are as configured, the same id and region returns the same instance, a different region returns a different instance, and update and delete evict and destroy. Manual connection: the credentials provider returns the current secret and reflects an updated secret without rebuilding the closure. SSO test: the mapper returns `SSO_LOGIN_REQUIRED` with the profile for the real SDK error shapes you verified, and `null` for an unrelated error; `ssoLogin` spawns `aws` with exactly the argument array above, passes no `shell`, resolves `CLI_MISSING` for `ENOENT` including through a real spawn with an empty `PATH`, resolves `SSO_LOGIN_FAILED` for a non-zero exit, and resolves `{ ok: true }` for exit 0. Then implement `client.ts` and `sso.ts`.
- task-4: IPC. Write `test/unit/secret-scan.ts`, which exports a function that fails when any string in a value, including keys and nested values, contains `AKIA`, `ASIA`, `aws_secret`, `SecretAccessKey`, `SessionToken`, or `X-Amz-Signature`. Write `test/unit/ipc-connections.test.ts` first, with a fake `ipcMain` and a fake client whose `send` can succeed or throw. It asserts for every channel that valid requests succeed, that invalid requests return `INVALID_REQUEST` and never reach the handler, that a handler returning an extra field fails response validation, that no response or error message contains a secret by applying the scan to every response including a `testConnection` failure whose error message embeds `AKIAFIXTUREFIXTURE00`, that the profile connection SSO failure returns `SSO_LOGIN_REQUIRED` with the profile, that `ssoLogin` rejects an unknown profile with `NOT_FOUND`, and that a manual connection created with the fake key reports `hasSecret: true` and no key material. Then write `channels.ts`, `ipc.ts`, `register.ts`, `connections.ts`, the `index.ts` wiring, and the preload.
- task-5: Integration. Write `test/integration/client.test.ts`. Through the real store, vault, and client factory with a fake cipher, a manual connection with endpoint `http://127.0.0.1:19000`, path-style, region `us-east-1`, and the RustFS defaults lists buckets. A profile connection built from a temporary `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE`, where the profile sets `endpoint_url` to `http://127.0.0.1:19000` and carries the RustFS default keys, also lists buckets without an endpoint override on the connection. Restore both environment variables in `afterAll`. Then run `pnpm build`, confirm that every `require` specifier in `out/preload/index.cjs` is `electron`, and confirm that `timeout 10 xvfb-run -a pnpm exec electron .` runs without new error output beyond the unrelated Wayland and Vulkan ozone message. Record the commands and results in `notes.md`.

## Done When
- Every Verification Check below exits 0 from `/home/ngosi/projects/s3-explorer`.
- The profiles test proves `[default]` reports `endpointUrl` and the SSO profile reports kind `sso` with no `endpointUrl`.
- The store test proves `secrets.json` never contains the plaintext fake secret and a `basic_text` cipher leaves no secrets file.
- The integration test connects to RustFS through a manual connection and through a profile connection and lists buckets in both cases.
- No response schema has a field capable of holding key material, and every response schema is `.strict()`.
- `spawn` is called with an argument array and no `shell`. `connections.json` and `secrets.json` are mode `0o600`. No test or code path reads a real `~/.aws` file.
- The built preload requires nothing except `electron`.
- Run from `/home/ngosi/projects/s3-explorer` (Baseline: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exit 0 at the base, with 20 unit tests and 1 integration test passing):
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm build`

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/s3-media-explorer/phase-02/journal.md`, then return that block and the matching status line from `erp.md`.
