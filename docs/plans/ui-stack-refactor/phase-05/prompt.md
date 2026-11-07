# Phase 5: Apple-style theme with light and dark

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome: TDS styling is replaced by Apple-style semantic tokens in `globals.css` and Tailwind v4 utilities. No TDS file or `tds-` class remains. The UI follows the system light or dark theme. Layout is unchanged; this phase is visual only.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-05/base`
- Prior State: Phases 1 to 4 are done. UI wrappers in `src/renderer/src/components/ui` use `@base-ui/react` 1.9.0. Forms use React Hook Form and Zod (`forms.ts`). Server state is TanStack Query (`queries.ts`), shell state is Zustand (`store.ts`), the shell is `Shell.tsx`, `App.tsx` holds providers only. Checks at base: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test --maxWorkers=2` 36 files, 896 passed; `pnpm build` 0; e2e 1 passed. Always pass `--maxWorkers=2`. `test/unit/transfers.test.ts` "unique part file" is a known load flake; if it alone fails, re-run once.
- Design guidance: before styling, read these skill files and follow them: `/home/ngosi/.claude/skills/apple-design/SKILL.md`, `/home/ngosi/.claude/skills/emil-design-eng/SKILL.md`, `/home/ngosi/.claude/skills/animate/SKILL.md` (and any reference files they point to, as needed). Apple-style means: system UI font stack first (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`), with bundled Inter as the Linux fallback; restrained neutral surfaces; one accent color; hairline separators; 6 to 10 px radii; subtle shadows only on overlays; compact 13 px base text for a desktop app; clear focus rings.
- Code Context:
  - Styles: `src/renderer/src/styles/{globals.css,tokens.css,app.css}` and 22 files in `src/renderer/src/styles/tds/`. `globals.css` already uses Tailwind v4 `@theme` and `@theme inline`. Find where Inter is loaded and keep it bundled.
  - `src/renderer/src/components/ui/sonner.tsx` forces the light theme; remove that so toasts follow the system.
  - `test/unit/renderer-tokens.test.ts` tests the current TDS tokens; rewrite it.
  - `biome.jsonc` disables these rules from Phase 1: a11y `useButtonType`, `useSemanticElements`, `useFocusableInteractive`, `noSvgWithoutTitle`, `useMediaCaption`, `noLabelWithoutControl`, `useKeyWithClickEvents`, `noStaticElementInteractions`, and CSS `noDuplicateCustomProperties`, `noDescendingSpecificity`, `noImportantStyles`. This phase owns them.
  - Phases 6 to 8 later replace the docked viewer with a Quick Look overlay, add window chrome and a command palette, and add a grid view. Restyle `Viewer.tsx` only enough to drop TDS; do not polish it.

## Invariants & Boundaries
- Preserve: layout structure, DOM roles, accessible names, and labels used by `e2e/app.spec.ts` and unit tests; all behavior; Inter stays bundled as the Linux fallback.
- Light and dark switch through `prefers-color-scheme` with `color-scheme: light dark` set. No in-app toggle.
- Text and control contrast meets WCAG AA (4.5:1 body text, 3:1 large text and UI component boundaries and focus indicators) in both themes. Record the computed ratios for primary text, secondary text, accent on background, and focus ring in notes.
- Animations and transitions honor `prefers-reduced-motion: reduce`.
- No color literal (hex, rgb, hsl, oklch, named colors except `transparent` and `currentColor`) outside `globals.css`.
- Out of Scope: new dependencies (do not add `motion`); `src/main/**`, `src/preload/**`, `src/shared/**`; layout changes; any file under `docs/` except your phase records; `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- `src/renderer/src/styles/globals.css` (modify)
- `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/app.css`, `src/renderer/src/styles/tds/` (delete)
- `src/renderer/src/main.tsx` (modify: only CSS imports)
- `src/renderer/src/**/*.tsx` (modify: class names and styling only)
- `src/renderer/index.html` (modify: only a `<meta name="color-scheme">` if needed; the CSP meta must stay byte-identical)
- `biome.jsonc` (modify: Job B, a11y and CSS rules)
- `test/unit/renderer-tokens.test.ts` (rewrite), other `test/unit/renderer-*.test.tsx` (modify: only where tests assert TDS class names)
- `e2e/app.spec.ts` (modify: add computed-style checks only)

Worker-owned phase records:
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-05/notes.md` (append `## Task <M>` blocks)
- `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-05/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets.

## Tasks
This phase runs as two jobs.

**Job A: Tasks 1 and 2 only. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2.**
- task-1: Rewrite `test/unit/renderer-tokens.test.ts` first as a scanner over `src/renderer/src/**/*.{ts,tsx,css}` that forbids `tds-` classes and raw color literals outside `globals.css`, and asserts `globals.css` defines each semantic token for both light and dark. Confirm it is RED against the TDS sources, then mark the "no tds- classes" and "no TDS files" assertions as `it.fails` with a `// Job B fixes` comment so the suite stays green between jobs. Record RED evidence.
- task-2: Define light and dark semantic tokens in `globals.css` (`@theme` plus a `prefers-color-scheme: dark` override, `color-scheme: light dark`): background, surface, sidebar, elevated, separator, text primary/secondary/tertiary, accent, accent-foreground, destructive, focus ring, selection. Add a reduced-motion rule. Restyle every file in `src/renderer/src/components/ui/` with Tailwind utilities on those tokens, dropping `tds-` classes there. Remove the forced light theme from `ui/sonner.tsx`.

**Job B: Tasks 3 and 4, sent later as "Continue Phase 05".**
- task-3: Restyle feature components (`src/renderer/src/components/*.tsx`, `components/viewer/*.tsx`, `Shell.tsx`). Delete `tokens.css`, `app.css`, and `styles/tds/`. Flip the `it.fails` scanner assertions to plain `it`. Add an e2e computed-style check in `e2e/app.spec.ts`: with `page.emulateMedia({ colorScheme: "dark" })` the app background equals the dark background token, and with `light` the light token. Do not run e2e yourself; the Coordinator runs it.
- task-4: In `biome.jsonc`, re-enable each a11y rule and the CSS rules listed above, fixing violations. Any rule kept off must have its own one-line reason. Single-site `biome-ignore` at most 5 places, each with a reason.

## Done When
- `ls src/renderer/src/styles` lists only `globals.css`.
- `grep -rn "tds-" src/renderer` prints nothing.
- The scanner test passes without `it.fails`.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 896 passed)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Edit code only in `/home/ngosi/projects/s3-explorer`; write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-05/`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-05/journal.md`, then return that block and the matching status line from `erp.md`.
