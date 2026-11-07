# Phase 1: Biome and regression baseline

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: Biome 2.6.6 formats and lints the repository and `pnpm lint` exits 0. Two characterization tests pin focus return and table virtualization for later phases. No runtime behavior changes.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-01/base`
- Prior State: Plan base `a7971eb`. Baseline at base: `pnpm typecheck` exit 0; `pnpm test --maxWorkers=2` 31 files, 737 tests passed; `pnpm build` exit 0; `xvfb-run -a pnpm e2e` 1 passed. Plain `pnpm test` times out under machine load, so always pass `--maxWorkers=2`.
- Code Context:
  - No Biome, Prettier, or ESLint config exists. `src/**` uses tab indentation and double quotes. Some config files such as `electron.vite.config.ts` use 2 spaces and single quotes; the formatter normalizes them.
  - CSS lives in `src/renderer/src/styles/` and uses Tailwind v4 directives (`@import "tailwindcss"`, `@theme`, `@layer`, `@apply`, `@custom-variant` if present). Verify with `npx ctx7@latest docs /biomejs/biome "css parser tailwindDirectives option"` how Biome 2.6 parses Tailwind directives. Enable the parser option if it exists. If Biome still cannot parse a CSS file, exclude `src/renderer/src/styles/**` from Biome in `biome.json` and record that in notes. Phase 5 rewrites those files.
  - Dialog focus return today is handled by module-level `focusin` trackers in `src/renderer/src/components/ui/dialog.tsx` and `ui/alert-dialog.tsx`. Rename can be opened from a row context-menu item in `src/renderer/src/components/ObjectTable.tsx`.
  - Existing virtualization coverage in `test/unit/renderer-object-table.test.tsx` checks only one viewport height.

## Invariants & Boundaries
- Preserve: all runtime behavior. The `CSP` constant in `src/main/window.ts` must stay character-equal to the meta CSP in `src/renderer/index.html`; formatting may move the string across lines only if `test/unit/window.test.ts` still passes. `webPreferences` unchanged.
- Out of Scope: any dependency other than `@biomejs/biome` pinned exactly `2.6.6`; any file under `docs/`; `src/shared/ipc.ts`, `src/shared/channels.ts`, and `src/preload/index.ts` beyond formatting; `~/.aws`, `.env*`, and any credential or connection store.

## Files
Allowed production and test paths:
- `biome.json` (create: formatter, linter, and ignore config)
- `package.json` (modify: add `@biomejs/biome` devDependency 2.6.6 and the `lint` and `format` scripts)
- `pnpm-lock.yaml` (modify: via `pnpm add -D -E @biomejs/biome@2.6.6` only)
- `src/**/*.{ts,tsx,css}`, `test/**/*.{ts,tsx}`, `e2e/**/*.ts`, `scripts/**/*.ts`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` (modify: formatter output and behavior-free lint fixes only)
- `test/unit/renderer-dialogs.test.tsx` (modify: add the focus-return characterization test)
- `test/unit/renderer-object-table.test.tsx` (modify: add the two-viewport virtualization test)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-01/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-01/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, other dependencies, or secrets.

## Tasks
This phase runs as two jobs so the Coordinator can checkpoint the format-only diff alone.

**Job A: Tasks 1 and 2 only. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2.**
- task-1: Install `@biomejs/biome@2.6.6` exactly. Create `biome.json` with `$schema` for 2.6.6, `formatter.indentStyle: "tab"`, `formatter.lineWidth: 120`, `javascript.formatter.quoteStyle: "double"`, VCS integration off, and `files.includes` that excludes `out`, `dist`, `build`, `node_modules`, `test-results`, `docs`, `*.tsbuildinfo`, and `pnpm-lock.yaml`. Set `linter.enabled: false` for now. Add scripts `"lint": "biome check ."` and `"format": "biome format --write ."`.
- task-2: Run `pnpm format`. Confirm `git diff --ignore-all-space --stat` shows only quote, comma, semicolon, parenthesis, and wrapping changes, with no token change. Run the Done When checks.

**Job B: Tasks 3 and 4, sent later as "Continue Phase 01".**
- task-3: Set `linter.enabled: true` with `rules.recommended: true`. Run `pnpm lint`. Fix violations only where the fix provably preserves behavior. Otherwise turn the rule off in `biome.json` with a one-line `//` reason per rule; Biome accepts `biome.json` comments only if the file is renamed `biome.jsonc`, so if you need comments, use `biome.jsonc` and say so in notes. Never use inline suppression comments in more than 5 places; prefer config-level decisions.
- task-4: Add characterization tests:
  1. In `renderer-dialogs.test.tsx`: open the row context menu, choose Rename, close the dialog with Escape, and assert `document.activeElement` is the grid (`role="grid"`) or the row that opened it.
  2. In `renderer-object-table.test.tsx`: with 10,000 objects, assert at most 40 row elements at viewport heights 400 px and 1200 px.

  If an assertion fails against current behavior, keep the test, mark it `test.fails(...)`, and add a comment `// Phase 2 fixes: <reason>`. Record the observed behavior in notes.

## Done When
- `pnpm lint` exits 0 after Job B; in Job A, `npx biome format .` reports no changes needed.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 31 files, 737 passed; after Job B, 739 or more)
  - `pnpm build` (Baseline: exit 0)
  - `pnpm lint` (after Job B: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-01/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-01/journal.md`, then return that block and the matching status line from `erp.md`.
