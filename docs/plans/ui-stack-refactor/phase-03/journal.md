<!-- refract-shared-version: 2.5.0 -->

# Phase 3 — Journal: Forms on React Hook Form and Zod

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-03/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-stack-refactor/PLAN.md
- Implementation Profile: balanced
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: 5063f6b7, FIX 66431f2b
- Review Job: e1b9d669
- Started: 2026-11-07T15:44:14+07:00
- Finished: 2026-11-07

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 3 (Forms on React Hook Form and Zod) / Started: 2026-11-07T15:44:14+07:00 / Finished: 2026-11-07 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
All six dialog forms now validate through Zod 4 schemas in `forms.ts` via `react-hook-form` 7.91.0 and `@hookform/resolvers` 7.0.3, with field errors shown through `ui/field.tsx`.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| modify | package.json | add `react-hook-form` 7.91.0 and `@hookform/resolvers` 7.0.3 (exact pins) |
| modify | pnpm-lock.yaml | lockfile for the two packages |
| modify | tsconfig.node.json | include `src/renderer/src/forms.ts` (Coordinator approved) |
| create | src/renderer/src/forms.ts | renderer-side Zod schemas for the six forms |
| modify | src/renderer/src/components/ConnectionDialog.tsx | `useForm` and `zodResolver`, field state removed |
| modify | src/renderer/src/components/RenameDialog.tsx | `useForm` and `zodResolver`, field state removed |
| modify | src/renderer/src/components/OpenUrlDialog.tsx | `useForm` and `zodResolver`, field state removed |
| modify | src/renderer/src/components/AddBucketDialog.tsx | `useForm` and `zodResolver`, field state removed |
| modify | src/renderer/src/components/CreateBucketDialog.tsx | `useForm` and `zodResolver`, field state removed |
| modify | src/renderer/src/components/ui/field.tsx | `FieldError` accepts an `error` prop |
| modify | src/renderer/src/App.tsx | new folder dialog extracted to exported `NewFolderDialog` on `useForm` |
| create | test/unit/forms.test.ts | boundary tests of each schema against the IPC schemas |
| modify | test/unit/renderer-dialogs.test.tsx | validation, no-IPC-while-invalid, double submit and reset tests for all six forms |
| modify | docs/plans/ui-stack-refactor/phase-03/notes.md | Task 1 to 3 blocks |
| modify | docs/plans/ui-stack-refactor/phase-03/journal.md | this response |
## NOTES
- phase-03/notes.md  (## Task 1, ## Task 2, ## Task 3)
- Fresh checks: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm build` 0; `pnpm test --maxWorkers=2` 32 files, 849 passed (baseline 752). One `transfers.test.ts` load flake on the first run, passed on re-run. e2e not run.
- `pnpm-workspace.yaml` unchanged. IPC schema finding recorded in Task 1 follow-ups.
## SPEC COMPLIANCE
- Meets Spec? YES  - no in-scope dialog keeps `useState` for field values or errors, invalid input shows the field error without an IPC call, and all four checks pass.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE


# EXTERNAL RESPONSE
## META
- Phase: 3 FIX-1 / Started: 2026-11-07 / Finished: 2026-11-07 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Form schemas now pipe into the IPC field schemas, three double-submit tests were added, and `FieldError` is an arrow const.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| modify | src/renderer/src/forms.ts | pipe into IPC field schemas, `BUCKET_NAME_REGEX` removed |
| modify | src/renderer/src/components/ui/field.tsx | `FieldError` as arrow const |
| modify | test/unit/renderer-dialogs.test.tsx | double-submit tests for Connection, AddBucket, OpenUrl |
| modify | docs/plans/ui-stack-refactor/phase-03/notes.md | Task FIX-1 |
| modify | docs/plans/ui-stack-refactor/phase-03/journal.md | this response |
## NOTES
- phase-03/notes.md  (## Task FIX-1)
- Fresh checks: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm build` 0; `pnpm test --maxWorkers=2` 32 files, 852 passed (one known flake on first run, passed on re-run). e2e not run.
## SPEC COMPLIANCE
- Meets Spec? YES  - all three findings fixed; add bucket uses `refine` with `safeParse` on the IPC schema to keep its message (noted).
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

Job e1b9d669 (balanced, cc/claude-opus-medium), retry of e7ae3dc3 (transient), on checkpoint 48172a2.

# CODE QUALITY REVIEW

**Status: PASS_WITH_DEBT**

I found no blocking defects. Four non-blocking items are listed below.

## Findings

1. **Non-blocking. The spec asked to reuse exported schemas where possible, and only one is reused.** `src/renderer/src/forms.ts:9` copies the bucket name regex, and `forms.ts:62-105` copies the limits for object key 1024, URL 8192 and folder name 255. The IPC versions of these are reachable today through `schemas[channels.bucketsAdd].shape.bucket`, `schemas[channels.opsRename].shape.toKey`, `schemas[channels.streamOpenUrl].shape.url` and `schemas[channels.opsCreateFolder].shape.name`. Only `createBucketName` is reused, at `forms.ts:96`. The parity tests in `test/unit/forms.test.ts` stop the copies from drifting, so this is debt and not a defect.
   **Fix:** keep the message-bearing checks and add `.pipe(schemas[...].shape.<field>)` at the end of each schema as a backstop. Then remove `BUCKET_NAME_REGEX` from `forms.ts`.

2. **Non-blocking. Some double-submit guards have no test.** All six forms disable submit through `formState.isSubmitting`. I checked the RHF 7.91.0 source at `node_modules/react-hook-form/dist/index.esm.mjs:3419`: `handleSubmit` sets `isSubmitting: true` before the first `await`, so React flushes the disabled state at the end of the click event. That matches the base, where `setSaving(true)` ran in the same place. Only CreateBucket, Rename and NewFolder have "sends once" tests. Connection, AddBucket and OpenUrl have none.
   **Fix:** in `test/unit/renderer-dialogs.test.tsx`, add a pending-promise test for those three. Click submit twice and assert the API mock was called once.

3. **Non-blocking. The extracted `NewFolderDialog` changes one visible behavior.** Validation messages now show under the field through `FieldError`, at `src/renderer/src/App.tsx:149`. In the base they showed in the top banner. API errors still use the banner, through `root.server`. Labels, the button disabled rule `!name.trim()`, the close guard, the `onClose`-then-refresh-then-`notify.folderCreated` order and `notify.operationFailed` are all unchanged. The worker logged the banner change as an accepted tradeoff, and the Rename dialog has the same change.
   **Fix:** none needed. A human reviewer should confirm the tradeoff.

4. **Non-blocking, minor style point.** `FieldError` at `src/renderer/src/components/ui/field.tsx:12` is now a `function` declaration. Its siblings in that file are arrow `const`s. The markup moved from `span` to `div role="alert"`, but the layout is unaffected because `.tds-field-validation` sets `display: inline-flex` at `src/renderer/src/styles/tds/field-validation.css:3`.
   **Fix:** optional. Write it as `export const FieldError = (...) => ...` to match the file.

## Verified

- **Scope:** HEAD is `48172a2`. The only uncommitted change is the coordinator's `docs/.../.handover.md`. The diff touches only allowed files plus the approved `tsconfig.node.json` include. Both packages are pinned exactly: `react-hook-form` 7.91.0 and `@hookform/resolvers` 7.0.3.
- **Item 1, schema limits:** These match `src/shared/ipc.ts`: name 1 to 128 on create and update, profile 1 to 128 plus the regex on create only, the profile-kind region max 128, no max on the manual region, endpoint http or https, `createBucketName`, rename 1 to 1024 with the trailing-slash rules, URL 1 to 8192, and folder name 1 to 255 rejecting `/`, `.` and `..`. Trimming happens before the checks, the same way `buildCreateRequest` and `buildUpdateRequest` trim. The parity tests run each case through the real IPC schemas.
- **Item 2, double submit:** All forms disable submit while `isSubmitting` is true. Rename, NewFolder and OpenUrl also block close while submitting. CreateBucket keeps `busyRef`. Connection and AddBucket submit from an `onClick` button outside any `<form>`, so pressing Enter cannot submit them.
- **Item 3, reset on close and reopen:** Connection, AddBucket, CreateBucket and NewFolder call `reset` when closed. Connection also resets on open with `initialConnection` values. Rename resets on open to `item.prefix` or `item.key`, which is the prefill. OpenUrl resets on the closed-to-open edge with the default connection. `reset` also clears `isSubmitting`, errors and `isSubmitted`.
- **Item 4, labels:** Every label string and `htmlFor` binding is byte-identical to the base, including all the "... (required)" labels and the Secret Access Key label that changes in edit mode. `register` adds only a `name` attribute.
- **Item 5, ConnectionDialog:** `testResult` and `testing` stay in `useState`. `handleTestConnection` is unchanged. Test results still reset on open and close. The extra `setTesting(false)` on open is harmless. Profile loading keeps the old `prev.profile || data[0].name` behavior through `getValues` and `setValue`. When the text input is swapped for the select, RHF writes the stored value into the select through `updateValidAndValue`. With the default `shouldUnregister: false`, values persist across the kind toggle, as they did with the old `setForm`.
- **Server errors:** The `root.server` banner is cleared on resubmit because the resolver path replaces `_formState.errors` (`index.esm.mjs:3443`).
- **Item 7, RHF and resolver API:** The `zodResolver` import path `@hookform/resolvers/zod` resolves through the package `exports`. The `Zod4Type` overload returns `Resolver<z4.input, Context, z4.output>`, which matches the three-generic `useForm<In, unknown, Out>` calls. `useForm` reassigns `control._options` on every render, so the memoized and per-render resolvers stay current. `reset`, `setValue` and `getValues` are stable references, so the effect dependencies are safe.
- **Item 8, dead code:** `tsc --noUnusedLocals --noUnusedParameters -p tsconfig.web.json` reports nothing for the in-scope files. In scope, `useState` remains only for `profiles`, `testResult`, `testing` and Rename `progress`. None of these holds a field value or a field error.
- **Not re-run:** I relied on the coordinator's typecheck, lint, test, build and e2e results.

## Review Result

- Spec Status: PASS. The Coordinator checked the work against prompt.md: the remaining `useState` holds only non-field state (profiles, testResult, testing, rename progress). Labels are unchanged and e2e passes.
- Quality Status: PASS_WITH_DEBT (e1b9d669). Findings 1, 2 and 4 are fixed in FIX-1 (job 66431f2b). Coordinator validation after FIX-1: typecheck 0, lint 0, test 852/852, build 0, e2e 1 passed.
- Debt:
  - Finding 3: validation messages in the NewFolder and Rename dialogs now show under the field, not in the top banner. Server errors still use the banner. The Coordinator accepted this under the autonomous policy. Owner: human UX sign-off in the Phase 9 manual checklist.
  - Connection field limits stay mirrored in forms.ts, because src/shared/ipc.ts exports no per-field connection schemas. Parity tests guard them. Owner: none; accepted.
  - src/shared/ipc.ts `createRequest` throws `TypeError: Invalid URL` for a non-URL endpoint instead of returning a Zod issue. This is outside the plan, because IPC schemas are frozen. Owner: follow-up outside this plan.

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-03/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-03/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.
