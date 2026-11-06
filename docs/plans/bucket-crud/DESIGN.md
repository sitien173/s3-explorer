# S3 Bucket Create and Delete Design

**Status:** Confirmed 2026-11-06
**Consultation:** Two consult jobs agreed: balanced `267a1ef3-e24b-4b1c-a350-8a975888f50b` and openai `d69b1db0-9854-48fd-b9c3-fd33edd6fb38`. Both recommend empty-only delete, a creation-only name schema, resolved-region `LocationConstraint`, and fixed error messages in `register.ts`. Their `sortBuckets` finding was rejected: main returns sorted buckets and the renderer sort is stable.

## Purpose

Let users create real S3 buckets and delete empty S3 buckets from the sidebar. Today the app only lists buckets. `buckets:add` saves a name locally and never calls S3.

## Users and Success Criteria

Users: people who manage AWS profile or S3-compatible connections in S3 Media Explorer.

Success criteria:

- A user can create a bucket with a valid name. The bucket appears in the sidebar even when listing is denied.
- A user can delete an empty bucket after typing its exact name. The bucket disappears from the sidebar, pins, and extras.
- Deleting a bucket that still holds objects fails with "Bucket is not empty" and removes no data.
- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `xvfb-run -a pnpm e2e` pass.

## Constraints, Invariants, and Non-Goals

Constraints and invariants:

- The renderer stays sandboxed. It never receives credentials or builds S3 requests.
- The shared `bucketName` schema at `src/shared/ipc.ts:20-22` does not change. Existing non-conforming buckets stay browsable.
- Every new error code returns a fixed message. No raw SDK text reaches the renderer.
- Delete sends `DeleteBucket` only. It never lists or deletes objects.
- "Add bucket by name" stays a local bookmark, separate from "New bucket".
- Create and delete stay enabled when listing is denied.

Non-goals:

- Bucket update, settings, or rename.
- Emptying a bucket before delete.
- Specialized bucket types such as directory buckets.
- Blocking transfers, searches, or stream handles that target a bucket being deleted.

## Chosen Approach

Empty-only delete plus create in the connection's resolved region, through two new IPC channels.

- Rejected: empty, then delete. It needs version, delete-marker, Object Lock, and multipart handling, and one action could destroy all data.
- Rejected: tightening the shared `bucketName` schema. It would break browsing of existing non-conforming buckets.
- Rejected: reusing `CONFLICT`. `register.ts` maps it to "Destination exists", which is wrong for bucket errors.

## Architecture and Data Flow

Main process:

- Add channels `buckets:create` and `buckets:delete` in `src/shared/channels.ts`, schemas and types in `src/shared/ipc.ts`, forwarding in `src/preload/index.ts`, handlers in `src/main/ipc/browse.ts`, and registration in `src/main/ipc/register.ts`.
- Add `createBucket` and `deleteBucket` in `src/main/s3/buckets.ts`.
- Create resolves the region as `connection.region`, falling back to `await client.config.region()`. It omits `CreateBucketConfiguration` when the region is `us-east-1` or empty. Otherwise it sends `LocationConstraint` with that region.
- `buckets:create` uses a new `createBucketName` schema: 3-63 characters, lowercase letters, digits, dots, and hyphens; starts and ends with a letter or digit; no IPv4 form; no `..`; none of the reserved prefixes or suffixes in the AWS general-purpose naming rules.
- After create succeeds, the handler adds the name to `extraBuckets`.
- After delete succeeds, the handler re-reads the connection from the store, then removes the name from `pinnedBuckets` and `extraBuckets`.

Renderer:

- `Sidebar.tsx` adds a "New bucket" button in the selected connection's header. It opens a name dialog.
- The bucket context menu adds "Delete bucket". It opens an `AlertDialog` that shows the connection and bucket. The confirm button enables only on an exact name match.
- The dialog fixes the connection ID and bucket name when it opens. The confirm button is disabled while a request runs.
- When the deleted bucket is the selected bucket, `App.tsx` clears the selected bucket, prefix, search results, selection, and viewer target.

## Errors and Edge Cases

Error mapping, added to `errorSchema`, `errorCodes` in `browse.ts`, and the message mapping in `register.ts`:

| S3 error | IPC code | Message |
|---|---|---|
| `BucketAlreadyExists`, `BucketAlreadyOwnedByYou` | `BUCKET_EXISTS` | "Bucket name is taken" |
| `BucketNotEmpty` | `BUCKET_NOT_EMPTY` | "Bucket is not empty" |
| `InvalidBucketName` | `INVALID_REQUEST` | "Invalid bucket name" |
| `AccessDenied` | `ACCESS_DENIED` | "Access denied" |

Edge cases:

- Recreate in `us-east-1`: the openai consultation states AWS may return 200 for a bucket you already own there and reset its ACL. This is not yet verified against AWS documentation. The create dialog blocks names already in the loaded list. A race remains.
- Partial success: when S3 succeeds and the store update fails, the response reports success with a warning.
- Double submit: blocked by the disabled confirm button.
- Activity in a deleted bucket: not blocked in v1. Empty-only delete removes no data. Later requests fail with `NOT_FOUND`.

## Migration

n/a. No stored data changes shape. `pinnedBuckets` and `extraBuckets` keep their current format.

## Testing

Unit tests with a mocked client in `test/unit/ipc-browse.test.ts`:

- `LocationConstraint` omitted for `us-east-1` and empty region, sent for `eu-west-1`, resolved from the client for profile connections without a region.
- `createBucketName` accepts and rejects names for case, `_`, `..`, IPv4 form, reserved prefixes and suffixes, and length.
- Create adds to `extraBuckets`. Delete removes from pins and extras. A store failure returns success with a warning.
- Error mapping through the registered IPC envelope with `assertNoSecrets`.
- Delete sends no `DeleteObjects` or `ListObjects*` command.

Renderer tests in `test/unit/renderer-dialogs.test.tsx`:

- The delete button enables only on an exact name match. Focus is trapped and restored. Double submit is blocked.
- Deleting the selected bucket clears app selection state.

Integration tests against RustFS with unique names and cleanup:

- Create, list, delete.
- A duplicate create returns `BUCKET_EXISTS`.
- Deleting a bucket with one object returns `BUCKET_NOT_EMPTY`, and the object remains.

Manual checks in `docs/manual-checklist.md`: AWS `LocationConstraint` behavior outside `us-east-1`, and AWS `us-east-1` recreate behavior.

## Risks and Open Questions

- AWS `us-east-1` recreate semantics are unverified and need a manual AWS check.
- MinIO compatibility is untested. Integration tests cover RustFS only.
- A manual connection with a custom region on an endpoint that rejects `LocationConstraint` will fail with a mapped error. No workaround in v1.
- Deleting an AWS bucket releases its name to other accounts. The confirmation dialog is the only mitigation.
