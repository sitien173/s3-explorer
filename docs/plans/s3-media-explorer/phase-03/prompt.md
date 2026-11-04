# Phase 3: Browse, buckets, and bucket-wide search

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with TDS. Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/DESIGN.md` (read-only).
- Phase Outcome: Through zod-validated typed IPC the renderer API can list buckets (merged with pinned and manually added names, tolerating `AccessDenied` on `ListBuckets`), pin, unpin, and add a bucket by name, list a prefix page by page, and start or cancel a cancellable bucket-wide search that streams batch, progress, and done events to the requesting window only. No UI.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-03/base`
- Prior State: Phases 1 and 2 are complete. Every package you need is already in `package.json`. Do not touch dependencies.
  - `src/shared/channels.ts` holds the zod-free `channels` constants for the seven `connections:*` channels. It imports nothing.
  - `src/shared/ipc.ts` holds the zod request schemas (`schemas`), strict response schemas (`responseSchemas`), `errorSchema`, `envelopeSchema`, inferred types, `RequestByChannel`, `ResponseByChannel`, `Channel`, `Result`, and the `Api` type. The module-level `connection` and `profile` response schemas are not exported.
  - `src/main/ipc/register.ts` exports `register(ipcMain, deps)` and `IpcMainLike`. It validates each request with `schemas[channel]`, runs the handler, validates the response with `responseSchemas[channel]`, wraps it in the `{ ok, data | error }` envelope, and maps thrown errors. A thrown error with a string `code` that is in `errorCodes` keeps that code. `REQUEST_FAILED` messages have `/(AKIA|ASIA)[A-Z0-9]{16}/g` replaced by `[redacted]`. Every other code gets a fixed message. The listener currently ignores its `event` argument.
  - `src/main/ipc/connections.ts` exports `IpcDeps` (`store`, `clients: Pick<S3ClientFactory, "get" | "invalidate">`, `configFilepath?`, `credentialsFilepath?`, `login?`) and `connectionHandlers(deps)`. `testConnection` is the reference for the SSO error pattern: for a profile connection it calls `mapSsoError(error, connection.profile ?? "")` from `src/main/sso.ts` and rethrows `Object.assign(new Error("SSO login required"), mapped)`.
  - `src/main/connections/store.ts` exports `ConnectionStore` with `get(id)`, `list()`, `create`, `update(id, patch)`, `delete(id)`. `get` returns the connection view (`id`, `name`, `kind`, `profile?`, `region?`, `endpoint?`, `forcePathStyle`, `pinnedBuckets`, `extraBuckets`, `sessionOnly`, `hasSecret`). `update(id, { pinnedBuckets })` and `update(id, { extraBuckets })` already persist those arrays and return the view, or `undefined` for an unknown id. Do not edit `store.ts`.
  - `src/main/s3/client.ts` exports `S3ClientFactory.get(connection)`, which returns a cached `S3Client` with `followRegionRedirects: true`.
  - `src/preload/index.ts` builds a frozen `api` of type `Api` with only `import type` from `ipc.ts` and values from `channels.ts`. The built `out/preload/index.cjs` may `require` only `electron`. A bare `require("zod")` there makes the sandboxed preload fail silently and `window.api` disappears.
  - `src/main/index.ts` already calls `register(ipcMain, { store, clients })`. It should not need to change.
  - Vitest has two projects, `unit` (`test/unit/**/*.test.ts`) and `integration` (`test/integration/**/*.test.ts`, RustFS at `http://127.0.0.1:19000`, keys `rustfsadmin`/`rustfsadmin`, region `us-east-1`, path-style, `testTimeout` 60 s, default `hookTimeout` 10 s). `test/integration/client.test.ts` shows how to build a vault, store, and factory with a fake cipher and a manual RustFS connection.
  - `test/unit/secret-scan.ts` exports `assertNoSecrets(value)`. Its regex is case-insensitive and matches the substrings `akia`, `asia`, `aws_secret`, `secretaccesskey`, `sessiontoken`, and `x-amz-signature` anywhere, in strings and object keys.
- Code Context: verify SDK behaviour by reading the installed packages under `node_modules/.pnpm`, not from memory. In particular check how `ListObjectsV2` returns `Contents`, `CommonPrefixes`, `IsTruncated`, and `NextContinuationToken`, whether keys that contain spaces, unicode, `+`, `%`, and `&` come back exactly as stored (decide from the SDK source whether `EncodingType` is needed), and that `client.send(command, { abortSignal })` aborts an in-flight request. `HttpHandlerOptions.abortSignal` exists in `@smithy/types`. Electron's `WebContents` declares `once`, `on`, and `removeListener` for the `'destroyed'` event in `node_modules/electron/electron.d.ts`.

## Invariants & Boundaries
- Invariant 1: app-held AWS secrets, session tokens, and signed URLs never cross IPC to the renderer. No response, event payload, or error message carries a secret value. Object keys and bucket names are user data, not secrets.
- Phase 1 window invariants and the Phase 2 vault and store behaviour stay as they are. Do not edit `src/main/window.ts`, `src/main/index.ts`, `src/main/ipc/connections.ts`, `src/main/connections/**`, `src/main/s3/client.ts`, `src/main/sso.ts`, `electron.vite.config.ts`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Never read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, `~/.aws/config`, or any real key. Tests use the RustFS defaults and the Phase 2 fixture fake keys only. Tests write only under temporary directories.
- No `any` in new production code. Handler maps, event payloads, and the `Api` additions use types inferred from the zod schemas, as `connectionHandlers` already does.
- Out of Scope: file operations, transfers, the stream proxy, the URL resolver, any renderer code, removing an added bucket, and later phases. Removing an added bucket is already possible through `connections:update` with `extraBuckets`, which Phase 6 can use.

### Contracts fixed by the Coordinator
These remove ambiguity. Follow them exactly. Anything not listed is your decision, recorded in `notes.md`.

1. **Channels.** Add to `channels.ts` without changing any existing key: `bucketsList: "buckets:list"`, `bucketsPin: "buckets:pin"`, `bucketsUnpin: "buckets:unpin"`, `bucketsAdd: "buckets:add"`, `objectsList: "objects:list"`, `searchStart: "search:start"`, `searchCancel: "search:cancel"`. Export a separate const `events` with `searchBatch: "search:batch"`, `searchProgress: "search:progress"`, `searchDone: "search:done"`. Events are main to renderer pushes and are not invoke channels.
2. **Requests.** Add them to `schemas` as non-strict zod objects, like the existing ones. A bucket name matches `/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/`. A prefix is a string of at most 1024 characters and defaults to `""`. A page token is an optional string of at most 4096 characters. A job id matches `/^[A-Za-z0-9_-]{8,64}$/`.
   - `bucketsList`: `{ connectionId }`.
   - `bucketsPin`, `bucketsUnpin`, `bucketsAdd`: `{ connectionId, bucket }`.
   - `objectsList`: `{ connectionId, bucket, prefix, token? }`.
   - `searchStart`: `{ jobId, connectionId, bucket, prefix, query }` where `query` has length 1 to 1024. The renderer chooses `jobId`. This is deliberate: it lets the renderer attach its event listeners and filter by `jobId` before the invoke reply, so no event can arrive before the id is known. It amends DESIGN flow 6, where main returns the id. The response echoes it.
   - `searchCancel`: `{ jobId }`.
3. **Responses.** Add them to `responseSchemas`, every one `.strict()`.
   - `bucketsList`: `{ buckets: { name, pinned, listed }[], listDenied }`.
   - `bucketsPin`, `bucketsUnpin`, `bucketsAdd`: the existing `connection` view schema, so the renderer gets the refreshed `pinnedBuckets` and `extraBuckets`.
   - `objectsList`: `{ folders: string[], objects: { key, size, lastModified?, etag? }[], nextToken? }`. `folders` are the full prefixes S3 returns, not stripped. `lastModified` is an ISO 8601 string. `nextToken` is present only when `IsTruncated` is true. A missing `Size` becomes `0`.
   - `searchStart`: `{ jobId }`.
   - `searchCancel`: `{ cancelled: boolean }`. It is `true` only when a running job with that id owned by the calling sender was aborted. An unknown, finished, or foreign job returns `false` and is not an error.
4. **Event payloads.** Define strict schemas for them in `ipc.ts`. Main parses each payload with its schema before `sender.send`.
   - `searchBatch`: `{ jobId, matches: { key, size, lastModified?, etag? }[] }`, the same object shape as `objectsList`.
   - `searchProgress`: `{ jobId, scanned, matched }`.
   - `searchDone`: `{ jobId, truncated, cancelled, error?: IpcError }`.
5. **Error code.** Add `ACCESS_DENIED` to `errorSchema` and to `errorCodes` in `register.ts`. Its message is the fixed string `"Access denied"`. Keep every other code's message as it is today. Mapping rules for S3 errors, applied in this order by one exported pure function in `src/main/ipc/browse.ts`:
   - For a profile connection, an error that `mapSsoError` recognizes becomes `SSO_LOGIN_REQUIRED` with the profile.
   - An error whose `name` is `AccessDenied` becomes `ACCESS_DENIED`.
   - An error whose `name` is `NoSuchBucket` becomes `NOT_FOUND`.
   - Anything else becomes `REQUEST_FAILED` with message `<error.name>: <error.message>`. `register.ts` already redacts access key ids, so do not add a second redaction.
   The same function produces the `error` field of `searchDone`.
6. **Connection lookup.** Every browse handler calls `deps.store.get(connectionId)` first. A missing connection throws a coded `NOT_FOUND` error with message `"Connection not found"`, as `connectionHandlers` does. Only `bucketsList`, `objectsList`, and `searchStart` call `deps.clients.get`. Pin, unpin, and add never touch the client and never call `clients.invalidate`.
7. **Handler context.** `register.ts` passes the IPC event's `sender` to each handler as a second argument `{ sender }`. Define a `SenderLike` interface with exactly `send(channel: string, payload: unknown): void`, `isDestroyed(): boolean`, `once(event: "destroyed", listener: () => void): unknown`, and `removeListener(event: "destroyed", listener: () => void): unknown`. Electron's `WebContents` satisfies it structurally. `IpcMainLike.handle`'s listener takes `(event: { sender: SenderLike }, input: unknown)`. If the real `ipcMain` stops being assignable to `IpcMainLike`, fix the types in `register.ts`. Do not edit `index.ts`. Existing connection handlers ignore the context and must not change.
8. **Deps.** `register(ipcMain, deps)` takes `IpcDeps & { maxSearchMatches?: number }`. `browseHandlers(deps)` in `browse.ts` builds the browse handler map and owns the search job registry. The default cap is the exported constant `MAX_SEARCH_MATCHES = 10_000`.
9. **Bucket merge (`buckets.ts`).** `listBuckets(client, { pinned, extras })` sends `ListBucketsCommand({})` and returns `{ buckets, listDenied }`. `buckets` is the union of listed names, `pinned`, and `extras`, with no duplicates. Each entry is `{ name, pinned, listed }`, where `listed` is true only for names that `ListBuckets` returned. Sort pinned first, then by name in code unit order. When `ListBuckets` fails with an error named `AccessDenied`, return the union of `pinned` and `extras` with `listed: false` and `listDenied: true`. Every other failure is rethrown. Pin, unpin, and add are pure array operations that read the current view from the store, apply the change with no duplicates, and persist through one `store.update` call. Unpin of an absent name and add of an existing name are no-ops that still return the view. Add performs no existence check, because `HeadBucket` is often denied for users limited to one prefix, which is the main reason to add by name. Concurrent read-modify-write in the store is an accepted risk from Phase 2. Do not add locking.
10. **Listing (`list.ts`).** `listObjects(client, { bucket, prefix, token })` sends `ListObjectsV2Command` with `Delimiter: "/"`, `MaxKeys: 1000`, the prefix, and the continuation token. It drops any object whose key equals the requested prefix, which is the zero-byte folder marker that Phase 4 will create. It returns the shape in contract 3. Keys, prefixes, and names must come back exactly as stored.
11. **Search (`search.ts`).**
    - `matchesQuery(key, prefix, query)` is a case-insensitive substring test, using `toLowerCase`, on the part of the key after the search prefix. Matching the full key would let a prefix such as `photos/` match every key under it for the query `photo`. A key that does not start with the prefix is matched whole. This refines the PLAN text "basename and full key", because a basename is always a suffix of the relative key.
    - `runSearch` pages `ListObjectsV2` with no delimiter, `MaxKeys: 1000`, the prefix, and `abortSignal` passed in the second argument of `client.send`. For each page it emits one batch when that page has matches, then one progress event with running `scanned` and `matched`. It never holds more than one page of matches.
    - The cap: once `matched` equals the cap and a further match is found, it drops that match, stops without another request, and resolves `truncated: true`. Exactly the cap with the listing ending resolves `truncated: false`.
    - After `signal.aborted`, nothing is emitted. This is checked synchronously before every emit, including after an awaited response. An abort during an in-flight request resolves `cancelled: true`. Only treat an error as a cancel when `signal.aborted` is true. Every other error rejects with the raw error.
    - `runSearch` is transport-agnostic: it takes `emit` callbacks, not a `sender`.
12. **Job registry.** Jobs are keyed by the renderer's `jobId` and record their owning sender.
    - `searchStart` for an id already in the registry returns `INVALID_REQUEST`. It then registers the job, attaches `sender.once("destroyed", abort)`, starts `runSearch` without awaiting it, and returns `{ jobId }`.
    - A search job sends `searchDone` exactly once, when the sender is still alive. It carries `error` when `runSearch` rejected, using the mapping in contract 5, with `truncated: false` and `cancelled: false`.
    - Every terminal path removes the job from the registry and calls `sender.removeListener("destroyed", ...)` for that job: completion, cancel, error, and sender destroy. A window that runs many searches must not accumulate listeners.
    - Destroy of the sender aborts the job and sends nothing. Every `sender.send` is guarded by `isDestroyed()`.
    - `searchCancel` aborts only a job owned by the calling sender.
    - Expose what the unit tests need to see, such as the registry size, from `browseHandlers` or the job registry class. Do not add a public API for it.
13. **Preload.** `Api` gains `buckets: { list, pin, unpin, add }`, `objects: { list }`, and `search: { start, cancel, onBatch, onProgress, onDone }`. Each `on*` takes a listener of the payload type and returns an unsubscribe function. The preload registers an `ipcRenderer.on` wrapper that calls the listener with the payload only, never the IPC event, and the unsubscribe calls `ipcRenderer.removeListener` with that wrapper. Every nested object is frozen. The preload imports no zod value.

## Files
Allowed production and test paths:
- `src/shared/channels.ts` (modify: add the channels and `events` from contract 1. Deviation from the PLAN file list, because the preload constraint requires zod-free constants.)
- `src/shared/ipc.ts` (modify: requests, responses, event payload schemas, `ACCESS_DENIED`, inferred types, `Api` additions)
- `src/main/ipc/register.ts` (modify: pass the sender context, add `ACCESS_DENIED`, register the browse channels, accept `maxSearchMatches`)
- `src/main/ipc/browse.ts` (create: browse handlers, S3 error mapping, job registry wiring)
- `src/main/s3/buckets.ts` (create)
- `src/main/s3/list.ts` (create)
- `src/main/s3/search.ts` (create)
- `src/preload/index.ts` (modify: expose the new `Api` members)
- `test/unit/search-match.test.ts` (create)
- `test/unit/ipc-browse.test.ts` (create)
- `test/integration/helpers.ts` (create: shared RustFS harness and seeding helpers for the two integration tests. Deviation from the PLAN file list, to avoid duplicating the harness. The name must not end in `.test.ts`.)
- `test/integration/list.test.ts` (create)
- `test/integration/search.test.ts` (create)

Worker-owned phase records:
- `docs/plans/s3-media-explorer/phase-03/notes.md` (append `## Task <M>` blocks)
- `docs/plans/s3-media-explorer/phase-03/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, dependencies, or any path listed under Invariants & Boundaries.
- Do not run `git commit`, `git reset`, `git stash`, branch changes, or ref writes. Do not leave `*.tsbuildinfo`, `out/`, or `test/.tmp/` in the Git status, since all are ignored.

## Tasks
Write each failing test first and show a behavioral RED before the implementation, not an import error.

- task-1: Buckets and listing. Write the `ipc-browse` unit tests for `bucketsList`, `bucketsPin`, `bucketsUnpin`, `bucketsAdd`, and `objectsList` first, driven through `register` with a fake `ipcMain`, a fake sender, a stub client whose `send` is scripted, and a real `ConnectionStore` with a fake cipher in a temporary directory. Cover:
  - The union, sort order, `listed` flags, and `listDenied` on an `AccessDenied` stub.
  - Persistence and de-duplication of pin, unpin, and add, and `NOT_FOUND` for an unknown connection.
  - The `objectsList` mapping: folders, objects, the dropped folder marker, `nextToken` only when truncated, a missing `Size`, and the ISO `lastModified`.
  - `AccessDenied` to `ACCESS_DENIED`, `NoSuchBucket` to `NOT_FOUND`, an SSO error on a profile connection to `SSO_LOGIN_REQUIRED` with the profile, and a stub error that embeds `AKIAFIXTUREFIXTURE00` coming back redacted.
  - `INVALID_REQUEST` for a bad bucket name, an over-long prefix, and a missing `connectionId`, with the stub client never called.
  Then write the shared schemas, `channels.ts`, `buckets.ts`, `list.ts`, the first part of `browse.ts`, and the `register.ts` changes.
- task-2: Search. Write `test/unit/search-match.test.ts` first: `matchesQuery` cases (case-insensitive, relative to the prefix, a match only inside the prefix does not count, unicode, an empty relative key) and `runSearch` against a scripted stub client. Cover paging, per-page batches, running counts, the cap and truncation with a small injected cap, exactly the cap not truncating, `MAX_SEARCH_MATCHES` equal to `10_000`, the abort signal reaching `client.send`, no emit after abort, an abort during an in-flight request resolving `cancelled: true`, and a non-abort error rejecting. Then extend `ipc-browse.test.ts` first with the job registry behaviour: start and the ordered batch, progress, and done events validated against the event schemas, `searchCancel` by the owner and by a foreign sender, a duplicate `jobId`, an error mid-search reported in `searchDone.error`, and cleanup on done, cancel, error, and destroy. For cleanup assert that the registry is empty, that the fake sender's destroyed-listener count returns to zero after 25 sequential searches, and that nothing is sent after destroy. Then implement `search.ts` and finish `browse.ts`.
- task-3: Security and preload. In `ipc-browse.test.ts`, apply `assertNoSecrets` to every response and every event payload, using a manual connection created with the fake key `AKIAFIXTUREFIXTURE00` through the real store, and keep fixture bucket and key names free of the forbidden substrings, case-insensitively. Then implement the preload additions. Run `pnpm build`, confirm that every `require` specifier in `out/preload/index.cjs` is `electron`, and confirm that `timeout 10 xvfb-run -a pnpm exec electron .` runs without new error output beyond the unrelated Wayland and Vulkan ozone message. Record the commands and results in `notes.md`.
- task-4: Integration. Write `test/integration/helpers.ts`, `list.test.ts`, and `search.test.ts` through the real `register`, a real store, vault, and `S3ClientFactory` with a fake cipher and a manual RustFS connection. Use one uniquely named bucket per test file, seed with bounded concurrency of about 32, give `beforeAll` an explicit hook timeout of at least 120 s, and delete the objects and the bucket in `afterAll`. Keep every seeded key and query free of the forbidden secret-scan substrings.
  - `list.test.ts` seeds 2,500 keys across nested prefixes, with one prefix of more than 1,000 keys so a `nextToken` is exercised, plus keys with spaces, unicode, `+`, `%`, and `&`, and a zero-byte folder marker. It walks every folder through `objectsList` with pagination and proves every seeded key is returned exactly once with its exact name, that the folder marker is not listed as an object, and that `bucketsList` shows the new bucket as listed and a pinned or added name that does not exist as unlisted.
  - `search.test.ts` seeds 2,500 keys, proves the exact expected match set for a case-insensitive query including keys with special characters, proves that a query matching only the search prefix returns nothing, and proves that a cancel issued from the first batch event yields `searchDone` with `cancelled: true`, no `search:batch` event after the cancel call, and fewer matches than the total.

## Done When
- Every Verification Check below exits 0 from `/home/ngosi/projects/s3-explorer`.
- The integration tests prove that 2,500 seeded keys paginate with every key exactly once, that the search finds the expected matches, and that a cancel after the first batch yields `cancelled: true` and no further batches.
- The unit tests prove the cap, the `AccessDenied` bucket fallback, the typed errors, and listener and registry cleanup on done, cancel, error, and destroy.
- Every `ipc-browse` response and event payload passes the Phase 2 secret scan. Every new response and event schema is `.strict()`.
- No new production code uses `any`. `src/main/index.ts` and `src/main/ipc/connections.ts` are unchanged.
- The built preload requires nothing except `electron`.
- Run from `/home/ngosi/projects/s3-explorer` (Baseline: all four exit 0 at the base, with 41 unit tests and 2 integration tests passing):
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
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/s3-media-explorer/phase-03/journal.md`, then return that block and the matching status line from `erp.md`.
