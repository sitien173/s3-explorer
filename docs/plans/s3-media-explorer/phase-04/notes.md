<!-- refract-shared-version: 2.4.0 -->

# Phase 4 — Decision Notes

## Task 1

### Decisions made
- Added foundational request/response/event schema declarations, channel names, S3 error mapping changes, and initial S3 operation helpers.

### Spec deviations
- Incomplete: request/response inferred type maps, API types, handler registration, and required tests remain to be implemented.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Resume implementation and test-first workflow; no behavioral RED was established in this batch.

### Test evidence
- RED -> GREEN:
  - RED: none; test-first evidence is absent.
  - GREEN: `pnpm typecheck` -> pass (no test count; typecheck only).
- Root cause (bugfix only): none

## Task 2

### Decisions made
- none

### Spec deviations
- Not implemented.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement and test file-operation handlers, paging, batch deletion, prefix rename, progress events, and IPC integration.

### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: none
- Root cause (bugfix only): none

## Task 3

### Decisions made
- none

### Spec deviations
- Not implemented.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement transfer manager/runners, IPC, preload, and required unit tests and build checks.

### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: none
- Root cause (bugfix only): none

## Task 4

### Decisions made
- none

### Spec deviations
- Not implemented.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Add the specified RustFS integration tests and run the full verification suite.

### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: none
- Root cause (bugfix only): none

## Batch 2 — continuation

### Decisions made
- Extended `src/main/s3/ops.ts` with sequential paged listing, prefix rename preflight/processing, batched deletes, count, and copy-then-delete confirmation. Added an initial injectable transfer queue in `src/main/s3/transfers.ts`.

### Spec deviations
- Substantial work remains: no new behavioral tests/RED runs in this batch; no IPC operations handlers/registration, transfer real runners/handlers, preload API, helper updates, or integration tests. Transfer defaults are not implemented. Schema inferred channel maps and public `Api` types are not wired.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Finish every missing implementation and required test listed in prompt.md. Verify transfer manager semantics, especially terminal events, runners, abort cleanup, and actual S3 errors.

### Test evidence
- RED -> GREEN:
  - RED: none; no new behavioral RED was run. Existing partial behavior was not claimed as test-first.
  - GREEN: `pnpm typecheck` -> pass.
  - GREEN: `pnpm test` -> 8 files, 66 tests passed.
  - GREEN: `pnpm test:integration` -> 4 files, 6 tests passed.
  - GREEN: `pnpm build` -> pass.
  - Preload require check -> only `"electron"` found.
  - `timeout 10 xvfb-run -a pnpm exec electron .` -> timed out with exit 124 after 10 seconds; output contained the expected Wayland/Vulkan ozone warning and SIGTERM on timeout.
- Root cause (bugfix only): none

## Batch 3 — Scope A

### Decisions made
- Inspected the on-disk files: `src/main/s3/ops.ts` is 49 lines and contains `batchKeys`, `mapPrefixKey`, `copySource`, `renameObject`, plus `renamePrefix`, `deleteKeys`, `deletePrefix`, `countPrefix`, and `createFolder` compressed onto lines. `src/main/s3/transfers.ts` is 22 lines and contains only an injectable queue scaffold; it has no real upload/download runners. Earlier statements about completed transfer behavior were overstated; these files are not evidence of full Phase 4 completion.
- Completed IPC inferred aliases and channel maps, and `Api` type additions. Request schemas are non-strict; new response and event schemas are strict. Fixed response error code validation to use the IpcError code enum.
- Confirmed browse.ts differs only in the two contract-4 edits: missing-key error mapping and `throwMappedError` export.

### Spec deviations
- Scope A implementation is substantially complete, but required `pnpm typecheck` is blocked by out-of-scope preload implementation: `src/preload/index.ts` still lacks `ops` and `transfers` on its `Api` value. Did not edit preload or register new channels per scope limits.
- No behavioral RED was run for helpers already present before this scope. Newly added invalid-error-code response-schema assertion was run RED then fixed. Existing rename-object cases were tested after implementation existed; do not interpret those tests as test-first evidence.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- The later preload scope must implement the new Api members for whole-project typecheck to pass. Continue other Phase 4 scopes only after this bounded batch.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts` -> 1 failed assertion: expected invalid IpcError response code to be rejected, but received `true`.
  - GREEN: `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts test/unit/ipc-browse.test.ts` -> 2 files, 34 tests passed after narrowing the response error code schema.
  - GREEN: `pnpm test` -> 9 files, 87 tests passed.
  - `pnpm typecheck` -> failed at `src/preload/index.ts(48,7)`: `Api` is missing `ops` and `transfers`; intentionally not changed under Scope A.
- Root cause (bugfix only): response IpcError schema previously accepted arbitrary code strings; the new assertion exposed it and the schema now uses the fixed error-code enum.

## Batch 4 — Scope B

### Decisions made
- Audited the previous file-size concern: `ops.ts` held the previously confirmed functions in compressed form; this batch formatted it and `ops-plan.test.ts` to tabs/readable wrapping. `ipcErrorForResponse` now aliases `errorSchema`; the three pre-existing type/API declarations were restored to base formatting.
- `pathsForFiles` uses an array of structural `{ readonly name: string }` values in the shared API and casts each to Electron's `File` for `webUtils.getPathForFile`; `File` is available to the preload typecheck.
- For `DeleteObjects` with no `Errors` but an omitted requested key in `Deleted`, the old code returned that key in neither list. It now includes all unconfirmed keys in `remaining` and returns fixed `REQUEST_FAILED: Request failed`.

### Spec deviations
- None within Scope B. Transfers and integration code were not started; register wires only the six ops channels.

### Tradeoffs accepted
- None.

### Assumptions
- `DialogLike` is defined now for contract compatibility; its picker/save handlers remain outside this scope.

### Follow-ups for human
- Continue with the next assigned scope; Phase 4 is not complete.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts` -> missing-Deleted regression failed: expected `remaining: ["b"]` and fixed error, received `remaining: []` with no error.
  - RED: `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts test/unit/ipc-ops.test.ts` before IPC implementation -> 3 failures; first assertion showed the six ops channels were not registered, other invocations failed because their handlers were absent.
  - RED (temporary mutation): replaced rename-prefix progress callback with `void 0`; `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts -t 'pages rename listings'` failed because expected `[[1, 2], [2, 2]]` but got `[]`. Restored callback immediately.
  - RED: prefix partial-failure test exposed remapping of a coded `ACCESS_DENIED` to `REQUEST_FAILED` (`Error: Access denied`). The operation now retains a previously mapped IpcError in its partial report.
  - GREEN: `pnpm typecheck` -> pass.
  - GREEN: `pnpm test` -> 10 files, 101 tests passed.
  - GREEN: `pnpm test:integration` -> 4 files, 6 tests passed.
- Root cause (bugfix only): batch delete trusted absence of `Errors` as confirmation even when `Deleted` omitted requested keys; prefix rename mapped already-mapped errors a second time and discarded the original code.

## Batch 5 — Scope C

### Decisions made
- Rewrote `src/main/s3/transfers.ts` in the repository's tabbed, one-statement-per-line style. Kept separate required `UploadInput` and `DownloadInput` runner contracts, provided SDK-backed runners as defaults, and retained the injected runner seam for manager tests.
- Download progress is counted in a Transform while streaming to `<destPath>.part`; known-length mismatches fail with `Incomplete download`. All failure/abort paths remove the partial file before the manager reports the terminal state. Upload read streams are destroyed in `finally`.
- Updated rename-prefix error-code recognition to parse `candidate.code` with `errorSchema.shape.code.safeParse`, preserving validated code/message and delegating all other errors to `mapS3Error`.

### Spec deviations
- none within Scope C. Scope C does not finish the phase; integration transfer/operation tests remain for the follow-up scope.

### Tradeoffs accepted
- none

### Assumptions
- Upload progress events lacking SDK `loaded`/`total` use zero loaded and the stat-derived file size as total.

### Follow-ups for human
- Continue with the remaining phase integration scope; no commit was made.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'initial event'` while temporarily removing the initial progress emission from `TransferManager.start` -> failed the behavioral assertion: expected 2 `transfer:progress` events but got 0. The mutation was immediately restored.
  - RED: initial `pnpm exec vitest run --project unit test/unit/transfers.test.ts` -> 5 failures including missing default runners and a FIFO test harness timeout; these exposed absent runners and a flawed manual-release test harness. The FIFO test was corrected to assert observed FIFO order and peak concurrency without timing assumptions.
  - GREEN: `pnpm exec vitest run --project unit test/unit/transfers.test.ts` -> 1 file, 14 tests passed.
  - GREEN: `pnpm typecheck` -> exit 0.
  - GREEN: `pnpm test` -> 11 files, 115 tests passed.
  - GREEN: `pnpm test:integration` -> 4 files, 6 tests passed; harness started and stopped RustFS.
  - Generated `out/`, `test/.tmp/`, and TypeScript build-info files were removed after verification; none remain.
- Root cause (bugfix only): the existing manager had no real runners and failed to report queued runner outcomes as required; rename-prefix error handling maintained a third hard-coded list of IPC codes.

## Batch 6 — Scope D

### Decisions made
- D0: the manager now reports `completed` whenever a runner resolves; the cancel flag only decides a rejection (`cancelled` after a cancel request, otherwise `failed`). The rule is stated in a comment above `Runners`. No existing fake runner resolved on abort (the abort-driven fakes already rejected), so none needed changing; the real runners already reject on abort.
- D1: `opsHandlers` now builds all ten handlers and creates `deps.transfers ?? new TransferManager({ maxActive: deps.maxActiveTransfers })` once per call. `transfersUpload` and `transfersDownload` check `deps.dialog` first (before the store lookup and before opening any dialog), per the "before any dialog or store work" sentence, then do the store lookup and `clients.get`. `transfersUploadPaths` does the store lookup first. `register` normalizes NOT_FOUND to the message "Request failed" (same as the existing ops tests), so IPC clients see that text.
- `transfersCancel` does not do the store lookup: its request schema (contract 2) is `{ transferId }` only, so there is no connection id. Ownership by the calling sender is the check.
- Shared `startUploads` verifies each path (absolute, `stat().isFile()`, any error counts as rejected), starts uploads in order with key `prefix + basename(path)`, and returns `{ transferIds, rejectedCount }`. The picker returns only `transferIds`.
- D2: `register` registers all ten channels and accepts the widened deps (`transfers` added so tests can inject fake runners). `src/main/index.ts` only imports `dialog` and passes it. The real Electron `dialog` is assignable to `DialogLike` with no cast and no change to the option types (`pnpm typecheck` exit 0).
- `throwMappedError` is not used in the transfer handlers: they make no S3 call themselves, and transfer-time failures surface as `transferDone` `failed`.

### Spec deviations
- none

### Tradeoffs accepted
- The maxActiveTransfers test drives the real manager with a stub client whose `GetObjectCommand` blocks until aborted, because the option is only used when no `transfers` dep is injected.

### Assumptions
- A symlink to a regular file counts as a regular file (`stat` follows links).

### Follow-ups for human
- Scope E (integration tests, `helpers.ts` changes) remains. No commit was made.

### Test evidence
- RED (D0): `pnpm exec vitest run test/unit/transfers.test.ts` with the new test `reports the truthful status when a runner resolves after cancel` -> 1 failed, 15 passed. Assertion: expected `{ status: 'completed' }`, received `status: 'cancelled'`. The reject-after-cancel case already passed (`cancelled`).
- GREEN (D0): same command after the fix -> 16 tests passed.
- RED (D3): `pnpm exec vitest run test/unit/ipc-ops.test.ts` with the 12 new transfer tests before the handlers existed -> 12 failed, 3 passed. Failures were assertion failures on the unregistered-channel response, for example `expected false to be true` for `handlers.has(...)`, `expected { ok: false, ... } to deeply equal { ok: true, data: { transferIds: [] } }`, and `expected [] to deeply equal [ { defaultPath: 'report.txt' } ]`. Four tests then hit a TypeError reading `transferIds` or `transferId` from the missing `data`, downstream of the failed response.
- First GREEN run after implementing: 14 of 15 passed. The one failure was my wrong expectation of the NOT_FOUND message ("Connection not found"); `register` returns "Request failed". I corrected the test, not the handler.
- GREEN (final), run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` -> exit 0
  - `pnpm test` -> exit 0; 11 files, 129 tests passed (115 before, plus 1 in transfers and 12 in ipc-ops)
  - `pnpm test:integration` -> exit 0; 4 files, 6 tests passed
  - `pnpm build` -> exit 0
- D4 checks:
  - Unique `require(...)` specifiers in `out/preload/index.cjs` (`grep -o 'require("[^"]*")' out/preload/index.cjs | sort -u`): `require("electron")` only.
  - `timeout 10 xvfb-run -a pnpm exec electron .` -> exit 124 (ran until the timeout). Output was only the unrelated line `ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:249] '--ozone-platform=wayland' is not compatible with Vulkan...`.
  - `out/` is gitignored (`git check-ignore out` prints `out`), so it was kept. `git status --short` shows no `out/`, `*.tsbuildinfo`, or `test/.tmp` entries and no stray files.
- Root cause (bugfix only, D0): `pump` passed `entry.cancelled ? "cancelled" : "completed"` for a resolved runner, so a transfer that finished its work after a late cancel was reported as cancelled.

## Batch 7 — Scope E

### Decisions made
- Added `waitFor(predicate, timeoutMs)` with async predicate support, 50 ms polling, and a timeout message that names the requested deadline. `setupHarness` accepts optional `dialog` and `clients` overrides, and cleanup removes its temporary store directory.
- Added RustFS operations coverage through `register` and the real store/vault/client factory: marker creation, 2,500-key three-batch deletion, prefix count/delete, special-character single renames, conflict and same-key errors, 51-key nested folder rename, exact copy/delete partial-failure reports, and validated progress events.
- Added transfer coverage through `register`: multipart 20 MiB round trip with SHA-256 equality, event-driven cancellation of a gated 50 MiB upload and delayed 50 MiB download, zero-byte upload, path rejection counts, and sender-destroy cleanup. The wrapper delays every matching part by at least 150 ms, permits the first two part requests, and releases held requests after cancel/destroy. Progress assertions require initial zero, monotonic values, and no value beyond the file size; they intentionally do not require a final-size event.

### Spec deviations
- none. Scope E made no production-code changes.

### Tradeoffs accepted
- The pinned `Upload` implementation calls `client.send` without per-request options for multipart commands. The gated upload therefore releases held part requests after the cancel/destroy action rather than depending on a request abort signal; this follows the required test release seam and ensures no promise remains held.
- Existing production behavior had already been implemented in earlier scopes, so direct integration assertions were not represented as production RED tests. Targeted wrapper/helper mutations were used where they were cheap and meaningful.

### Assumptions
- The integration harness's `s3-integ-harness-*` directories and the transfer suite's `s3-transfer-integration-*` directories are test-owned temporary data and may be removed after verification.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED (helper contract mutation): `pnpm exec vitest run --project integration test/integration/ops.test.ts -t 'clear timeout message'` with the helper temporarily returning `waitFor timeout after 1 ms` -> 1 failed; assertion expected `waitFor timed out after 1 ms` and received the mutated message. The mutation was restored.
  - GREEN: `pnpm exec vitest run --project integration test/integration/ops.test.ts` -> 1 file, 10 tests passed.
  - RED (copy wrapper mutation): `pnpm exec vitest run --project integration test/integration/ops.test.ts -t 'prefix copy fails'` with the injected copy rejection temporarily disabled -> 1 failed; expected completed `[partial-copy/a.txt]`, received all three sources as completed. Restoring the injected rejection made the full integration suite pass.
  - RED (delete wrapper mutation): `pnpm exec vitest run --project integration test/integration/ops.test.ts -t 'copied-but-not-deleted'` with the injected delete rejection temporarily disabled -> 1 failed; expected only the first source completed, received all three. Restoring the injected rejection made the full integration suite pass.
  - RED (test synchronization, not production): the first `pnpm exec vitest run --project integration test/integration/transfers.test.ts` run failed the gated-part count and asserted destruction before its first progress event. A subsequent run timed out because the wrapper compared a shared concurrent counter, holding all part calls. The wrapper now captures each part number, waits for the first positive progress event, and releases held calls after cancel/destroy.
  - GREEN: `pnpm exec vitest run --project integration test/integration/transfers.test.ts -t 'cancels a gated 50 MiB|destroys the sender'` -> 2 tests passed; final `pnpm exec vitest run --project integration test/integration/transfers.test.ts` -> 1 file, 5 tests passed.
  - GREEN: `pnpm typecheck` -> exit 0.
  - GREEN: `pnpm test` -> exit 0; 11 files, 129 tests passed.
  - GREEN (initial complete suite): `pnpm test:integration` -> exit 0; 6 files, 21 tests passed.
  - GREEN (stability run 1): `pnpm test:integration` -> exit 0; 6 files, 21 tests passed.
  - GREEN (stability run 2): `pnpm test:integration` -> exit 0; 6 files, 21 tests passed.
  - GREEN (stability run 3): `pnpm test:integration` -> exit 0; 6 files, 21 tests passed.
  - GREEN: `pnpm build` -> exit 0; main, preload, and renderer bundles built.
- E4 checks:
  - `grep -o 'require("[^"]*")' out/preload/index.cjs | sort -u` -> only `require("electron")`.
  - `docker ps -a --filter name=rustfs --format '{{.Names}} {{.Status}}'` -> no RustFS containers after the suite.
  - `find /tmp -maxdepth 1 -type d \( -name 's3-integ-harness-*' -o -name 's3-transfer-integration-*' \) -print` -> no remaining test temp directories. Removed 28 stale harness directories from earlier runs before the final check; current harness cleanup removes its own directory.
  - `git status --porcelain --untracked-files=all` -> no build output, `*.tsbuildinfo`, `test/.tmp`, or stray temp files listed. The ignored `out/` remains per prior scope instruction (`git check-ignore out` prints `out`); root TypeScript build-info files were removed.
  - `git diff --check -- test/integration/helpers.ts test/integration/ops.test.ts test/integration/transfers.test.ts` -> exit 0.
- Root cause (bugfix only): none. The initial transfer test failures were caused by test wrapper key/counter/timing mistakes; no production defect was found.

## Fix 1

### Decisions made
- F1 maps the runner error first, then replaces the entry's own local path(s) with `[local file]` in the mapped message, longest path first using `split`/`join`. The mapped code and other message text are retained.
- F2 returns a fresh UUID before registering anything when the sender is already destroyed. F3 routes a synchronous runner throw through the same asynchronous failure completion path as a rejection.
- F4 makes `Entry` a `kind`-discriminated union and takes a correlated `EntryInput` in `start`; both runner casts are removed.
- F7 leaves de-duplication only in `batchKeys`; delete progress totals are derived from those batches. Removed the unused `mapS3Error` re-export after checking imports. Replaced all three `ipcErrorForResponse` uses with `errorSchema` and removed the alias.
- F10 confirmed the pinned `Upload` sends exactly one `PutObjectCommand` for both a 7-byte file and a zero-byte file through the stub. The stub records every command and the test checks `Bucket`, `Key`, `ContentLength`, and defined `Body`.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- The two coordinator-owned paths already present before this batch (`docs/plans/s3-media-explorer/.handover.md` and `docs/plans/s3-media-explorer/phase-04/fix-1.md`) are left untouched; they are not implementation changes.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED (F1): `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'redacts .* path|redacts download destination'` -> exit 1; both tests failed at the expected `[local file]` assertion. The unchanged code exposed the real upload `stat` ENOENT path and download `.part` write-stream ENOENT path in `transferDone.error.message`.
  - RED (F2): `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'sender already destroyed'` -> exit 1; the upload runner had been called once although the sender was already destroyed.
  - RED (F3): `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'catches synchronous runner throws'` -> exit 1; `startUpload` threw `Error: sync failure` as asserted by the regression.
  - GREEN (F1-F3): `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'redacts .* path|redacts download destination|sender already destroyed|catches synchronous runner throws'` -> exit 0; 1 file, 4 passed, 16 skipped.
  - F4/F7 were behavior-preserving refactors; existing tests were the safety net, not a claimed RED. `pnpm exec vitest run --project unit test/unit/ops-plan.test.ts` -> exit 0; 1 file, 29 passed. Full typecheck and unit tests also passed.
  - F10 characterization: `pnpm exec vitest run --project unit test/unit/transfers.test.ts -t 'uploads regular and zero-byte files'` -> exit 0; 1 passed, confirming one `PutObjectCommand` per file.
  - F10 mutation: temporarily changed the upload runner's `Key` to `wrong-key`, then ran the same focused command -> exit 1; expected `Key: "small"`, received `Key: "wrong-key"`. Restored `Key: input.key`; final full unit suite passed.
- Verification checks from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` -> exit 0.
  - `pnpm test` -> exit 0; 11 files, 133 tests passed (129 baseline + 4 regression tests).
  - `pnpm test:integration` -> exit 0; 6 files, 21 tests passed. The suite started and stopped its RustFS container.
  - `pnpm build` -> exit 0; main, preload, and renderer bundles built.
  - `git diff --check` on the changed implementation/test files -> exit 0 after removing a trailing blank line from `ops.ts`.
  - `git status --porcelain --untracked-files=all` includes only the four allowed implementation/test files, the two phase-04 records, and the two coordinator-owned paths listed above. The coordinator-owned entries were present before implementation and remain untouched. `out/`, `*.tsbuildinfo`, and `test/.tmp` are not listed in Git status.
- Root cause (bugfix only): F1 exposed native fs errors containing picker/save-dialog paths; F2 registered already-destroyed senders; F3 invoked runner code without catching synchronous throws. The RED tests reproduced each root cause against the unchanged implementation.
