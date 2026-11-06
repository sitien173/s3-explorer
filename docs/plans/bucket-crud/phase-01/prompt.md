# Phase 1: Main-process bucket create and delete

## Goal & Outcome
- Plan Goal: users can create a real S3 bucket and delete an empty S3 bucket from the S3 Media Explorer sidebar.
- Phase Outcome: the Electron main process exposes `buckets:create` and `buckets:delete` through typed, zod-validated IPC and preload. Errors are mapped to fixed messages. Unit and RustFS integration tests cover the behavior. No renderer UI in this phase.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/bucket-crud/phase-01/base`
- Prior State: baseline at plan base. `pnpm typecheck` passes. `pnpm test` passes 31 files and 666 tests. `pnpm test:integration` passes 7 files and 25 tests against RustFS.
- Design: `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/DESIGN.md`. Read it first. Sections "Architecture and Data Flow" main-process part, "Errors and Edge Cases", and "Testing" apply.
- Code Context:
  - `src/shared/channels.ts`: channel name map. Bucket channels `bucketsList`, `bucketsPin`, `bucketsUnpin`, `bucketsAdd`.
  - `src/shared/ipc.ts`: `bucketName` schema at lines 20-22. Request `schemas` around line 76. `errorSchema` around line 203. `responseSchemas` around line 250. Request and response type maps around lines 415, 497, 572, 601. `Api["buckets"]` around line 645.
  - `src/preload/index.ts`: `buckets` object at lines 16-21 forwards to `ipcRenderer.invoke`.
  - `src/main/s3/buckets.ts`: `listBuckets(client, { pinned, extras })`.
  - `src/main/ipc/browse.ts`: `errorCodes` at lines 19-29 and `toErrorCode`. `codedError`. `mapS3Error` at lines 42-80 maps SDK error `name` to `IpcError`. `throwMappedError`. Bucket handlers at lines 142-189 use `deps.store.get`, `deps.clients.get`, `deps.store.update`.
  - `src/main/ipc/register.ts`: `registerChannel` at lines 50-110 validates input, parses responses, and rewrites error messages per code at lines 90-106. Unknown codes become "Request failed". Bucket channels are registered around line 122.
  - `src/main/s3/client.ts`: `S3ClientFactory.get(connection)` only sets `region` when `connection.region` is set. The SDK resolves it otherwise; read it with `await client.config.region()`.
  - Tests: `test/unit/ipc-browse.test.ts` holds bucket handler tests and registered-envelope tests using `assertNoSecrets` from `test/unit/secret-scan.ts`. `test/integration/helpers.ts` exports `setupHarness`, `createTestBucket`, `emptyAndDeleteBucket`, `seedObjects`, `waitFor`. Follow `test/integration/list.test.ts` for harness use.

## Invariants & Boundaries
- Preserve: the shared `bucketName` schema, every existing channel, schema, handler, error code, and message.
- Preserve: delete never lists or deletes objects. It sends `DeleteBucketCommand` only.
- Preserve: new error codes return fixed messages, never raw SDK text.
- Out of Scope: renderer files under `src/renderer/`, bucket settings, rename, emptying a bucket, specialized bucket types, account regional namespace, blocking activity in a deleted bucket.
- Forbidden: reading or printing `.env` files, AWS config or credential files, or secret stores. Adding dependencies.

## Files
Allowed production and test paths:
- `src/shared/channels.ts` (modify: add `bucketsCreate: "buckets:create"` and `bucketsDelete: "buckets:delete"`)
- `src/shared/ipc.ts` (modify: `createBucketName` schema, request and response schemas, types, `Api["buckets"]` entries, `BUCKET_EXISTS` and `BUCKET_NOT_EMPTY` in `errorSchema`)
- `src/preload/index.ts` (modify: `create` and `delete` in `buckets`)
- `src/main/s3/buckets.ts` (modify: add `createBucket` and `deleteBucket`)
- `src/main/ipc/browse.ts` (modify: error codes, `mapS3Error` cases, two handlers)
- `src/main/ipc/register.ts` (modify: register two channels, fixed messages for new codes)
- `test/unit/ipc-browse.test.ts` (modify: unit tests)
- `test/integration/buckets.test.ts` (create: RustFS integration tests)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-01/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-01/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, `package.json`, `pnpm-lock.yaml`, or secrets.

## Tasks
- task-1: Contract. Write failing tests first for `createBucketName`, then implement. `createBucketName` accepts a name only when all of these hold: 3 to 63 characters; only `a-z`, `0-9`, `.`, `-`; starts and ends with a letter or digit; no `..`; not an IPv4 form such as `192.168.5.4`; does not start with `xn--`, `sthree-`, or `amzn-s3-demo-`; does not end with `-s3alias`, `--ol-s3`, `.mrap`, `--x-s3`, `--table-s3`, or `-an`. Export it so Phase 2 can reuse the same rule in the renderer. Request schemas: `buckets:create` takes `{ connectionId: z.string().min(1), bucket: createBucketName }`; `buckets:delete` takes `{ connectionId: z.string().min(1), bucket: bucketName }`. Response schema for both: strict `{ bucket: string, warning?: string }`. Add types, `Api["buckets"].create` and `.delete`, preload forwarding, and the two channel names. Add `BUCKET_EXISTS` and `BUCKET_NOT_EMPTY` to `errorSchema` and to `errorCodes` in `browse.ts`.
- task-2: S3 functions. Write failing mocked-client tests first. In `src/main/s3/buckets.ts` add `createBucket(client, bucket, region)` sending `CreateBucketCommand`. Omit `CreateBucketConfiguration` when `region` is `us-east-1`, empty, or undefined. Otherwise send `CreateBucketConfiguration: { LocationConstraint: region }`. Add `deleteBucket(client, bucket)` sending only `DeleteBucketCommand`. Test `us-east-1`, empty region, `eu-west-1`, and that delete sends no `DeleteObjects`, `ListObjectsV2`, or `ListObjectVersions` command.
- task-3: Handlers and errors. Write failing tests first. In `browse.ts` add handlers for both channels. Look up the connection; missing gives `NOT_FOUND` like existing handlers. Region is `connection.region`, falling back to `await client.config.region()`. Map S3 errors with `throwMappedError`. After create succeeds, add the name to `extraBuckets` if absent. After delete succeeds, call `deps.store.get` again, then remove the name from `pinnedBuckets` and `extraBuckets`. If the store read or update after a successful S3 call throws, return `{ bucket, warning: "Bucket <created|deleted>, but the saved bucket list could not be updated" }` instead of failing. In `mapS3Error`, map `BucketAlreadyExists` and `BucketAlreadyOwnedByYou` to `BUCKET_EXISTS`, `BucketNotEmpty` to `BUCKET_NOT_EMPTY`, and `InvalidBucketName` to `{ code: "INVALID_REQUEST", message: "Invalid bucket name" }`. In `register.ts` register both channels and make `BUCKET_EXISTS` return "Bucket name is taken" and `BUCKET_NOT_EMPTY` return "Bucket is not empty". Test registered envelopes for each new error path with `assertNoSecrets`, and test that an invalid create name returns `INVALID_REQUEST` without calling the client. Test that a profile connection with no `region` resolves the region from the client.
- task-4: Integration. Create `test/integration/buckets.test.ts` against RustFS using the existing harness. Use unique bucket names and clean up in `afterEach` or `afterAll`. Cover: create, then `buckets:list` includes the name, then delete, then the name is gone; a second create of the same name returns `BUCKET_EXISTS`; delete of a bucket holding one seeded object returns `BUCKET_NOT_EMPTY`, and the object still exists afterwards. If RustFS returns an error name other than `BucketAlreadyExists` or `BucketAlreadyOwnedByYou` for a duplicate, record the exact name in `notes.md` and stop with `NEXT: BLOCKED`; do not special-case it silently.

## Done When
- `buckets:create` with a valid name creates the bucket on RustFS, and `buckets:list` then includes it.
- `buckets:create` with `My_Bucket` returns `INVALID_REQUEST` without calling S3.
- `buckets:delete` on a non-empty bucket returns `{ code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" }`, and the object remains.
- A successful delete removes the name from `pinnedBuckets` and `extraBuckets`.
- No file under `src/renderer/` changed. The shared `bucketName` schema is unchanged.
- Run from `/home/ngosi/projects/s3-explorer`, sequentially:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 31 files, 666 tests passed; expect more tests, all passing)
  - `pnpm test:integration` (Baseline: 7 files, 25 tests passed; expect 8 files, all passing). Never run it at the same time as e2e; both use RustFS on port 19000.
- Do not wrap vitest in `rtk`; it writes an untracked `.vitest/` directory.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-01/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-01/journal.md`, then return that block and the matching status line from `erp.md`.
