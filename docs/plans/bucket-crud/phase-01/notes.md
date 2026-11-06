<!-- refract-shared-version: 2.5.0 -->

# Phase 1 — Decision Notes

<!-- Worker appends one `## Task <M>` block per task using /home/ngosi/projects/refract/plugin/shared/notes-template.md. -->

## Task 1

### Decisions made
- Used inert scaffolding `createBucketName = z.string()` so the RED run failed on assertions, then replaced it with the real rule.
- Shared response schema `bucketMutationResult` (strict `{ bucket, warning? }`) is used by both channels.
- IPv4 form is `^\d{1,3}(\.\d{1,3}){3}$`.

### Spec deviations
- none

### Tradeoffs accepted
- Contract tests for the two channels' request schemas are covered through registered-envelope tests in Task 3; Task 1 tests cover `createBucketName` directly.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/ipc-browse.test.ts -t createBucketName` -> `20 failed | 7 passed`; `AssertionError: expected true to be false` on every reject case.
  - GREEN: `pnpm vitest run test/unit/ipc-browse.test.ts -t createBucketName` -> `27 passed | 16 skipped`; `pnpm typecheck` exit 0.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Inert scaffolding functions that sent nothing gave the behavioral RED, then were replaced.
- Cast `region` to the SDK's `BucketLocationConstraint` type so custom regions typecheck.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/ipc-browse.test.ts -t "S3 functions"` -> `5 failed`; `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`.
  - GREEN: same command -> `5 passed`; `pnpm typecheck` exit 0.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Inert handlers (returning `{ bucket }`) plus channel registration gave the behavioral RED, then were replaced.
- Region resolution and the S3 call share one `try`, so a failed `client.config.region()` is mapped like any S3 error.
- Create skips `store.update` when the name is already in `extraBuckets`.
- Delete skips `store.update` when the re-read returns no connection.
- Added `bucketListWarning` helper in `browse.ts` for the two warning strings.

### Spec deviations
- none

### Tradeoffs accepted
- Store failures after a successful S3 call are swallowed into the warning, with no log of the cause.

### Assumptions
- `BUCKET_NOT_EMPTY` and `BUCKET_EXISTS` pass `toErrorCode` and get fixed messages in `register.ts`; the handler error message is ignored for them.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/ipc-browse.test.ts -t "bucket create and delete"` -> `16 failed | 2 passed`; e.g. `AssertionError: expected [] to have a length of 1 but got +0` and `expected 'REQUEST_FAILED' to be 'BUCKET_EXISTS'`.
  - GREEN: `pnpm vitest run test/unit/ipc-browse.test.ts` -> `66 passed (66)`; `pnpm typecheck` exit 0.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- Integration file uses two buckets: one for the create/list/delete lifecycle, one reused for the duplicate-create and non-empty-delete cases. `afterAll` empties and deletes both.
- Added a temporary raw `CreateBucketCommand` probe to see what RustFS returns for a duplicate. It was removed afterwards.

### Spec deviations
- The duplicate-create test is left failing. The phase says to stop with `NEXT: BLOCKED` when RustFS does not return `BucketAlreadyExists` or `BucketAlreadyOwnedByYou`.

### Tradeoffs accepted
- none

### Assumptions
- The stop rule also applies when RustFS returns no error at all, not only a different error name.

### Follow-ups for human
- RustFS returns HTTP 200 with no error for a second `CreateBucket` on a bucket the same credentials own, in region `us-east-1`. Raw SDK result: `{"$metadata":{"httpStatusCode":200,...}}`. No error name exists to record. This matches the DESIGN.md note that AWS may return 200 on `us-east-1` recreate.
- Decide one of: (a) drop the integration duplicate-create assertion and rely on the unit mapping test for `BUCKET_EXISTS`; (b) change the test to create with a non-`us-east-1` region if RustFS enforces it there; (c) add a pre-create existence check (`HeadBucket`) in the handler, which changes the design.
- Create and delete lifecycle test and the non-empty delete test pass.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test:integration` -> `Test Files 1 failed | 7 passed (8)`, `Tests 1 failed | 27 passed (28)`; the failure is `returns BUCKET_EXISTS for a duplicate create`: expected `{ ok: false, error: { code: "BUCKET_EXISTS", ... } }`, received `{ ok: true, data: { bucket: "integ-crud-full-..." } }`.
  - GREEN: not reached for the duplicate test. Lifecycle and non-empty delete tests pass (2 of 3 in `test/integration/buckets.test.ts`).
- Root cause (bugfix only): none
- Fresh Done When checks: `pnpm typecheck` exit 0. `pnpm test` -> 31 files, 716 tests passed. `pnpm test:integration` -> 7 files passed, 1 failed (27 of 28 tests passed).

## Task 4 (resumed)

### Decisions made
- Replaced the duplicate-create test with a no-data-loss test on a dedicated bucket (`duplicateBucket`), per the coordinator answer (option a, adjusted).
- Non-empty delete test now creates and seeds its own bucket (`nonEmptyBucket`) with `createTestBucket`, so test order does not matter.
- `afterAll` cleans all three buckets.
- Used `toContainEqual` against the two allowed results.

### Spec deviations
- The duplicate create no longer asserts `BUCKET_EXISTS`, as directed. `BUCKET_EXISTS` mapping stays covered by unit tests.

### Tradeoffs accepted
- Integration coverage does not exercise the `BUCKET_EXISTS` path against RustFS.

### Assumptions
- none

### Follow-ups for human
- Manual AWS check of `us-east-1` recreate behavior stays in `docs/manual-checklist.md` (Phase scope outside this file set).

### Test evidence
- RED -> GREEN:
  - RED: prior run `pnpm test:integration` -> `1 failed | 27 passed (28)`; duplicate test received `{ ok: true, ... }` where `BUCKET_EXISTS` was expected (see `## Task 4`). The test was a wrong expectation, not a code defect, so no new production RED applies.
  - GREEN: `pnpm test:integration` -> `Test Files 8 passed (8)`, `Tests 28 passed (28)`.
- Root cause (bugfix only): RustFS returns HTTP 200 for a second `CreateBucket` of an owned bucket in `us-east-1`.
- Fresh Done When checks: `pnpm typecheck` exit 0. `pnpm test` -> 31 files, 716 tests passed. `pnpm test:integration` -> 8 files, 28 tests passed.

## FIX 1

### Decisions made
- Added local helper `throwBucketMutationError` in `browse.ts`. It throws a coded `REQUEST_FAILED` / "Request failed" error when `mapS3Error` returns `REQUEST_FAILED`, and otherwise defers to `throwMappedError`, so SSO and all other codes are unchanged. Used only in `bucketsCreate` and `bucketsDelete`.
- `bucketsCreate` now re-reads the connection with `deps.store.get` after the S3 call and merges the name into the fresh `extraBuckets`. The read sits inside the existing `try`, so a store failure still returns the warning.

### Spec deviations
- none

### Tradeoffs accepted
- `mapS3Error` is called twice on the unrecognized-error path, once to test the code and once inside `throwMappedError` otherwise. Kept to leave `mapS3Error` untouched.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm vitest run test/unit/ipc-browse.test.ts -t "bucket create and delete"` -> `3 failed | 18 passed`. Both channels returned message `InternalError: secret-endpoint.internal token=abc123` instead of "Request failed". Create returned extraBuckets `[ 'new-bucket' ]`, expected `[ 'concurrent', 'new-bucket' ]`.
  - GREEN: `pnpm vitest run test/unit/ipc-browse.test.ts` -> `69 passed (69)`.
- Root cause (bugfix only): Finding 1: handlers forwarded the `mapS3Error` REQUEST_FAILED fallback, which embeds SDK name and message, and `register.ts` passes REQUEST_FAILED messages through. Finding 2: create merged into the `extraBuckets` snapshot read before the S3 call, overwriting concurrent changes.
- Fresh checks: `pnpm typecheck` exit 0. `pnpm test` -> 31 files, 719 tests passed. `pnpm test:integration` -> 8 files, 28 tests passed.
