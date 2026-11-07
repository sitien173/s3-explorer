# Phase 9: Documentation and debt

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome:
  - `README.md` and `docs/manual-checklist.md` describe the new stack, scripts, keyboard shortcuts, themes, window chrome, Quick Look, grid view, and command palette.
  - The code debt owned by Phase 9 in `.handover.md` is resolved.
  - Debt that needs a human or a macOS host becomes manual checklist items.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-09/base`
- Prior State:
  - Phases 1 to 8 are done.
  - Checks at base:
    | Check | Baseline |
    |---|---|
    | `pnpm typecheck` | exit 0 |
    | `pnpm lint` | exit 0, with 1 known info about the deprecated `recommended` field in `biome.jsonc` |
    | `pnpm test --maxWorkers=2` | 40 files, 986 passed |
    | `pnpm build` | exit 0 |
    | e2e | 1 passed |
    | integration | 29 of 29 |
  - Always pass `--maxWorkers=2`. Two tests are known load flakes; if only one of them fails, re-run once:
    - `test/unit/transfers.test.ts` "unique part file".
    - An unhandled Sonner-timer error from `renderer-toasts-dom.test.tsx`.
    - Job B fixes both.
- Source of truth for shortcuts:
  - `src/renderer/src/selection.ts`, `keyboardAction`.
  - `src/renderer/src/useBrowserSelection.ts`, where the grid moves by columns.
  - `src/renderer/src/components/CommandPalette.tsx`, Ctrl or Cmd+K.
  - `src/renderer/src/components/QuickLook.tsx`, where Space and the arrows apply.
  - Every README shortcut must match the code. Read the code; do not trust the current README.

## Invariants & Boundaries
- Job A is documentation only: `README.md` and `docs/manual-checklist.md`. No source change.
- Job B is the Phase 9 debt batch. It is a Coordinator-authorized addition to PLAN.md Phase 9, which says "No source change". Record this deviation in notes.
  - Every change is behavior-preserving or test-only, except where an item below says otherwise.
  - No IPC, CSP, `webPreferences`, preload, or shared change.
  - No new dependencies.
- No claim in the README may lack a matching implementation.
- Out of Scope:
  - `src/preload/**` and `src/shared/**`, including the `createRequest` Invalid URL issue, which is a follow-up outside the plan.
  - New features.
  - Any file under `docs/plans/` except your phase records.
  - `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
- Job A: `README.md`, `docs/manual-checklist.md`
- Job B, only the files the debt items name, plus their tests:
  - `biome.jsonc`
  - `src/main/s3/ops.ts`
  - `src/main/s3/client.ts`
  - `src/main/connections/secrets.ts`
  - `src/renderer/src/platform.ts`
  - `src/renderer/src/components/ui/{alert,spinner,sonner,sheet}.tsx` and the components that use the shared class constants
  - `test/unit/{transfers,renderer-toasts-dom,client,renderer-shell}.test.ts(x)`
- Phase records: `docs/plans/ui-stack-refactor/phase-09/{notes,journal}.md`

## Tasks
**Job A: Tasks 1 and 2. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2.**
- task-1: Update `README.md`.
  - Describe the stack: electron-vite, React 19, TypeScript, Tailwind v4 with CSS-first tokens in `globals.css`, Base UI wrappers, React Hook Form with Zod 4, TanStack Query, Zustand, and Biome. Read the exact versions from `package.json`.
  - List the scripts as they appear in `package.json`, such as `lint`, `format`, `test`, `test:integration`, and `e2e`, and note that `--maxWorkers=2` is recommended on loaded machines.
  - Rewrite Keyboard Shortcuts so it matches the code exactly:
    - list and grid navigation;
    - Space for Quick Look;
    - the arrows inside Quick Look;
    - Enter or open;
    - parent folder;
    - select all;
    - the command palette;
    - anything else the code binds.
  - Describe:
    - light and dark mode following the system, with no in-app toggle;
    - the hidden title bar, with the overlay on Linux and Windows and the traffic lights on macOS;
    - the list and grid toggle and its persistence;
    - the thumbnail budget in one sentence.
  - Update Context Menus if it changed.
  - Keep the Security section accurate.
- task-2: Update `docs/manual-checklist.md`, keeping its format, and add these items:
  - Title bar overlay on X11 and on Wayland: controls clickable, drag works, and the overlay color follows a theme switch.
  - macOS traffic lights centered in the 44 px toolbar. If they are not, set `trafficLightPosition`. This is unverified, because there was no darwin host.
  - Switching between light and dark while the app runs. Visually check selected rows, dialogs, the sidebar, the toolbar, Quick Look, and the grid in both themes.
  - Quick Look playback of video and audio. Space closes Quick Look even when the video is focused; this was a deliberate Finder-parity decision, so sign it off.
  - Grid thumbnails on a large prefix of 1,000 or more objects: smooth scrolling, no request storm, and icons for files that are not images or are over 5 MiB.
  - The command palette: Ctrl or Cmd+K, bucket switching, actions, and focus return.
  - The search status box overlays the first table rows and cannot be dismissed until the next search. Accept it, or file a follow-up.
  - In the New folder and Rename dialogs, validation messages now appear under the field instead of in the top banner, while server errors still use the banner. Sign off on this.

**Job B: Task 3, sent later as "Continue Phase 09".** Resolve each item, with tests where behavior is touched.
- 3a. `biome.jsonc`: replace the deprecated `linter.rules.recommended` with the current form. Verify it with `npx ctx7@latest` for Biome 2.6 or `npx biome migrate`. `pnpm lint` must show no info.
- 3b. `src/main/s3/ops.ts`: annotate the 5 `let`s that trigger `noImplicitAnyLet`, then remove that rule's disable or override and its wrong reason.
- 3c. Remove the unused private members `src/main/s3/client.ts:36` `private store` and `src/main/connections/secrets.ts:22` `private readonly directory`, if they truly are unused. Turn on `noUnusedPrivateClassMembers`, if it is off, and make lint pass. Constructor signatures stay compatible with the call sites.
- 3d. `test/unit/client.test.ts:46-47`: replace `(await endpoint?.()).hostname` with an explicit `expect(endpoint).toBeDefined()` followed by a non-optional call. Re-enable the rule if one was disabled for this.
- 3e. `platform.ts`: remove `setIsMacForTesting`, and make `isMac` a `const`. Tests stub `navigator.userAgent` instead, with `vi.stubGlobal` or `vi.spyOn` plus `vi.resetModules` and a dynamic import. Keep the renderer-shell tests green.
- 3f. Fix the `transfers.test.ts` "unique part file" load flake. Find the root cause, such as a timing assumption or a shared temp path, and fix the test, not production code, unless production has a real race. Explain it in notes.
- 3g. Fix the `renderer-toasts-dom.test.tsx` unhandled Sonner timer after jsdom teardown. Use fake timers, dismiss the toasts, or `cleanup` with an `act` flush in `afterEach`.
- 3h. Export shared banner and spinner class constants, or small components, from `ui/alert.tsx` and `ui/spinner.tsx`, and replace the duplicated class strings: about 20 banner sites and 6 spinner sites. No visual change.
- 3i. In `ui/sonner.tsx`, check whether the `group-[.toaster]` classes take effect against Sonner's unlayered styles. Verify with ctx7 for the installed sonner version. Either make the theming effective through Sonner's `toastOptions.classNames` or CSS variables using globals.css tokens, or remove the dead classes. No color literals.
- 3j. `ui/sheet.tsx`: add a short code comment that opener focus capture relies on the controlled `open` prop.

## Done When
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0, 1 info; after Job B, 0 info)
  - `pnpm test --maxWorkers=2` (Baseline: 986 passed)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs e2e and integration. Do not run e2e.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary:
- You are the phase implementer, not the Coordinator.
- Edit code only in `/home/ngosi/projects/s3-explorer`.
- Write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-09/`.
- Do not run Git commits, resets, stashes, branch changes, or ref updates.
- Do not invoke Coordinator skills or submit nested jobs.
- Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if it is unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-09/journal.md`, then return that block and the matching status line from `erp.md`.
