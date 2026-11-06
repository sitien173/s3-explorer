# S3 Bucket Create and Delete Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `bucket-crud`
**Base:** `refs/plans/bucket-crud/base` (`db071f884cdac0dd5d00e027d92227a7ea45e9db`)
**Commit:** `feat(buckets): create and delete S3 buckets`

## Outcome & Scope

Users can create a real S3 bucket and delete an empty S3 bucket from the sidebar.

Preserved invariants:

- The renderer stays sandboxed. It never receives credentials or builds S3 requests.
- The shared `bucketName` schema at `src/shared/ipc.ts:20-22` does not change.
- New error codes return fixed messages. No raw SDK text reaches the renderer.
- Delete sends `DeleteBucket` only. It never lists or deletes objects.
- "Add bucket by name" stays a local bookmark.
- Existing channels, schemas, and behavior stay unchanged.

Out of scope: bucket update or settings, rename, emptying a bucket, specialized bucket types, blocking activity in a bucket being deleted.

## Baseline Evidence

All commands ran at plan base `db071f8` on 2026-11-06.

- `pnpm typecheck`: pass, exit 0.
- `pnpm test`: 31 files, 666 tests passed.
- `pnpm test:integration`: 7 files, 25 tests passed against RustFS.
- `pnpm build`: pass, exit 0.
- `xvfb-run -a pnpm e2e`: 1 test passed.

Integration tests and e2e both use RustFS on port 19000. Run them one after the other, never at the same time.

### Phase 1: Main-process bucket create and delete

**Task Guide Input:** Backend repository implementation. Add `buckets:create` and `buckets:delete` IPC channels end to end in the Electron main process, shared zod schemas, and preload, with unit tests on a mocked S3 client and RustFS integration tests. Follow `docs/plans/bucket-crud/DESIGN.md` sections "Architecture and Data Flow" main-process part, "Errors and Edge Cases", and "Testing" unit and integration parts. No renderer UI changes.
**Goal:** The main process creates and deletes S3 buckets through typed IPC with mapped, fixed-message errors.
**Depends on:** none
**Invariants & Boundaries:** Do not change the shared `bucketName` schema or any existing channel behavior. Do not change renderer files. Do not read `.env` files, AWS config or credential files, or secret stores.
**Files:**
- Modify: `src/shared/channels.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/s3/buckets.ts`
- Modify: `src/main/ipc/browse.ts`
- Modify: `src/main/ipc/register.ts`
- Modify: `test/unit/ipc-browse.test.ts`
- Create: `test/integration/buckets.test.ts`
**Tasks:**
1. Contract. Add `bucketsCreate: "buckets:create"` and `bucketsDelete: "buckets:delete"` channels. Add request schemas `{ connectionId, bucket }`. Create uses a new `createBucketName` schema. Delete uses the existing `bucketName`. Add response schemas `{ bucket: string, warning?: string }`. Add `create` and `delete` to `Api["buckets"]` and to the preload `buckets` object. Add `BUCKET_EXISTS` and `BUCKET_NOT_EMPTY` to `errorSchema` and to `errorCodes` in `browse.ts`. Write `createBucketName` accept and reject tests first.
2. S3 functions. In `src/main/s3/buckets.ts`, add `createBucket(client, bucket, region)` and `deleteBucket(client, bucket)`. Create omits `CreateBucketConfiguration` when the region is `us-east-1` or empty, and otherwise sends `LocationConstraint`. Write mocked-client tests first. They cover `us-east-1`, an empty region, `eu-west-1`, and confirm that delete sends no `DeleteObjects` or `ListObjects*` command.
3. Handlers and errors. In `browse.ts`, add handlers. The region is `connection.region`, falling back to `await client.config.region()`. Create adds the name to `extraBuckets`. Delete re-reads the connection after S3 succeeds, then removes the name from `pinnedBuckets` and `extraBuckets`. A store failure after S3 succeeds returns success with `warning`. In `mapS3Error`, map `BucketAlreadyExists` and `BucketAlreadyOwnedByYou` to `BUCKET_EXISTS`, `BucketNotEmpty` to `BUCKET_NOT_EMPTY`, and `InvalidBucketName` to `INVALID_REQUEST`. In `register.ts`, register both channels and add fixed messages "Bucket name is taken" and "Bucket is not empty". Test the registered envelopes with `assertNoSecrets`.
4. Integration. In `test/integration/buckets.test.ts`, test against RustFS with unique names and cleanup: create, list, delete; a duplicate create returns `BUCKET_EXISTS`; deleting a bucket holding one object returns `BUCKET_NOT_EMPTY`, and the object remains.
**Acceptance Criteria:**
- `buckets:create` with a valid name creates the bucket on RustFS, and `buckets:list` then includes it.
- `buckets:create` with `My_Bucket` returns `INVALID_REQUEST` without calling S3.
- `buckets:delete` on a non-empty bucket returns `{ code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" }`, and the object remains.
- A successful delete removes the name from `pinnedBuckets` and `extraBuckets`.
- All existing unit and integration tests still pass.
**Reviewer Checklist:**
- The `LocationConstraint` rule matches DESIGN.md for all region cases, including profile connections with no region set.
- No new error path forwards raw SDK message text.
- Delete code has no path that lists or deletes objects.
- The store update uses a connection read after the S3 call, not a copy taken before it.
- The shared `bucketName` schema is unchanged.
- No renderer file changed.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`

### Phase 2: Sidebar create and delete UI

**Task Guide Input:** Frontend implementation. Add "New bucket" and "Delete bucket" to the React renderer sidebar using shadcn/ui primitives with existing TDS styling, wire them to `api.buckets.create` and `api.buckets.delete` from Phase 1, clear app state when the open bucket is deleted, and update docs. Follow `docs/plans/bucket-crud/DESIGN.md` sections "Architecture and Data Flow" renderer part, "Errors and Edge Cases", and "Testing" renderer part.
**Goal:** Users create and delete buckets from the sidebar with safe confirmation.
**Depends on:** Phase 1
**Invariants & Boundaries:** Keep `AddBucketDialog.tsx` behavior unchanged. Preserve Radix focus trap and restore, and the existing keyboard shortcuts. Do not change main-process or shared files. Do not read `.env` files, AWS config or credential files, or secret stores.
**Files:**
- Create: `src/renderer/src/components/CreateBucketDialog.tsx`
- Create: `src/renderer/src/components/DeleteBucketDialog.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/toasts.ts`
- Modify: `test/unit/renderer-dialogs.test.tsx`
- Modify: `test/unit/renderer-shell.test.tsx`
- Modify: `README.md`
- Modify: `docs/manual-checklist.md`
**Tasks:**
1. Dialogs. `CreateBucketDialog` uses `Dialog`, follows the `AddBucketDialog` pattern, validates with the same rules as `createBucketName`, and blocks names already in the loaded list. `DeleteBucketDialog` uses `AlertDialog`, shows the connection and bucket names fixed when it opens, and enables the confirm button only on an exact typed match and while no request runs. Write tests first in `renderer-dialogs.test.tsx`.
2. Sidebar. Add a "New bucket" button in the selected connection's bucket header, visible even when the list is empty or listing is denied. Add "Delete bucket" to the bucket context menu. Refresh the list after success. Show a warning toast when the response carries `warning`. Add "Create bucket" and "Delete bucket" to the `buildOperationFailedToast` allowlist.
3. App state. When the deleted bucket is the selected bucket, clear the selected bucket, prefix, search results, selection, and viewer target. Test this in `renderer-shell.test.tsx`.
4. Docs. In `README.md`, update the "Sidebar bucket items" line to list "Delete bucket" and mention "New bucket". In `docs/manual-checklist.md`, add manual AWS checks for create outside `us-east-1`, the `us-east-1` recreate case, and delete of a non-empty bucket.
**Acceptance Criteria:**
- "New bucket" creates a bucket that appears in the sidebar without a manual refresh.
- The "Delete bucket" confirm button stays disabled until the typed name matches exactly.
- Deleting the open bucket returns the main view to the no-bucket state.
- A `BUCKET_NOT_EMPTY` failure shows "Bucket is not empty" and leaves the bucket in the list.
- All existing unit tests and the e2e test still pass.
**Reviewer Checklist:**
- The delete target cannot change while the dialog is open.
- Double submit is impossible in both dialogs.
- Focus returns to the trigger after each dialog closes.
- State clearing happens only when the deleted bucket matches the selection.
- `AddBucketDialog.tsx` is unchanged.
- No main-process or shared file changed.
**Verification Checks:**
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `xvfb-run -a pnpm e2e`
