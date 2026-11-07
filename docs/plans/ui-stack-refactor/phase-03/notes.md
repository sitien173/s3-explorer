<!-- refract-shared-version: 2.5.0 -->

# Phase 3 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-03/notes.md, fill the
heading, then append one `## Task 1

### Decisions made
- Extracted the new folder dialog from `App.tsx` into an exported `NewFolderDialog` (old `useState` logic kept) so a DOM test can reach it without rendering `App`. Props: `isOpen, connectionId, bucket, parent, onClose, onCreated(name)`. `App` keeps the refresh and `notify.folderCreated` in `onCreated`.
- Added an inert `src/renderer/src/forms.ts` (schemas that accept any string) so the tests fail on assertions, not on imports.
- RED tests read field errors with `findByRole("alert")`, the role `ui/field.tsx` `FieldError` renders, plus the exact messages of the previous validation.
- `test/unit/forms.test.ts` compares each mirrored schema with the IPC schema on boundary values, through `buildCreateRequest`, `buildUpdateRequest` and `schemas[...]`.
- Coordinator approved (via `refract ask`) adding `"src/renderer/src/forms.ts"` to `tsconfig.node.json` `include`, next to `format.ts`. Without it `pnpm typecheck` fails with TS6307 on `forms.test.ts`. `forms.ts` therefore imports nothing DOM-only.

### Spec deviations
- `tsconfig.node.json` edited, outside the declared file list, with Coordinator approval (see Decisions).
- OpenUrl: the submit button is disabled while the URL is blank, so the only reachable field error there is the length limit (8192). The test uses a 8193 character paste.

### Tradeoffs accepted
- none

### Assumptions
- Message text of the previous validation is kept. Messages for limits that were previously only enforced in main are new: name 128, profile format and 128, profile-kind region 128, endpoint http or https URL, URL 8192, folder name 255, target key 1024.

### Follow-ups for human
- Finding, not fixed (`src/shared` is read-only): `createRequest` throws `TypeError: Invalid URL` instead of returning a Zod issue for an `endpoint` that is not a URL, because `endpoint` chains `.url().refine(new URL(...))` and the refine still runs. The form now rejects such input before IPC. The IPC schema itself is unchanged.
- Finding: for `kind: "manual"` the IPC `region` is `min(1)` with no max, because the manual branch overrides `common.region`. The mirrored schema applies the 128 limit only to the profile kind.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/forms.test.ts test/unit/renderer-dialogs.test.tsx` -> `Tests 59 failed | 72 passed (131)`. Dialog failures: `TestingLibraryElementError: Unable to find role="alert"` (8 tests: Connection, Rename, OpenUrl, AddBucket, CreateBucket, NewFolder). Schema failures: `AssertionError: expected true to be false`, `expected undefined to be 'Connection name is required.'`, `expected { url: '  s3://b/k ', ... } to deeply equal { url: 's3://b/k', ... }`.
  - GREEN (schemas): `pnpm test --maxWorkers=2 test/unit/forms.test.ts` -> `Tests 84 passed (84)`. Dialog GREEN is under Task 2.

## Task 2

### Decisions made
- `ConnectionDialog`: `useForm<ConnectionFormState>` with `zodResolver(connectionFormSchema(isEdit))`. One `reset(defaultValues)` effect runs on open, on close and when `initialConnection` changes. The kind toggle calls `setValue("kind")` and `watch("kind")` drives the conditional fields. The default profile after `listProfiles` uses `getValues` and `setValue`. `profiles`, `testResult` and `testing` stay in `useState`: they are server data and test-result state, not field values or errors.
- Single-field forms (`RenameDialog`, `OpenUrlDialog`, `AddBucketDialog`, `CreateBucketDialog`, `NewFolderDialog`): `useForm<{ field }, unknown, { field }>`. The resolver output is the trimmed value, and for Rename it is the final destination key (trailing slash added for a folder).
- Field errors render through `FieldError`. `FieldError` gained an optional `error` prop (`{ message?: string }`) and renders nothing when there is no content. Markup changed from `span` to `div role="alert"`, the same class.
- Banner errors from the API (Connection, Rename, OpenUrl, NewFolder) use `setError("root.server")` and render in the existing banner. Rename, OpenUrl and NewFolder clear it on input change through the `register` `onChange`. AddBucket and CreateBucket show the API error as a field error, which RHF clears on the next change.
- Pending guard: `formState.isSubmitting` disables buttons and inputs and blocks close, replacing `saving`, `submitting` and `busy`. `CreateBucketDialog` keeps `busyRef`, since its test sends a double click and the ref blocks the second call before a re-render.
- `OpenUrlDialog`: `userOverrodeConn` is a ref, the signing connection is the form field `connectionId`.
- Reset-on-close: Connection, AddBucket, CreateBucket and NewFolder call `reset` when `isOpen` is false. Rename resets on open with its item. OpenUrl resets on the closed-to-open edge.

### Spec deviations
- none

### Tradeoffs accepted
- Validation errors in Rename and NewFolder now show under the field, not in the top banner.
- Validation errors appear after a submit click. Native `required` on Rename, OpenUrl and NewFolder inputs is unchanged.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: see Task 1.
  - GREEN: `pnpm test --maxWorkers=2 test/unit/forms.test.ts test/unit/renderer-dialogs.test.tsx test/unit/renderer-shell.test.tsx` -> `Test Files 3 passed (3)`, `Tests 150 passed (150)`.

## Task 3

### Decisions made
- Removed the field and field-error `useState` calls, the `validate` function, the `BUCKET_NAME_REGEX` constant in `AddBucketDialog`, the `createBucketName` import in `CreateBucketDialog`, `ChangeEvent` and `FormEvent` imports, and the New folder state and handlers in `App.tsx`. `pnpm lint` reported one unused `clearErrors` in `ConnectionDialog`, also removed.
- Remaining `useState` in scope: `RenameDialog.progress`, `ConnectionDialog.profiles`, `testResult`, `testing`. None is a field value or field error.
- Test lint infos in `forms.test.ts` fixed with template literals.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- `pnpm add -E` did not touch `pnpm-workspace.yaml`, so no `minimumReleaseAgeExclude` entries were added.

### Follow-ups for human
- `pnpm lint` still prints one info (the Biome `recommended` deprecation in `biome.jsonc`). It exited 0 and predates this phase.

### Test evidence
- RED -> GREEN:
  - RED: see Task 1.
  - GREEN: `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm build` exit 0; `pnpm test --maxWorkers=2` -> `Test Files 32 passed (32)`, `Tests 849 passed (849)` (baseline 752). The first full run had one `transfers.test.ts` "unique part file" failure (known load flake); the re-run passed. e2e not run, per instructions.

## Task FIX-1

### Decisions made
- Finding 1: `forms.ts` keeps its message-bearing checks and then pipes into the IPC field schema. Rename pipes into `schemas[channels.opsRename].shape.toKey` for objects and `schemas[channels.opsRenamePrefix].shape.toPrefix` for folders (the folder case is the matching IPC field). OpenUrl pipes into `schemas[channels.streamOpenUrl].shape.url`. NewFolder pipes into `schemas[channels.opsCreateFolder].shape.name`. `BUCKET_NAME_REGEX` removed.
- Add bucket reuses `schemas[channels.bucketsAdd].shape.bucket` through `safeParse` inside a `refine`, not `.pipe`, so every IPC failure keeps the single previous "Invalid bucket name..." message. A `.pipe` would surface the IPC schema's default regex message instead.
- Finding 3: `FieldError` is now an arrow const.

### Spec deviations
- Add bucket uses `refine` plus `safeParse` instead of `.pipe` (see Decisions).

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Connection limits are still mirrored, since `src/shared/ipc.ts` exports no per-field connection schemas other than `createRequest`.

### Test evidence
- RED -> GREEN:
  - RED: n/a, refactor and test additions; parity tests in `forms.test.ts` kept passing as characterization.
  - GREEN: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm build` 0; `pnpm test --maxWorkers=2` -> 32 files, 852 passed (849 plus 3 double-submit tests). First run hit the known `transfers.test.ts` flake; re-run passed.
