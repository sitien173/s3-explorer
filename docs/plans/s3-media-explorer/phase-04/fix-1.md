# FIX 1: Phase 4 quality review, cycle 1 of 2

Project root: `/home/ngosi/projects/s3-explorer`. Plan folder: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer`. This fixes the findings of the independent quality review of Phase 4 (range `4f1efbc..659167a`). The Coordinator read the code and established each finding below. Read `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/phase-04/prompt.md` (Invariants and contracts 8 and 9) before you start. The tree is clean at `659167a`, apart from this file and the handover.

## Scope

Allowed paths: `src/main/s3/transfers.ts`, `src/main/s3/ops.ts` (finding F7 only), `src/shared/ipc.ts` (finding F7 only), `test/unit/transfers.test.ts`, `test/unit/ops-plan.test.ts` (only if F7 forces a change), and the phase-04 `notes.md` and `journal.md`. Do not touch any other path. In particular do not change `src/main/ipc/**`, `src/preload/**`, `test/integration/**`, or any behavior not named below. No `any` in production code. Never use a fixed sleep to wait for a result: use events, fake timers, or a polling helper with a deadline.

Style: the repo has no formatter. Use tabs, one statement per line, braces on control flow, and wrap new lines near 80 columns. Do not reformat lines you do not otherwise change.

Process: for F1, F2, and F3, write the test first and show a genuine RED (the test fails for the stated reason against the unchanged code) before you fix it. Record each RED and each GREEN honestly in `notes.md`. F4 and F7 are refactors with no behavior change: the existing tests are their safety net, so say so in `notes.md` instead of claiming a RED.

## Findings to fix

### F1 (blocking). A failed `transferDone` can carry the absolute local path to the renderer

`finish` in `src/main/s3/transfers.ts` builds the error with `mapS3Error(error)`. For any non-S3 error, `mapS3Error` returns `REQUEST_FAILED` with the raw text `${name}: ${message}`. Node fs errors put absolute paths in their message, for example `ENOENT: no such file or directory, open '/home/u/dl/x.mp4.part'`. Those paths come from the native picker or save dialog and never from the renderer, so the renderer must not learn them.

Required behavior: the `message` of the `error` in a failed `transferDone` never contains the entry's own local paths. For an upload that is `localPath`. For a download that is `destPath` and `destPath + ".part"`. After `mapS3Error`, replace every occurrence of each of those strings in `error.message` with `"[local file]"`, longest string first (`destPath + ".part"` before `destPath`), using `split` and `join` (no regular expression built from a path). Keep the error `code` that `mapS3Error` chose, and keep the rest of the message, so `ENOENT` and similar detail stays visible. Apply this only to the transfer failure path. Do not change `mapS3Error` itself, `browse.ts`, or any ops code.

Tests, through the real default runners and real fs errors, with temp directories under the OS temp dir that the test removes:
1. Upload: a `localPath` that does not exist (the runner's `stat` rejects with ENOENT). Assert `transferDone` has `status: "failed"`, `error.code` is `REQUEST_FAILED`, the message contains `ENOENT`, contains `[local file]`, and contains neither the `localPath` nor its parent directory string.
2. Download: a stub client whose `GetObjectCommand` returns a `Readable` body, with a `destPath` inside a directory that does not exist (the write stream rejects with ENOENT on the `.part` path). Assert the same: failed, `ENOENT`, `[local file]`, and neither the `destPath`, the `.part` path, nor the missing directory string.
3. Run `assertNoSecrets` from `test/unit/secret-scan.ts` over both events.
The RED for tests 1 and 2 is the leaked path in the unchanged code.

### F2. A sender that is already destroyed at registration is never cleaned up

`start()` in `TransferManager` calls `sender.once("destroyed", ...)` without checking `sender.isDestroyed()`. If the window closed while the save dialog was open, or during the loop of up to 500 `stat` calls in `transfersUploadPaths`, the event has already fired, so the transfer is never cancelled and runs to completion with nobody listening.

Required behavior: in `start()`, when `input.sender.isDestroyed()` is true at registration, register nothing: no entry, no `destroyed` listener, no event, no runner call. Still return a fresh `randomUUID()`, so the synchronous contract holds. Test: a fake sender with `destroyed: true`; `startUpload` and `startDownload` each return a non-empty string, the runner is never called, `size`, `activeCount`, and `queuedCount` are 0, the sender received no event, and the sender has registered no listener. RED: the unchanged code registers an entry.

### F3. A runner that throws synchronously leaks a slot and makes `startUpload` throw

In `pump`, the runner call has no `try` and `catch`. The `runners` option allows a non-async function. A synchronous throw escapes `startUpload` (contract 9 says it never throws for a transfer-time failure), leaves the entry in `entries`, leaves `active` incremented, and leaves the `destroyed` listener attached.

Required behavior: catch a synchronous throw from the runner call and treat it exactly like a rejected promise, so the entry finishes through the same path (`failed`, or `cancelled` when a cancel was requested), the slot is freed, the listener is removed, and the next queued transfer starts. `startUpload` and `startDownload` never throw. Test with a non-async runner that throws: it must not throw out of `startUpload`, a failed `transferDone` is sent exactly once, `size` and `activeCount` return to 0, the listener count returns to 0, and with `maxActive: 1` a second queued transfer still starts and completes. RED: the unchanged code throws out of `startUpload` and leaves `activeCount` at 1.

### F4. Make `Entry` a discriminated union so the casts go away

`Entry.input` is `UploadInput | DownloadInput` and `pump` casts it with `as UploadInput` and `as DownloadInput`. Change `Entry` to a discriminated union on `kind` (an upload variant with `input: UploadInput` and a download variant with `input: DownloadInput`, sharing the common fields), and type `start` so a kind and input mismatch does not compile. Remove both `as` casts. No behavior change and no new casts. F1's path lookup should read from the union without a cast.

### F7. Dead code and duplication

1. `deleteKeys` in `src/main/s3/ops.ts` removes duplicates with `[...new Set(keys)]` and then calls `batchKeys`, which removes duplicates again. Keep the dedupe in exactly one place. If the local `unique` is used elsewhere in the function (for a total, say), keep what is needed. The existing dedupe tests must stay green.
2. `export { mapS3Error };` at the bottom of `ops.ts` has no importer. Remove it if `pnpm typecheck` and the tests confirm nothing imports it. If something does, leave it and say so.
3. In `src/shared/ipc.ts`, `const ipcErrorForResponse = errorSchema;` is a pointless alias with three uses. Replace each use with `errorSchema` and delete the alias.

### F10. The upload runner unit test asserts too little

The test `uploads regular and zero-byte files through the stubbed client` in `test/unit/transfers.test.ts` stubs `send` as `async () => ({})` and asserts only `status: "completed"`. Make the stub record every command it receives. Assert that exactly one `PutObjectCommand` was sent for each file, with `Bucket` equal to `"bucket"`, `Key` equal to the key given, `ContentLength` equal to 7 for `"payload"` and 0 for the empty file, and a defined `Body`. Check first which command lib-storage `Upload` sends for a small file and a zero-byte file through this stub, and assert what it really sends. If a mutation of the runner (for example a wrong `Key` or `ContentLength`) would now fail the test, note one such mutation you ran and restored.

## Findings the Coordinator decided NOT to fix in this batch

Do not touch these: two concurrent downloads to one `destPath` share a `.part` file; the second code-keeping mapper in `renamePrefix`; the `file as File` cast in the preload; progress "reaches the file size" assertions (contract 8 does not guarantee the last progress event). They are recorded as debt.

## Verification Checks

Run from `/home/ngosi/projects/s3-explorer` and record the exact commands, exit codes, and counts in `notes.md`: `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (21 tests, 6 files, unchanged), and `pnpm build`. All must exit 0. The unit test count must rise from 129 by the tests you add. After the checks, confirm `git status --porcelain` lists only the allowed paths, and that `out/`, `*.tsbuildinfo`, and `test/.tmp` are not in it.

## Response

Append a `## Fix 1` section to `phase-04/notes.md` and a new `# EXTERNAL RESPONSE` block under `## Implementation Response` in `phase-04/journal.md`. Do not overwrite earlier sections. Follow `/home/ngosi/projects/refract/plugin/shared/erp.md`. Write `NEXT: TASK_COMPLETE` and `Meets Spec? YES` only if every item above is done and every check passes. Otherwise write `NEXT: CONTINUE_CONTEXT` and say exactly what remains. Do not run git commits, resets, stashes, branch changes, or ref writes.
