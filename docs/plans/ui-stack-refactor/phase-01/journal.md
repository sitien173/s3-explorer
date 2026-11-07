<!-- refract-shared-version: 2.5.0 -->

# Phase 1 — Journal: Biome and regression baseline

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-01/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-stack-refactor/PLAN.md
- Implementation Profile: balanced
- Consultation Profile: openai, anthropic (design consults 10b8a02f, 8b3fc7ac)
- Review Profile: balanced
- Implementation Job: <Refract job ID or n/a>
- Review Job: <Refract job ID or n/a>
- Started: 2026-11-07T06:32:15+00:00
- Finished: 2026-11-07T13:49:00+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 1 (Job A, Tasks 1 and 2) / Started: 2026-11-07T06:32:15+00:00 / Finished: 2026-11-07T13:42:13+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Installed Biome 2.6.6, added `biome.json` and `lint`/`format` scripts, and formatted the repository with a verified token-equivalent diff.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| create | biome.json | formatter config, ignore list, Tailwind CSS parsing, linter disabled |
| modify | package.json | `@biomejs/biome` 2.6.6 devDependency, `lint` and `format` scripts |
| modify | pnpm-lock.yaml | via `pnpm add -D -E` |
| modify | pnpm-workspace.yaml | pnpm added `minimumReleaseAgeExclude` entries for `@biomejs/*@2.6.6` (outside declared set, see notes) |
| modify | src/**/*.{ts,tsx,css}, test/**/*.{ts,tsx}, e2e/*.ts, scripts/seek-2gb.ts, electron.vite.config.ts, vitest.config.ts | formatter output only |
| modify | test/unit/selection.test.ts | formatter output plus `@ts-ignore` moved above `} from` line |
| modify | docs/plans/ui-stack-refactor/phase-01/notes.md | Task 1 and Task 2 blocks |
| modify | docs/plans/ui-stack-refactor/phase-01/journal.md | this response |
## NOTES
- phase-01/notes.md  (## Task 1, ## Task 2). Fresh: `npx biome format .` no changes; typecheck exit 0; build exit 0; tests 31 files, 737 passed.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT  - Tasks 1 and 2 pass; `pnpm-workspace.yaml` change is outside the declared set and needs a Coordinator decision.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

# EXTERNAL RESPONSE
## META
- Phase: 1 (Job B, Tasks 3 and 4) / Started: 2026-11-07T13:33:00+07:00 / Finished: 2026-11-07T13:49:00+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Enabled Biome recommended linting with `pnpm lint` at exit 0 and added two characterization tests, both marked `it.fails` for Phase 2.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| rename | biome.json to biome.jsonc | Linter enabled with recommended rules, organizeImports off, 23 rules off with reasons |
| modify | e2e/fixtures.ts | one `biome-ignore` for `noEmptyPattern` |
| modify | test/unit/ipc-connections.test.ts | one `biome-ignore` for `noConstantCondition` |
| modify | 39 files under src/ and test/ | behavior-preserving lint fixes: type imports, unused imports, optional chains, template literals, `_` renames |
| modify | test/unit/renderer-dialogs.test.tsx | focus-return characterization test (`it.fails`) |
| modify | test/unit/renderer-object-table.test.tsx | 400 px test and 1200 px test (`it.fails`) |
| modify | docs/plans/ui-stack-refactor/phase-01/notes.md | Job B, Task 3 and Task 4 blocks |
| modify | docs/plans/ui-stack-refactor/phase-01/journal.md | this response |
## NOTES
- phase-01/notes.md (## Job B, ## Task 3, ## Task 4). Fresh results:
  - `pnpm lint`: exit 0.
  - `pnpm typecheck`: exit 0.
  - `pnpm build`: exit 0.
  - `pnpm test --maxWorkers=2`: 31 files, 738 passed, 2 expected fail (740).
  - e2e not run.
- Observed: after Escape the focus is on `BODY`, not the grid or row. At 1200 px the table mounts 41 `role="row"` elements, one over the 40 cap.
- Two Biome unsafe fixes broke things and were corrected: `@ts-expect-error` rewrite (TS2578) and a removed `// @vitest-environment jsdom` pragma (19 test failures).
- `files.includes` still lists `"biome.json"`, so `biome.jsonc` is not itself linted. Coordinator may want to update that entry.
- No flagged rule was confirmed as a real bug. Two unused private class members and one throwing test pattern are listed under Follow-ups.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT - All Done When checks pass. Debt: 23 rules disabled, `biome.jsonc` not self-linted, and the 14 `useExhaustiveDependencies` sites were not individually reviewed.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

# EXTERNAL RESPONSE
## META
- Phase: 1 (FIX batch 1) / Started: 2026-11-07T13:52:00+07:00 / Finished: 2026-11-07T13:58:00+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Replaced the flat 40 row cap with the DESIGN.md invariant 5 viewport bound plus a listing-size independence check, and made `biome.jsonc` lint itself.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| modify | test/unit/renderer-object-table.test.tsx | viewport-bound tests at 400 px and 1200 px, 10,000 vs 1,000 object equality, `it.fails` removed |
| modify | biome.jsonc | `files.includes` entry `"biome.json"` replaced with `"biome.jsonc"` |
| modify | docs/plans/ui-stack-refactor/phase-01/notes.md | FIX batch 1 blocks |
| modify | docs/plans/ui-stack-refactor/phase-01/journal.md | this response |
## NOTES
- phase-01/notes.md (## FIX batch 1, ## Task FIX-1, ## Task FIX-2). Fresh results:
  - `pnpm lint`: exit 0.
  - `pnpm typecheck`: exit 0.
  - `pnpm test --maxWorkers=2`: 31 files, 739 passed, 1 expected fail (740).
  - e2e not run.
- `ROW_HEIGHT` and `OVERSCAN` are not exported, so the test uses literals 40 and 10. Bounds: 31 rows at 400 px, 51 rows at 1200 px.
- The focus-return `it.fails` test is unchanged.
## SPEC COMPLIANCE
- Meets Spec? YES - Both findings addressed and all checks pass with the one expected fail remaining.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

Job a3f14e28 (balanced, cc/claude-opus-medium), retry of f0173b07, which returned no findings and was ruled unusable.

# CODE QUALITY REVIEW
- **Status: PASS_WITH_DEBT.** Nothing is blocking. The format and lint passes change no behavior, the CSP and `webPreferences` are intact, and both characterization tests assert what they claim. The debt is mostly in the reasons given for disabled rules in `biome.jsonc`.

- **Findings:**
  1. **non-blocking, `biome.jsonc:31`.** The reason given for `suspicious/noImplicitAnyLet` was copied from `noNonNullAssertion` ("replacing \"!\" with guards"). It does not describe this rule. The 5 real hits are in `src/main/s3/ops.ts`, at lines 41, 73, 101, 176 and 228. Fix: annotate those `let`s with explicit types. Annotations do not change runtime behavior, so the disable can then be removed. Otherwise, write an accurate reason.
  2. **non-blocking, `biome.jsonc:59-67`.** Eight a11y rules share one comment, and that comment only explains `useButtonType`. The plan asks for one reason per rule, and the other seven have none: `useSemanticElements`, `useFocusableInteractive`, `noSvgWithoutTitle`, `useMediaCaption`, `noLabelWithoutControl`, `useKeyWithClickEvents` and `noStaticElementInteractions`. Fix: give each rule its own one-line reason.
  3. **non-blocking, `test/unit/renderer-dialogs.test.tsx:395`.** The new `it.fails` test ran in 4.87 s against the 5 s default timeout. Under `it.fails`, a timeout also counts as a pass, so the timing risk is hidden until Phase 2 removes `.fails`. Fix: add `{ timeout: 15000 }`, matching the existing test in `renderer-object-table.test.tsx`.
  4. **non-blocking, `test/unit/renderer-dialogs.test.tsx:426-427`.** The test overrides `HTMLElement.prototype.clientHeight` and `clientWidth` and never restores them. Later tests in this file run with the patched values. The object-table file resets them in `beforeEach`; this file does not. Fix: restore the originals in `afterEach` or in a `try/finally`.
  5. **non-blocking, `test/unit/renderer-object-table.test.tsx:120-128`.** The two viewport tests never check that 400 px and 1200 px produce different row counts. I confirmed that `@tanstack/virtual-core` 3.19.10 reads `clientHeight` in `getRect`, so the mock does take effect today. Fix: add an assertion that the 1200 px count is greater than the 400 px count. Then a future change in how the viewport is measured cannot leave both tests passing without testing anything.
  6. **non-blocking, plan deviation.** The plan names `biome.json`, but the file is `biome.jsonc`. This is needed because the per-rule comments are not valid in plain JSON. Fix: update PLAN.md so it matches.

- **Verified, no defect found:**
  - **Lint-fix commit 7c6cd01, compared with 92dcd08:**
    - Each optional-chain rewrite is equivalent to the code it replaced. This covers `register.ts:134`, `App.tsx:118` and `urlChoice.ts:69`.
    - `Math.pow` was replaced with `**`; the result is identical.
    - The template literals produce the same strings.
    - Each newly type-only import is used only as a type. `SecretVault` is still imported as a value in `src/main/index.ts:2`, so the module's side effects still run.
    - The unused imports `TransferManager` and `fireEvent` were removed safely.
    - Each `_` rename is on a variable that is assigned but never read. `expectModalKeyboardBehavior` was already unused at the base ref.
    - `jsx: "react-jsx"` makes `import type * as React` safe in `ui/*.tsx`.
  - **CSP:** the `CSP` array in `src/main/window.ts` is unchanged and joins to exactly the meta CSP string in `src/renderer/index.html`; I checked this programmatically. `index.html` has no diff, and `webPreferences` at `window.ts:134-139` is unchanged.
  - **Pragmas:** no `// @vitest-environment` pragma and no `@ts-*` directive was lost. The per-file counts match the base ref, except that `ipc-connections.test.ts` gains one extra match. That match is only the new `biome-ignore` comment, which mentions `@ts-expect-error` in its text.
  - **Disables claimed as test-only:** `noUnsafeOptionalChaining`, `useIterableCallbackReturn` and `noTsIgnore` hit test files only. `noArrayIndexKey` hits only the skeleton list at `ObjectTable.tsx:536`. No disable hides a defect introduced in this phase.
  - **Dialogs test:** I ran it as a plain `it` from an isolated copy in /tmp, without touching the repo. It fails at the final assertion `active === grid || active === row` after the dialog has closed, so the expected failure is the real focus-return gap. A comment names Phase 2.
  - **Object-table test:** the bound `ceil(h/40) + 2*10 + 1` matches `ROW_HEIGHT` and `OVERSCAN` in `ObjectTable.tsx:39-40`. The independence check compares 10,000 objects against 1,000, so the test is not tautological.
  - **Dependencies:** `@biomejs/biome` is pinned exactly at 2.6.6, and it is the only new dependency. The `pnpm-workspace.yaml` changes are the accepted `minimumReleaseAgeExclude` entries plus quote-style changes.

- **Scope checked:** `biome.jsonc`, `package.json`, `pnpm-workspace.yaml`, the `src/**` lint delta, `src/main/window.ts`, `src/renderer/index.html`, `e2e/fixtures.ts`, the `test/integration/*` and `test/unit/*` lint delta, `test/unit/renderer-dialogs.test.tsx` and `test/unit/renderer-object-table.test.tsx`. In the format-only commit 92dcd08, I read the `window.ts` diff in full and checked pragma counts across all files.

I did not re-run the Coordinator's full typecheck, lint, test, build and e2e suite. I ran only the targeted biome lint queries and the isolated probe of the dialogs test.

## Review Result

- Spec Status: PASS. The Coordinator checked the work against prompt.md after FIX 0b3689d2 and the invariant 5 amendment c2056ec.
- Quality Status: PASS_WITH_DEBT (job a3f14e28)
- Debt:
  - Q3 and Q4: the dialogs focus test needs `{ timeout: 15000 }`, and its clientHeight/clientWidth overrides must be restored. Owner: Phase 2, which removes `.fails`.
  - Q5: the object-table tests should assert that the 1200 px row count is greater than the 400 px count. Owner: Phase 8, which adds grid count tests.
  - Q2: each a11y rule disabled in `biome.jsonc` needs its own reason, or should be re-enabled. Owner: Phase 5.
  - Q1: `noImplicitAnyLet` has a wrong reason; annotate the 5 `let`s in `src/main/s3/ops.ts`, then remove the disable. Owner: Phase 9.
  - Q6: resolved. PLAN.md now names `biome.jsonc`.

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-01/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-01/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.
