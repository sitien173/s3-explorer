# Phase 4: Server state and shell store

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: `@tanstack/react-query` 5.107.1 owns all IPC request data. A `zustand` 5.1.0 shell store owns location, selection, viewer target, and dialog state. `App.tsx` renders only `QueryClientProvider`, the toaster, and `Shell`. Layout and look are unchanged.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-04/base`
- Prior State: Phases 1 to 3 are done. Biome lints via `biome.jsonc`. UI wrappers use `@base-ui/react` 1.9.0. Six dialog forms use React Hook Form and Zod through `src/renderer/src/forms.ts`; `NewFolderDialog` lives in `App.tsx`. Checks at base: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test --maxWorkers=2` 32 files, 852 passed; `pnpm build` 0; e2e 1 passed. Always pass `--maxWorkers=2`. `test/unit/transfers.test.ts` "unique part file" is a known load flake; if it alone fails, re-run once.
- Code Context:
  - `src/renderer/src/App.tsx` (about 930 lines) holds most state: location, selection, viewer target, dialog flags, refresh counters, and IPC calls.
  - `src/renderer/src/api.ts` is the only caller of `window.api`. Keep it that way; queries call `api.ts`.
  - `src/shared/ipc.ts` exports per-channel types, including `RequestByChannel` and `ResponseByChannel` (verify exact names). `src/shared/channels.ts` lists channels.
  - `src/renderer/src/toasts.ts` holds sanitized toast builders. Every error toast must go through them.
  - Search and transfer progress arrive as events. Keep them as event subscriptions, not queries.
  - Add deps with `pnpm add -E @tanstack/react-query@5.107.1 zustand@5.1.0`. If pnpm adds `minimumReleaseAgeExclude` entries to `pnpm-workspace.yaml`, keep them and say so in notes.
  - Verify with ctx7 before coding (`npx ctx7@latest library "TanStack Query" "<q>"`, then `docs`; same for Zustand): `queryOptions`, `infiniteQueryOptions`, `useInfiniteQuery` `getNextPageParam` and `initialPageParam`, `invalidateQueries` with a key prefix, `QueryClient` defaults; Zustand 5 `create` with TypeScript and `useShallow`. Fall back to `node_modules` type declarations if ctx7 lacks the answer.
  - Phase 1 disabled Biome rules `correctness/useExhaustiveDependencies` and `noComponentHookFactories` in `biome.jsonc`; this phase owns re-enabling them.

## Invariants & Boundaries
- Preserve: layout, look, accessible names, and roles used by `e2e/app.spec.ts` and unit tests; event-driven search and transfer progress; sanitized error toasts; focus behavior from Phase 2; form behavior from Phase 3. IPC channels, schemas, preload API, CSP, and `webPreferences` unchanged.
- Server data never enters the store. Query keys always include the connection id. Mutations invalidate targeted keys; refresh counters are removed. Stale responses after rapid navigation must never be shown (query keys by connection, bucket, and prefix give this; verify with a test).
- Out of Scope: any other dependency; styling; layout changes; `src/main/**`, `src/preload/**`, `src/shared/**`; any file under `docs/` except your phase records; `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (modify: via pnpm only)
- `biome.jsonc` (modify: Job B only, to re-enable the two rules above)
- `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx` (modify)
- `src/renderer/src/queries.ts`, `src/renderer/src/store.ts`, `src/renderer/src/Shell.tsx` (create)
- `src/renderer/src/components/*.tsx` (modify: to consume queries, mutations, and the store)
- `test/unit/renderer-queries.test.tsx`, `test/unit/renderer-store.test.ts` (create)
- `test/unit/renderer-*.test.tsx`, `test/unit/dom-setup.ts` (modify: providers and store reset in tests)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-04/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-04/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
This phase runs as two jobs so the Coordinator can checkpoint the new modules before components move.

**Job A: Tasks 1 and 2 only. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2. Do not change components or `App.tsx` in Job A.**
- task-1: Install the two pins. Write `src/renderer/src/queries.ts` with one typed `queryOptions` factory per read channel, using the `RequestByChannel` and `ResponseByChannel` types, plus a query key factory where every key starts with the connection id where the channel takes one. Make the object listing an infinite query keyed by connection, bucket, and prefix, using the existing continuation token. Add mutation helpers that return the exact keys each mutation must invalidate. Tests first in `test/unit/renderer-queries.test.tsx`, including key shape and targeted invalidation.
- task-2: Write `src/renderer/src/store.ts`: a Zustand store for location (connection, bucket, prefix), selection, viewer target, and dialog state, with a `reset` for tests. Transition tests first in `test/unit/renderer-store.test.ts`. No server data in the store.

**Job B: Task 3 and 4, sent later as "Continue Phase 04".**
- task-3: Move components to the queries, mutations, and store with targeted invalidation. Remove refresh counters. Move the shell JSX into `Shell.tsx` so `App.tsx` renders only `QueryClientProvider`, the toaster, and `Shell`. Add a test that rapid navigation never shows a stale listing. Add tests that creating a bucket, deleting objects, and renaming invalidate the affected list.
- task-4: Re-enable `useExhaustiveDependencies` and `noComponentHookFactories` in `biome.jsonc` and fix every violation in a behavior-preserving way. If a violation can only be fixed by a behavior change, keep a single-site `biome-ignore` with a reason; at most 5 such sites.

## Done When
- `App.tsx` renders only `QueryClientProvider`, toaster, and `Shell`.
- Creating a bucket, deleting objects, and renaming refresh the affected list through invalidation, covered by tests.
- No `refresh` counter state remains (`grep -rn "refresh" src/renderer/src` shows no counter state).
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 852 passed; now more)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-04/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-04/journal.md`, then return that block and the matching status line from `erp.md`.
