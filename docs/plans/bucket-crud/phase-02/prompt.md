# Phase 2: Sidebar create and delete UI

## Goal & Outcome
- Plan Goal: Users can create a real S3 bucket and delete an empty S3 bucket from the sidebar.
- Phase Outcome: The sidebar has a "New bucket" button and a "Delete bucket" context-menu item. Both call the Phase 1 IPC channels, refresh the bucket list on success, and show fixed error messages. Deleting the open bucket returns the main view to the no-bucket state.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/bucket-crud/phase-02/base`
- Prior State: Phase 1 is complete. `api.buckets.create({ connectionId, bucket })` and `api.buckets.delete({ connectionId, bucket })` exist in `src/shared/ipc.ts` and `src/preload/index.ts`. Both return `Result<{ bucket: string; warning?: string }>`. Error codes: `BUCKET_EXISTS` with message "Bucket name is taken", `BUCKET_NOT_EMPTY` with message "Bucket is not empty", `INVALID_REQUEST` with "Invalid bucket name", `ACCESS_DENIED` with "Access denied", `REQUEST_FAILED` with "Request failed". These messages are fixed and safe to show.
- Code Context:
  - `src/shared/ipc.ts` exports the zod schema `createBucketName` with the AWS general purpose naming rules. Import it as a value from `../../../shared/ipc` in `CreateBucketDialog.tsx` and validate with `createBucketName.safeParse(name)`. `src/shared/ipc.ts` imports only `zod` and `./channels`, so it bundles in the renderer. Confirm with `pnpm build`.
  - `src/renderer/src/components/AddBucketDialog.tsx` is the pattern for `CreateBucketDialog`: `Dialog` from `./ui/dialog`, inline field error, submit disabled while busy.
  - `src/renderer/src/components/ui/alert-dialog.tsx` provides `AlertDialog` for `DeleteBucketDialog`.
  - `src/renderer/src/components/Sidebar.tsx` renders each connection's bucket header, the "Add bucket by name" action near line 325, and the bucket `ContextMenu` items "Open" and "Pin"/"Unpin" near line 389.
  - `src/renderer/src/toasts.ts:97` `buildOperationFailedToast` maps operation names through an allowlist.
  - `src/renderer/src/App.tsx:310` `handleSelectConnection` shows how App clears `selectedBucket`, `selectedPrefix`, `selectedItem`, `searchResults`, `isSearchActive`, and `viewerTarget`.
  - Design detail: `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/DESIGN.md` sections "Architecture and Data Flow" renderer part, "Errors and Edge Cases", and "Testing" renderer part.

## Invariants & Boundaries
- Preserve: `AddBucketDialog.tsx` byte for byte. Radix focus trap and focus restore to the trigger. Existing keyboard shortcuts. Existing toasts and their allowlist entries. Renderer stays sandboxed and only calls `api.*`.
- Out of Scope: any file under `src/main`, `src/shared`, or `src/preload`. Bucket update, rename, or emptying. Blocking activity in a bucket being deleted. New dependencies.
- Do not read `.env` files, AWS config or credential files, or secret stores.

## Files
Allowed production and test paths:
- `src/renderer/src/components/CreateBucketDialog.tsx` (create: name field, createBucketName validation, duplicate-name block, calls api.buckets.create)
- `src/renderer/src/components/DeleteBucketDialog.tsx` (create: AlertDialog with typed exact-name confirmation, calls api.buckets.delete)
- `src/renderer/src/components/Sidebar.tsx` (modify: "New bucket" button, "Delete bucket" menu item, refresh, warning toast, deleted-bucket callback)
- `src/renderer/src/App.tsx` (modify: clear state when the deleted bucket is selected)
- `src/renderer/src/toasts.ts` (modify: add "Create bucket" and "Delete bucket" to the allowlist)
- `test/unit/renderer-dialogs.test.tsx` (modify: dialog tests)
- `test/unit/renderer-shell.test.tsx` (modify: sidebar and App state tests)
- `README.md` (modify: sidebar bucket items line)
- `docs/manual-checklist.md` (modify: manual AWS checks)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-02/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-02/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, `package.json`, the lockfile, or secrets.

## Tasks
- task-1: Dialogs, tests first in `test/unit/renderer-dialogs.test.tsx`.
  - `CreateBucketDialog` props: `open`, `onOpenChange`, `connectionId`, `existingNames: string[]`, `onCreated(bucket: string, warning?: string)`. Trim input. Show the first zod issue message inline on invalid names. Block a name already in `existingNames` with "A bucket with this name is already listed". On `ok: false`, show `error.message` inline and keep the dialog open. Disable submit while a request runs so a double submit sends one request.
  - `DeleteBucketDialog` props: `open`, `onOpenChange`, `connectionName`, `connectionId`, `bucket`, `onDeleted(bucket: string, warning?: string)`. Capture the connection and bucket when the dialog opens so later prop changes do not change the target. Show both names. The destructive confirm button is enabled only when the typed value equals the bucket name exactly and no request runs. On `ok: false`, show `error.message` inline, for example "Bucket is not empty", and keep the dialog open.
  - Tests: invalid name blocked without an api call; duplicate name blocked; success calls onCreated; double submit sends one request; delete confirm disabled until exact match, including a case-only mismatch; BUCKET_NOT_EMPTY shows "Bucket is not empty" and onDeleted is not called; the target stays fixed when props change while open.
- task-2: Sidebar, tests in `test/unit/renderer-shell.test.tsx` or the existing sidebar test location in that file.
  - Add a "New bucket" button in the selected connection's bucket header. It shows even when the bucket list is empty or listing failed with access denied.
  - Add "Delete bucket" to the bucket `ContextMenu`.
  - After success, refresh the bucket list. When the response has `warning`, show a warning toast with that text. A created bucket must appear in the sidebar without a manual refresh.
  - Add a Sidebar prop `onBucketDeleted(connectionId: string, bucket: string)` and call it after a successful delete.
  - Add "Create bucket" and "Delete bucket" to the `buildOperationFailedToast` allowlist. Use `buildOperationFailedToast` only for unexpected thrown errors; `ok: false` results stay inline in the dialog.
- task-3: App state. Pass `onBucketDeleted` from App. When `connectionId` and `bucket` match the current selection, clear `selectedBucket`, `selectedPrefix`, `selectedItem`, `searchResults`, `isSearchActive`, and `viewerTarget` while keeping the connection selected. Otherwise change nothing. Test both cases in `renderer-shell.test.tsx`.
- task-4: Docs. In `README.md`, update the "Sidebar bucket items" line to list "Delete bucket" and mention the "New bucket" button. In `docs/manual-checklist.md`, add manual AWS checks for create outside `us-east-1`, recreating an owned bucket in `us-east-1`, and deleting a non-empty bucket.

## Done When
- "New bucket" creates a bucket that appears in the sidebar without a manual refresh.
- The "Delete bucket" confirm button stays disabled until the typed name matches exactly.
- Deleting the open bucket returns the main view to the no-bucket state.
- A `BUCKET_NOT_EMPTY` failure shows "Bucket is not empty" and leaves the bucket in the list.
- `git diff --stat refs/plans/bucket-crud/phase-02/base -- src/main src/shared src/preload src/renderer/src/components/AddBucketDialog.tsx` prints nothing.
- Run from `/home/ngosi/projects/s3-explorer`, one after another:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 31 files, 719 passed; expect more after new tests, all passing)
  - `pnpm build` (Baseline: exit 0)
  - `xvfb-run -a pnpm e2e` (Baseline: 1 passed)
- Do not wrap vitest in `rtk`.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/bucket-crud/phase-02/journal.md`, then return that block and the matching status line from `erp.md`.
