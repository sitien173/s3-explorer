# Phase 4: File operations and transfers

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with TDS. Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/DESIGN.md` (read-only, flow 7 and the Errors table).
- Phase Outcome: Through zod-validated typed IPC the renderer API can create a folder, delete objects and folders, count a folder, rename or move an object or a folder, upload files by picker or by drag and drop, download an object through a save dialog, and cancel transfers. Folder operations stop on the first failure and report what completed and what remains. Transfers report progress, support cancel, and clean up on cancel, failure, and window close. No UI.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-04/base`
- Prior State: Phases 1 to 3 are complete. Every package you need is already in `package.json` (`@aws-sdk/client-s3` and `@aws-sdk/lib-storage` 3.1161.0, `zod` 4.6.7). Do not touch dependencies.
  - `src/shared/channels.ts` holds the zod-free `channels` constants and a separate `events` const. It imports nothing.
  - `src/shared/ipc.ts` holds `schemas`, strict `responseSchemas`, `errorSchema`, `envelopeSchema`, the strict event payload schemas, `eventSchemas`, inferred types, `RequestByChannel`, `ResponseByChannel`, `AnyChannel`, `Result`, `IpcError`, and the `Api` type. The non-exported module-level `s3Object` and `connection` schemas can be reused inside the file.
  - `src/main/ipc/register.ts` exports `register(ipcMain, deps)`, `IpcMainLike`, and `SenderLike` (`send`, `isDestroyed`, `once("destroyed")`, `removeListener("destroyed")`). It validates each request with `schemas[channel]`, passes `{ sender: event.sender }` to the handler, validates the response, and wraps it in `{ ok, data | error }`. A thrown error with a string `code` that is in `errorCodes` keeps that code. `REQUEST_FAILED` messages have `/(AKIA|ASIA)[A-Z0-9]{16}/g` replaced by `[redacted]`. `ACCESS_DENIED` has the fixed message `"Access denied"`. Any other code gets `"Request failed"`, except that `INVALID_REQUEST` currently always gets the message `"Both keys are required"`, which is wrong for every handler except the store's (see contract 4).
  - `src/main/ipc/browse.ts` exports `mapS3Error(error, connection?)`, `SearchJobRegistry`, `browseHandlers(deps)`, and `MAX_SEARCH_MATCHES`. The module-private `throwMappedError` rethrows `Object.assign(new Error(mapped.message), mapped)`. `browseHandlers` is the reference for connection lookup (`deps.store.get`, then a coded `NOT_FOUND` "Connection not found"), the sender-owned job registry, the `destroyed` listener lifecycle, and sending events only after parsing the payload with its schema and only when `!sender.isDestroyed()`.
  - `src/main/ipc/connections.ts` exports `IpcDeps` (`store`, `clients: Pick<S3ClientFactory, "get" | "invalidate">`, `configFilepath?`, `credentialsFilepath?`, `login?`). Do not edit it.
  - `src/main/s3/client.ts` exports `S3ClientFactory.get(connection)`, which returns a cached `S3Client` with `followRegionRedirects: true`.
  - `src/main/s3/list.ts` and `search.ts` show how listing pages with `ListObjectsV2Command` and passes `abortSignal` as the second argument of `client.send`.
  - `src/main/index.ts` creates the store, vault, and factory in `app.whenReady()` and calls `register(ipcMain, { store, clients })`.
  - `src/preload/index.ts` builds a frozen `api` of type `Api` with only `import type` from `ipc.ts` and values from `channels.ts`, and has a `subscribe` helper for events. The built `out/preload/index.cjs` may `require` only `electron`. A bare `require("zod")` there makes the sandboxed preload fail silently.
  - `test/integration/helpers.ts` exports `createFakeCipher`, `createIntegrationSender`, `setupHarness` (real store, vault, factory, a manual RustFS connection, a raw `s3Client`, and the registered `handlers` map), `createTestBucket`, `emptyAndDeleteBucket`, and `seedObjects`. `test/unit/ipc-browse.test.ts` and `test/integration/list.test.ts` show the fake `ipcMain`, fake sender, and scripted stub client patterns.
  - `test/unit/secret-scan.ts` exports `assertNoSecrets(value)`. Its regex is case-insensitive and matches the substrings `akia`, `asia`, `aws_secret`, `secretaccesskey`, `sessiontoken`, and `x-amz-signature` anywhere, in strings and object keys.
  - Vitest has two projects, `unit` and `integration` (RustFS at `http://127.0.0.1:19000`, keys `rustfsadmin`/`rustfsadmin`, region `us-east-1`, path-style, `testTimeout` 60 s, `hookTimeout` 10 s unless you set one). Baseline is 66 unit tests and 6 integration tests, all passing.
- Verified facts about the pinned SDK and RustFS. A Coordinator probe established them, so do not re-derive them, and do not contradict them without evidence.
  - RustFS rejects any object key that contains `//` on `PutObject` with `InvalidArgument: Invalid object key`. Spaces, unicode, `+`, `%25`, `&amp`, `?`, and `#` store and copy correctly.
  - `CopyObjectCommand` works when `CopySource` is `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`. Use exactly this per-segment encoding.
  - `HeadObject` on a missing key throws an error named `NotFound` with message `UnknownError`. `GetObject` and `CopyObject` on a missing key throw `NoSuchKey`.
  - `DeleteObjects` with `Quiet: false` lists a key that never existed under `Deleted` and returns no `Errors`, so deleting a missing key is a success.
  - A zero-byte `Upload` with a `Readable` body and `ContentLength: 0` succeeds.
  - `Upload.abort()` makes `upload.done()` reject with an error named `AbortError`. The multipart upload is still listed by `ListMultipartUploads` right after that rejection and is gone about 1.5 s later. A test that checks for orphaned multipart uploads must poll with a deadline, never check once and never use a fixed sleep as the assertion.
- Code Context: read the installed packages under `node_modules/.pnpm` for anything not listed above, for example the `Upload` options (`partSize`, `queueSize`, `leavePartsOnError`), the `httpUploadProgress` event shape, how `GetObject` returns `Body` in Node, and `DeleteObjectsCommandOutput`. Electron's `dialog.showOpenDialog`, `dialog.showSaveDialog`, and `webUtils.getPathForFile(file: File): string` are declared in `node_modules/electron/electron.d.ts`.

## Invariants & Boundaries
- Invariant 1: app-held AWS secrets, session tokens, and signed URLs never cross IPC to the renderer. No response, event payload, or error message carries a secret value. Object keys and bucket names are user data, not secrets.
- Invariant 3: a source object is never deleted before its copy is confirmed. There is no code path where a delete for a key can run when its copy failed or did not run.
- Phase 1 to 3 behaviour stays as it is. Do not edit `src/main/window.ts`, `src/main/ipc/connections.ts`, `src/main/connections/**`, `src/main/s3/client.ts`, `src/main/s3/list.ts`, `src/main/s3/search.ts`, `src/main/s3/buckets.ts`, `src/main/sso.ts`, `electron.vite.config.ts`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Never read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, `~/.aws/config`, or any real key. Tests use the RustFS defaults and the Phase 2 fixture fake keys only. Tests write local files only under temporary directories.
- Renderer-supplied strings are never used as a local file path, except in `transfers:uploadPaths`, which comes from drag and drop. Main verifies each of those paths (contract 10). Save and open dialogs are opened in main.
- No `any` in new production code. Handler maps, event payloads, and the `Api` additions use types inferred from the zod schemas.
- Out of Scope: the stream proxy, the URL resolver, any renderer code, the open-with-system-app path (Phase 7 adds `openExternal.ts`), cross-bucket copy, rollback of a partial folder operation, multipart upload resume, and later phases.

### Contracts fixed by the Coordinator
These remove ambiguity. Follow them exactly. Anything not listed is your decision, recorded in `notes.md`.

1. **Channels.** Add to `channels.ts` without changing any existing key: `opsCreateFolder: "ops:createFolder"`, `opsDelete: "ops:delete"`, `opsDeletePrefix: "ops:deletePrefix"`, `opsCountPrefix: "ops:countPrefix"`, `opsRename: "ops:rename"`, `opsRenamePrefix: "ops:renamePrefix"`, `transfersUpload: "transfers:upload"`, `transfersUploadPaths: "transfers:uploadPaths"`, `transfersDownload: "transfers:download"`, `transfersCancel: "transfers:cancel"`. Add to `events` without changing any existing key: `opsProgress: "ops:progress"`, `transferProgress: "transfer:progress"`, `transferDone: "transfer:done"`.

2. **Requests.** Add them to `schemas` as non-strict zod objects. Reuse `bucketName`, `jobId`, and `connectionId` as `z.string().min(1)`. Define these in `ipc.ts`:
   - `objectKey`: string, length 1 to 1024.
   - `folderPrefix`: string, length 1 to 1024, ending in `/`.
   - `parentPrefix`: string of at most 1024 characters, either empty or ending in `/`.
   - `opsCreateFolder`: `{ connectionId, bucket, parent: parentPrefix, name }`. `name` has length 1 to 255, contains no `/`, and is not `.` or `..`. The key is `parent + name + "/"`.
   - `opsDelete`: `{ opId: jobId, connectionId, bucket, keys: objectKey[] }`, 1 to 10,000 keys.
   - `opsDeletePrefix`: `{ opId: jobId, connectionId, bucket, prefix: folderPrefix }`.
   - `opsCountPrefix`: `{ connectionId, bucket, prefix: folderPrefix }`.
   - `opsRename`: `{ connectionId, bucket, fromKey, toKey }`. Both are `objectKey` and neither ends in `/`.
   - `opsRenamePrefix`: `{ opId: jobId, connectionId, bucket, fromPrefix: folderPrefix, toPrefix: folderPrefix }`.
   - `transfersUpload`: `{ connectionId, bucket, prefix: parentPrefix }`. The picker opens in main.
   - `transfersUploadPaths`: `{ connectionId, bucket, prefix: parentPrefix, paths: string[] }`, 1 to 500 paths of length 1 to 4096.
   - `transfersDownload`: `{ connectionId, bucket, key: objectKey }`, where the key does not end in `/`.
   - `transfersCancel`: `{ transferId }` where `transferId` matches `/^[A-Za-z0-9_-]{8,64}$/`.

3. **Responses.** Add them to `responseSchemas`, every one `.strict()`.
   - `opsCreateFolder` and `opsRename`: `{ key }`, the new key.
   - `opsCountPrefix`: `{ count }`, a non-negative integer.
   - `opsDelete`, `opsDeletePrefix`, and `opsRenamePrefix`: `{ completed: string[], remaining: string[], error?: IpcError }`. Both arrays hold source keys. `error` is present exactly when the operation stopped early. On full success `remaining` is empty and `completed` holds every key. This is the PLAN shape, and the full list over IPC is an accepted tradeoff.
   - `transfersUpload`: `{ transferIds: string[] }`, empty when the user closes the dialog.
   - `transfersUploadPaths`: `{ transferIds: string[], rejectedCount: number }`.
   - `transfersDownload`: `{ transferId: string | null }`, `null` when the user closes the save dialog.
   - `transfersCancel`: `{ cancelled: boolean }`. It is `true` only when a queued or running transfer with that id owned by the calling sender was cancelled. An unknown, finished, or foreign id returns `false` and is not an error.

4. **Errors.** Add the codes `CONFLICT` and `TOO_LARGE` to `errorSchema` and to `errorCodes` in `register.ts`, with the fixed messages `"Destination exists"` and `"Too large to rename"`. Change the `INVALID_REQUEST` message in `register.ts`: a thrown `INVALID_REQUEST` keeps its own message, which is `"Both keys are required"` for the store and `"Job already exists"` for a duplicate search job, and falls back to `"Invalid request"` when it has none. Handlers must throw only fixed strings with this code, never S3 text or user data. In `mapS3Error`, make `NoSuchBucket`, `NoSuchKey`, and `NotFound` all map to `NOT_FOUND` with message `"Request failed"`, and export `throwMappedError` from `browse.ts`. Those two edits are the only changes allowed in `browse.ts`. Add unit tests for the three NOT_FOUND names and for the duplicate job message.

5. **Rename one object (`ops.ts` `renameObject`).** The order is fixed and every step that can fail stops the operation:
   1. `fromKey === toKey` throws `INVALID_REQUEST` `"Source and destination are the same"` before any S3 call.
   2. `HeadObject` on the source. A missing source surfaces as `NOT_FOUND` through the mapper. If `ContentLength` is greater than `MAX_COPY_BYTES = 5 * 1024 ** 3`, throw `TOO_LARGE` and issue no copy. Exactly `MAX_COPY_BYTES` is allowed. Export the constant.
   3. `HeadObject` on the destination. If it succeeds, throw `CONFLICT` and issue no copy, because S3 copy silently overwrites. If it throws `NotFound` or `NoSuchKey`, continue. Any other error is mapped and thrown, with no copy.
   4. `CopyObjectCommand` with `CopySource` encoded per segment as in the verified facts. A copy is confirmed only when the call resolves and `CopyObjectResult?.ETag` is a non-empty string. A resolved response without an ETag is a copy failure, and the thrown error is a plain `Error("Copy not confirmed")` that maps to `REQUEST_FAILED`.
   5. Only after step 4 confirms, `DeleteObjectCommand` on the source. If the delete fails, the destination and the source both remain, and the mapped error is thrown.
   The response is `{ key: toKey }`.

6. **Rename a folder (`ops.ts` `renamePrefix`).**
   1. `fromPrefix === toPrefix`, or `toPrefix` starting with `fromPrefix`, throws `INVALID_REQUEST` `"Cannot move a folder into itself"`, before any S3 call. `fromPrefix` starting with `toPrefix` is allowed.
   2. List every key under `fromPrefix`, with no delimiter and paging until the listing ends, keeping each key and its `Size`. Include folder marker keys. An empty listing throws `NOT_FOUND`. A listing error is mapped and thrown, with nothing changed.
   3. Map each key `k` to `toPrefix + k.slice(fromPrefix.length)` with a pure exported helper.
   4. Preflight, with no mutation. If any listed `Size` is greater than `MAX_COPY_BYTES`, throw `TOO_LARGE` and issue no copy. List every key under `toPrefix` into a Set. If any mapped destination key is in that Set, throw `CONFLICT` and issue no copy. This Set check also catches the case where a mapped destination equals another source key, which would overwrite an uncopied source.
   5. Process the keys sequentially in listing order, each with the same copy confirmation and copy-then-delete rule as contract 5 steps 4 and 5, without the two `HeadObject` calls. Emit `ops:progress` after each completed key.
   6. On the first failure stop immediately. `completed` holds the keys whose copy and delete both finished. `remaining` holds the failing key and every key after it, so a key whose copy succeeded but whose delete failed is in `remaining` and both copies exist. `error` is the mapped error. Do not roll back.

7. **Delete (`ops.ts` `deleteKeys`, `deletePrefix`, `countPrefix`).**
   - A pure exported helper splits a key list into batches of at most 1,000 keys, after removing duplicates and keeping the first-seen order.
   - `deleteKeys` sends one `DeleteObjectsCommand` per batch with `Quiet: false`, sequentially. Keys in the response `Deleted` that were requested go to `completed`. If a batch response has any `Errors`, stop after that batch: `remaining` holds the batch keys not in `Deleted` plus every later batch, and `error` is `mapS3Error({ name: Errors[0].Code, message: Errors[0].Message })`. If the command itself throws, stop: `remaining` holds that batch and every later batch, and `error` is the mapped error. `remaining` may then hold a key that was already deleted, which is harmless because delete is idempotent. Emit `ops:progress` after each batch.
   - `deletePrefix` lists every key under the prefix with no delimiter, then calls `deleteKeys`. A listing error is mapped and thrown, with nothing deleted. An empty listing returns `{ completed: [], remaining: [] }`.
   - `countPrefix` pages the same listing and returns the number of keys, including folder markers, without holding the key list. A listing error is mapped and thrown.
   - `createFolder` sends `PutObjectCommand` with the key `parent + name + "/"`, an empty body, and `ContentLength: 0`, and returns `{ key }`.

8. **Progress events.** Define strict payload schemas in `ipc.ts` and add them to `eventSchemas`. Main parses each payload with its schema before `sender.send`, and sends only while `!sender.isDestroyed()`.
   - `opsProgress`: `{ opId, done, total }`, non-negative integers. `done` counts keys finished, `total` the keys planned. `total` for a delete prefix and a rename prefix is known after the listing.
   - `transferProgress`: `{ transferId, kind: "upload" | "download", bucket, key, loaded, total }`. One event is sent when the transfer is registered, with `loaded: 0`. Later events are throttled to at most one per 100 ms. The last progress event is not guaranteed because `transferDone` follows. `total` is the file size for an upload and the response `ContentLength` for a download, or 0 when absent.
   - `transferDone`: `{ transferId, status: "completed" | "cancelled" | "failed", error?: IpcError }`. It is sent exactly once per transfer, only when the sender is alive, and for a download only after the temp file is renamed or removed.

9. **Transfers (`transfers.ts`).**
   - Export a `TransferManager`. Its constructor takes `{ maxActive?: number, runners?: Partial<Runners> }`, where `Runners` is `{ upload, download }` with the real implementations as defaults. The runner seam exists so the queue and cleanup logic can be unit tested with fakes. The default `maxActive` is `3`. Transfers beyond it wait in a FIFO queue and are `queued` until a slot frees. A queued transfer already has its initial `transferProgress` event.
   - `startUpload({ client, sender, bucket, key, localPath })` and `startDownload({ client, sender, bucket, key, destPath })` register the transfer with a new `crypto.randomUUID()` id and return that id synchronously, before any await. They never throw for a transfer-time failure. That surfaces as `transferDone` with `failed`.
   - The upload runner: `stat` the file for its size, then `new Upload({ client, params: { Bucket, Key, Body: createReadStream(localPath), ContentLength: size }, partSize: 8 * 1024 * 1024 })`, with progress from `httpUploadProgress`. It must also work for a zero-byte file. Cancel calls `upload.abort()` and awaits the settlement of `done()`. A rejection after a cancel request is a `cancelled` outcome whatever the error name, and any other rejection is `failed`. Do not leave a read stream open on any path.
   - The download runner: `GetObjectCommand` with `abortSignal`, then stream the body to `destPath + ".part"` with `pipeline` and the abort signal, counting bytes. On success, when `ContentLength` is known and the byte count differs, treat it as a failure with the plain error `"Incomplete download"`. Otherwise `rename` the `.part` file to `destPath`. On cancel or any failure, remove the `.part` file with `rm(..., { force: true })` before reporting the outcome. A non-readable `Body` is a failure.
   - Cancel by id works for a queued transfer, which never starts and reports `cancelled`, and for a running one. A cancel from a sender other than the owner returns `false`.
   - Cleanup on window close: each transfer attaches `sender.once("destroyed", ...)`, which cancels that transfer with no event sent. Every terminal path, which is completion, cancel, failure, and destroy, removes the transfer from the manager and calls `sender.removeListener("destroyed", ...)` for it, so a long-lived window does not accumulate listeners. Cancel on destroy must still abort the multipart upload or remove the `.part` file.
   - Expose what tests need, such as the active and queued counts, from the manager. Do not add a public API for it.
   - Map every failure with `mapS3Error` from `browse.ts` before it goes into `transferDone`, so key ids are redacted.

10. **Transfer IPC (`src/main/ipc/ops.ts`).**
   - `opsHandlers(deps)` builds the handler map for all ten new invoke channels and owns the `TransferManager`. Its deps are `IpcDeps & { dialog?: DialogLike, maxActiveTransfers?: number, transfers?: TransferManager }`. Define `DialogLike` with exactly `showOpenDialog(options): Promise<{ canceled: boolean; filePaths: string[] }>` and `showSaveDialog(options): Promise<{ canceled: boolean; filePath?: string }>`. Electron's `dialog` satisfies it structurally. Define the option types so that the real `dialog` is assignable to `DialogLike`. A picker or download call with no `dialog` dep throws a coded `REQUEST_FAILED` with the message `"Dialog unavailable"`.
   - Every handler starts with `deps.store.get(connectionId)` and throws a coded `NOT_FOUND` `"Connection not found"` for a missing one, then `deps.clients.get`. All S3 errors go through `throwMappedError`.
   - `transfersUpload` opens `showOpenDialog` with `properties: ["openFile", "multiSelections"]`. A closed dialog returns `{ transferIds: [] }`. The chosen paths go through the same verification as `transfersUploadPaths`.
   - `transfersUploadPaths` accepts a path only when it is absolute and `stat` shows a regular file. Every other path, which is relative, missing, a directory, or unreadable, adds to `rejectedCount` and starts nothing. The upload key is `prefix + path.basename(path)`.
   - `transfersDownload` opens `showSaveDialog` with a default name equal to the last segment of the key. A closed dialog returns `{ transferId: null }`. Otherwise it starts a download to the chosen path.
   - `transfersCancel` cancels only a transfer owned by the calling sender.
   - `register(ipcMain, deps)` takes `IpcDeps & { maxSearchMatches?: number; dialog?: DialogLike; maxActiveTransfers?: number }` and registers the ten channels. `src/main/index.ts` passes `dialog` from `electron`, and no other change.

11. **Preload.** `Api` gains `ops: { createFolder, delete, deletePrefix, countPrefix, rename, renamePrefix, onProgress }` and `transfers: { upload, uploadPaths, download, cancel, onProgress, onDone, pathsForFiles }`. Each `on*` follows the existing `subscribe` helper and returns an unsubscribe function. `pathsForFiles(files)` calls `webUtils.getPathForFile` on each file in the preload and returns the non-empty strings. It is the only way a local path reaches main from the renderer. If `File` is not available as a type under `tsconfig.node.json`, type the parameter structurally and record the decision in `notes.md`. Every nested object is frozen. The preload imports no zod value.

## Files
Allowed production and test paths:
- `src/shared/channels.ts` (modify: contract 1. Deviation from the PLAN file list.)
- `src/shared/ipc.ts` (modify: requests, responses, event payload schemas, `CONFLICT`, `TOO_LARGE`, inferred types, `Api` additions)
- `src/main/ipc/register.ts` (modify: register ten channels, new error codes, `INVALID_REQUEST` message, new deps)
- `src/main/ipc/browse.ts` (modify: only the two changes in contract 4. Deviation from the PLAN file list.)
- `src/main/ipc/ops.ts` (create)
- `src/main/s3/ops.ts` (create)
- `src/main/s3/transfers.ts` (create)
- `src/main/index.ts` (modify: pass `dialog` only. Deviation from the PLAN file list.)
- `src/preload/index.ts` (modify)
- `test/unit/ops-plan.test.ts` (create: the pure helpers, key mapping, batching, copy-source encoding, the size limit with a stubbed `HeadObject`, and the command-order guarantees of contracts 5 to 7 against a scripted stub client)
- `test/unit/ipc-ops.test.ts` (create: IPC level through `register` with a fake `ipcMain`, fake sender, fake dialog, and stub client. Deviation from the PLAN file list.)
- `test/unit/transfers.test.ts` (create: queue, cancel, and cleanup with injected fake runners. Deviation from the PLAN file list.)
- `test/unit/ipc-browse.test.ts` (modify only to add the NOT_FOUND-name and duplicate-job-message tests from contract 4)
- `test/integration/helpers.ts` (modify: add `waitFor(predicate, timeoutMs)` that polls every 50 ms and rejects with a clear message on timeout, and let `setupHarness` accept optional `{ dialog, clients }` overrides passed to `register`. Existing callers must keep working unchanged.)
- `test/integration/ops.test.ts` (create)
- `test/integration/transfers.test.ts` (create)

Worker-owned phase records:
- `docs/plans/s3-media-explorer/phase-04/notes.md` (append `## Task <M>` blocks)
- `docs/plans/s3-media-explorer/phase-04/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, dependencies, or any path listed under Invariants & Boundaries.
- Do not run `git commit`, `git reset`, `git stash`, branch changes, or ref writes. Do not leave `*.tsbuildinfo`, `out/`, `test/.tmp/`, or stray temp files in the Git status.

## Tasks
Write each failing test first and show a behavioral RED before the implementation, not an import error. Never use a fixed sleep to wait for an asynchronous result. Await an event or poll a condition with `waitFor`.

- task-1: Schemas, errors, and pure helpers. Write `ops-plan.test.ts` first: batching at 0, 1, 999, 1000, 1001, and 2500 keys with a duplicate; prefix key mapping, including `fromPrefix` that starts with `toPrefix`; the into-itself and same-prefix rejections; the per-segment copy-source encoding for a key with a space, unicode, `+`, and `%25`; the `MAX_COPY_BYTES` boundary with a stubbed `HeadObject` at the limit and at limit plus 1. Then extend `ipc-browse.test.ts` for contract 4 and write the IPC-level tests for the new error codes and the `INVALID_REQUEST` message. Then implement the channels, schemas, `register.ts` changes, the `browse.ts` edits, and the pure helpers.
- task-2: File operations. Using a scripted stub client that records every command in order, write unit tests first for: rename issues no `DeleteObjectCommand` when the copy throws, when the copy resolves with no `ETag`, and when the source `HeadObject` fails; a destination that exists gives `CONFLICT` with no copy; a failing delete leaves the report correct; prefix rename stops on the first failure with the exact `completed` and `remaining` lists, including the copied-but-not-deleted key; the conflict preflight catches a mapped destination that equals another source key; delete batches stop after a batch with `Errors` and after a thrown batch, with the exact lists; `countPrefix` over several pages; `createFolder` key and body; and `ops:progress` events through `register`. Then implement `src/main/s3/ops.ts` and the ops handlers in `src/main/ipc/ops.ts`.
- task-3: Transfers. Write `transfers.test.ts` first with fake runners: ids returned synchronously, the initial `transferProgress` event, the queue with `maxActive` 1 or 2, cancel of a queued and a running transfer, a foreign sender's cancel returning `false`, exactly one `transferDone`, throttled progress, and cleanup. For cleanup assert that the manager is empty, that the destroyed-listener count returns to zero after 25 sequential transfers, and that destroy cancels a running transfer and sends nothing afterwards. Add IPC-level tests in `ipc-ops.test.ts` for the picker, save dialog, closed dialogs, `uploadPaths` rejection of a relative, missing, and directory path, a missing dialog dep, and `assertNoSecrets` on every response and event payload, using a manual connection created with the fake key `AKIAFIXTUREFIXTURE00` through the real store, with fixture names free of the forbidden substrings. Then implement `transfers.ts`, the transfer handlers, `index.ts`, and the preload additions. Run `pnpm build`, confirm every `require` specifier in `out/preload/index.cjs` is `electron`, and confirm that `timeout 10 xvfb-run -a pnpm exec electron .` runs without new error output beyond the unrelated Wayland and Vulkan ozone message. Record the commands and results in `notes.md`.
- task-4: Integration. Write `ops.test.ts` and `transfers.test.ts` through the real `register`, a real store, vault, and `S3ClientFactory`, a fake dialog, a fake sender, and a manual RustFS connection. Use one uniquely named bucket per test file, an explicit `beforeAll` hook timeout of at least 120 s, and delete the objects and the bucket in `afterAll`. Keep every seeded key and query free of `//` and of the forbidden secret-scan substrings.
  - `ops.test.ts`: create a folder and see it as a zero-byte marker that `objectsList` returns as a folder. Delete 2,500 keys in one `opsDelete` and prove three batches ran and every key is gone. `deletePrefix` with `countPrefix` agreeing before the delete. Rename single objects whose keys contain a space, unicode, `+`, and `%25`, proving the destination holds the original bytes and the source is gone. A rename onto an existing key gives `CONFLICT` and leaves both objects intact. A same-key rename gives `INVALID_REQUEST`. Rename a nested folder with about 50 keys including a marker, proving the content and that no source key is left. Partial failure, injected through a wrapper client passed as the `clients` override whose `send` rejects a `CopyObjectCommand` for one chosen key and delegates everything else: assert that `completed` and `remaining` are exact, that every uncopied key still exists in the bucket, that the failing key has no destination, and that the error code is `REQUEST_FAILED`. Repeat with a wrapper that rejects `DeleteObjectCommand` for one key after its copy succeeded: both copies exist and that key is in `remaining`.
  - `transfers.test.ts`: upload a 20 MiB random file, which forces multipart, through `transfersUpload` with the fake open dialog, wait for `transferDone` `completed`, download it through `transfersDownload` with the fake save dialog, and compare the SHA-256 of the original and the download. Assert the progress events are non-decreasing and end at the file size. Cancel a 50 MiB upload from inside the first `transferProgress` event that has `loaded > 0`: assert `transferDone` is `cancelled`, `HeadObject` on the key is `NotFound`, and `ListMultipartUploads` becomes empty, polled with `waitFor` and a deadline of at least 15 s. Cancel a download of that 50 MiB object from its first progress event and assert `transferDone` is `cancelled` and that neither the `.part` file nor the destination file exists. Upload a zero-byte file. Run `transfersUploadPaths` with a valid file, a directory, a relative path, and a missing path, and assert the rejected count. Destroy the fake sender during a running upload and assert nothing is sent afterwards and the multipart upload disappears.

## Done When
- Every Verification Check below exits 0 from `/home/ngosi/projects/s3-explorer`.
- The integration tests prove the 20 MiB multipart round trip with equal SHA-256, the cancelled 50 MiB upload leaving no object and no pending multipart upload, the cancelled download leaving no `.part` file, the rename partial failure reports, the 2,500-key batched delete, and the special-character key renames.
- The unit tests prove that no delete runs unless its copy is confirmed with an ETag, the 5 GiB limit is checked before any copy, the conflict preflight, batch splitting, the transfer queue, and listener and manager cleanup on done, cancel, failure, and destroy.
- Every new response and event schema is `.strict()`. Every new response and event payload in the IPC unit tests passes the Phase 2 secret scan.
- No new production code uses `any`. `src/main/ipc/connections.ts` and `src/main/connections/**` are unchanged. `browse.ts` changed only as contract 4 allows. `src/main/index.ts` changed only to pass `dialog`.
- The built preload requires nothing except `electron`.
- Run from `/home/ngosi/projects/s3-explorer` (Baseline: all four exit 0 at the base, with 66 unit tests and 6 integration tests passing):
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

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable. The RustFS container is already running on `127.0.0.1:19000`. If it is not, run `docker compose -f test/rustfs/compose.yaml up -d`.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/s3-media-explorer/phase-04/journal.md`, then return that block and the matching status line from `erp.md`.
