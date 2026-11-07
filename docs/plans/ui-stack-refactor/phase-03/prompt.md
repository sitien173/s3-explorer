# Phase 3: Forms on React Hook Form and Zod

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: Six dialog forms validate through Zod 4 schemas via `react-hook-form` 7.91.0 and `@hookform/resolvers` 7.0.3, and show field errors through `ui/field.tsx`. Labels, accessible names, reset-on-close, pending-submit guards, and the connection test-result behavior are unchanged.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-03/base`
- Prior State: Phases 1 and 2 are done. Biome lints via `biome.jsonc`. The `components/ui` wrappers use `@base-ui/react` 1.9.0. Checks at base: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test --maxWorkers=2` 31 files, 752 passed; `pnpm build` 0; e2e 1 passed. Plain `pnpm test` times out under load, so always pass `--maxWorkers=2`. `test/unit/transfers.test.ts` "unique part file" is a known load flake; if it alone fails, re-run once.
- Code Context:
  - `zod` 4.6.7 is already installed. Add `react-hook-form@7.91.0` and `@hookform/resolvers@7.0.3` with `pnpm add -E`. If pnpm adds `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml`, keep them and say so in notes.
  - Verify with ctx7 before coding: `npx ctx7@latest library "React Hook Form" "<question>"` and the resolvers package, to confirm the `zodResolver` import path and Zod 4 support in `@hookform/resolvers` 7.0.3, `useForm` `reset`, `formState.isSubmitting`, and `setError`. If ctx7 lacks the answer, read the type declarations in `node_modules`.
  - In-scope forms: `src/renderer/src/components/{ConnectionDialog,RenameDialog,OpenUrlDialog,AddBucketDialog,CreateBucketDialog}.tsx` and the new folder dialog inside `src/renderer/src/App.tsx`.
  - `src/shared/ipc.ts` exports `createBucketName`, `createRequest`, `updateRequest`, and `schemas` (per-channel request schemas). Field limits such as `name` max 128, `objectKey` 1 to 1024, `prefix` max 1024 are local constants there. Reuse exported schemas by importing them or deriving from `schemas[...]` shapes. Where a limit is not exported, mirror it in `src/renderer/src/forms.ts` and add a unit test that checks the mirrored schema accepts and rejects the same boundary values as the IPC schema. Never edit `src/shared/ipc.ts`.
  - `ui/field.tsx` already exists for field layout and errors.
  - e2e locates fields with `getByLabel("... (required)")`.

## Invariants & Boundaries
- Preserve: label text and accessible names exactly; reset-on-close; pending-submit guards (double submit blocked); connection test-result behavior; `DeleteBucketDialog` stays a plain controlled input; IPC channels, schemas, preload API, CSP, and `webPreferences` unchanged.
- Out of Scope: any dependency other than the two pins above; styling changes; TanStack Query, Zustand, or other `App.tsx` refactors beyond the new folder dialog; any file under `docs/` except your phase records; `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (modify: via pnpm only)
- `src/renderer/src/forms.ts` (create: renderer-only schemas)
- `src/renderer/src/components/{ConnectionDialog,RenameDialog,OpenUrlDialog,AddBucketDialog,CreateBucketDialog}.tsx` (modify)
- `src/renderer/src/App.tsx` (modify: the new folder dialog only)
- `src/renderer/src/components/ui/field.tsx` (modify: only if needed to accept RHF error props)
- `test/unit/renderer-dialogs.test.tsx`, other `test/unit/renderer-*.test.tsx` that cover these forms, and `test/unit/forms.test.ts` (create or modify)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-03/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-03/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, `src/shared/**`, `src/main/**`, `src/preload/**`, or secrets.

## Tasks
- task-1: Write failing tests first (RED) for each in-scope form: the validation message shown for invalid input, and that submit does not call the IPC API (`window.api` mock) while invalid. Record RED and GREEN commands in notes.
- task-2: Migrate `ConnectionDialog` to `useForm` with `zodResolver`, then the five single-field forms. Keep reset-on-close (call `reset` when the dialog closes or opens) and block double submit with `formState.isSubmitting` or the existing pending flag.
- task-3: Remove the `useState` field values and field errors orphaned by the migration. Remove imports orphaned by your changes.

## Done When
- No in-scope dialog keeps `useState` for field values or field errors.
- Invalid input shows the field error and does not call the IPC API.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 752 passed; now more)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-03/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-03/journal.md`, then return that block and the matching status line from `erp.md`.
