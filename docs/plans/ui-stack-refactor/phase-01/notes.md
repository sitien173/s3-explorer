<!-- refract-shared-version: 2.5.0 -->

# Phase 1 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/<slug>/phase-<NN>/notes.md, fill the
heading, then append one `## Job A

## Task 1

### Decisions made
- Added `css.parser.tailwindDirectives: true` to `biome.json` (documented Biome 2.6 option, verified with ctx7 `/biomejs/biome`). `src/renderer/src/styles/**` parses and formats, so no CSS exclusion was needed.
- `files.includes` lists the declared file-set globs first, then the required exclusions (`out`, `dist`, `build`, `node_modules`, `test-results`, `docs`, `*.tsbuildinfo`, `pnpm-lock.yaml`). Reason: a bare `**` also reformatted `package.json`, `components.json`, and `tsconfig*.json`, which are outside the declared set.
- `biome.json` itself is included so it stays formatter-clean.
- `package.json` edited to add the two scripts and the devDependency with 2-space indent preserved. `pnpm add` had rewritten the whole file with tab indent; that was reverted from HEAD and the three lines re-applied.

### Spec deviations
- `pnpm add -D -E @biomejs/biome@2.6.6` also wrote 11 `@biomejs/*@2.6.6` entries to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, which is outside the declared file set. Kept, because removing it may break `pnpm install` under the release-age policy. Coordinator decision needed.

### Tradeoffs accepted
- none

### Assumptions
- `package.json` `@biomejs/biome` entry is `2.6.6` without caret, as `-E` requires.

### Follow-ups for human
- Decide whether to keep the `pnpm-workspace.yaml` change (see deviation).

### Test evidence
- RED -> GREEN: not applicable (tooling setup, no behavior change).
  - `pnpm add -D -E @biomejs/biome@2.6.6` -> `+ @biomejs/biome 2.6.6`
  - `npx biome format .` before formatting -> `Found 148 errors` (config valid, CSS parsed)
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Ran `pnpm format` (`biome format --write .`): 148 of 151 files rewritten.
- Out-of-set files that the first run touched (`components.json`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `package.json`) were restored from `git show HEAD:<file>` and excluded via `files.includes`.
- Fixed one regression caused by wrapping: in `test/unit/selection.test.ts` the `// @ts-ignore` covered the one-line import. After wrapping, the error moved to the `} from` line (`TS6307`, typecheck exit 2). Moved the same comment directly above `} from "../../src/renderer/src/selection";`. Same comment text, no behavior change.

### Spec deviations
- `git diff --ignore-all-space --stat` still shows 138 files because wrapping and tab conversion alter lines. Token equivalence was instead checked with a TypeScript AST comparison (`/tmp/tokcheck/check.mjs`, outside the repo): HEAD vs working tree, ignoring parentheses, quote style, trailing commas, semicolons, whitespace-only JSX text, and `{" "}` vs literal space. Result: 113 changed ts/tsx files, 0 mismatches.
- CSS: whitespace-stripped comparison differs only in `src/renderer/src/styles/tokens.css`, where `rgba(0, 0, 0, 0.10)` became `0.1` (equal numeric value). Other CSS files are identical after stripping whitespace, quote style, and trailing semicolons.

### Tradeoffs accepted
- Biome converts `{" "}` at line end to a literal space in 6 JSX files. Rendered output is the same.

### Assumptions
- `src/main/window.ts` CSP string unchanged in value; `test/unit/window.test.ts` passes.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN: formatting task, characterization via existing suite.
  - RED (regression found mid-task): `pnpm typecheck` -> `test/unit/selection.test.ts(7,8): error TS6307 ... exit 2`
  - GREEN: `npx biome format .` -> `Checked 151 files in 86ms. No fixes applied.`
  - GREEN: `pnpm typecheck` -> exit 0
  - GREEN: `pnpm build` -> exit 0
  - GREEN: `pnpm test --maxWorkers=2` -> `Test Files 31 passed (31)`, `Tests 737 passed (737)`
  - `pnpm lint` not required in Job A (linter disabled); e2e not run per instruction.
- Root cause (bugfix only): TS6307 above, `@ts-ignore` applies to the next line only.

## Job B

## Task 3

### Decisions made
- Renamed `biome.json` to `biome.jsonc` so rule decisions carry `//` reasons. `files.includes` was left unchanged as instructed, so it still lists the literal `"biome.json"`, which no longer matches. `biome.jsonc` is therefore not formatted or linted by Biome; it was written in the repo style by hand.
- Set `linter.enabled: true` and `rules.recommended: true`. Biome 2.6.6 reports an info-level deprecation (`recommended` to `preset`). It does not affect the exit code; kept because the prompt specifies `rules.recommended`.
- Set `assist.actions.source.organizeImports: "off"`. Reordering imports can change module evaluation order, which is not provably behavior-preserving.
- Applied safe or behavior-preserving fixes only:
  - `useImportType` and `noUnusedImports`: type-only imports and unused imports, typecheck stays green.
  - `useOptionalChain` (3 sites: `src/main/ipc/register.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/urlChoice.ts`): used only in boolean conditions, same truthiness.
  - `useTemplate` (4 test sites): string concatenation to template literal.
  - `noUnusedVariables` (5 test sites): renamed with a `_` prefix.
- Config-level `off`, each with a one-line reason in `biome.jsonc`: `noExplicitAny`, `noImplicitAnyLet`, `noExportsInTest`, `noArrayIndexKey`, `useIterableCallbackReturn`, `noDuplicateCustomProperties`, `noTsIgnore`, `noNonNullAssertion`, `noDescendingSpecificity`, `useExhaustiveDependencies`, `noComponentHookFactories`, `noUnsafeOptionalChaining`, `noUnusedPrivateClassMembers`, `useButtonType`, `useSemanticElements`, `useFocusableInteractive`, `noSvgWithoutTitle`, `useMediaCaption`, `noLabelWithoutControl`, `useKeyWithClickEvents`, `noStaticElementInteractions`, `useMathMinMax`, `noImportantStyles`.
- Inline suppressions (2 of the allowed 5): `e2e/fixtures.ts` `noEmptyPattern` (Playwright needs the destructuring pattern) and `test/unit/ipc-connections.test.ts` `noConstantCondition` (`if (false)` compile-time type check).

### Spec deviations
- Biome's unsafe fixes caused two regressions that I reverted or corrected before finishing:
  - `noTsIgnore` rewrote the `@ts-ignore` in `test/unit/selection.test.ts` to `@ts-expect-error`, which fails typecheck with TS2578. Restored `@ts-ignore` and turned the rule off.
  - `noUnusedImports` removed the unused `React` import in `test/unit/renderer-object-table.test.tsx` together with the `// @vitest-environment jsdom` pragma above it, so 19 tests failed with `HTMLElement is not defined`. Restored the pragma. The `React` import stays removed because `jsx: react-jsx` is used.

### Tradeoffs accepted
- Many rules are disabled rather than fixed, because their fixes change runtime behavior (`useButtonType`, `useExhaustiveDependencies`, `noNonNullAssertion`) or touch CSS rewritten in Phase 5.
- `noUnusedVariables` rename leaves `_expectModalKeyboardBehavior` as a dead test helper in `test/unit/renderer-dialogs.test.tsx`.

### Assumptions
- No flagged rule was triaged as a confirmed bug. I did not individually review all 14 `useExhaustiveDependencies` sites; the rule is off, so a human or Phase 2 review should do that.

### Follow-ups for human
- `src/main/s3/client.ts:36` `private store: ConnectionStore` is never read, and `src/main/connections/secrets.ts:22` `private readonly directory` is never read outside the constructor. `noUnusedPrivateClassMembers` is off. Both look like dead state, not defects, and were not touched.
- `test/unit/client.test.ts:46-47` uses `(await endpoint?.()).hostname`, which throws if `endpoint` is undefined. It fails loudly, so it is not a silent bug. Rule is off.
- Re-enable the disabled a11y and hook rules when Phases 2 to 5 rewrite the affected components.

### Test evidence
- RED -> GREEN: lint cleanup with existing suite as characterization.
  - RED: `pnpm lint` after enabling recommended -> about 600 diagnostics, `Found 148 errors` class output across 30+ rules, exit 1.
  - RED (fix regression): `pnpm typecheck` -> `test/unit/selection.test.ts(6,2): error TS2578: Unused '@ts-expect-error' directive.`
  - RED (fix regression): `pnpm test --maxWorkers=2` -> `1 failed | 30 passed`, `19 failed`, `ReferenceError: HTMLElement is not defined`.
  - GREEN: `pnpm lint` -> exit 0 (`Checked 151 files`, 1 info for the deprecated `recommended` field).
- Root cause (bugfix only): both regressions came from Biome unsafe fixes, described above.

## Task 4

### Decisions made
- Dialog focus test is added to `test/unit/renderer-dialogs.test.tsx`. It renders `ObjectTable` with `RenameDialog`, right-clicks a row, picks "Rename or move", presses Escape, and asserts `document.activeElement` is the `role="grid"` element or the row. The file's api mock gained `objects: { list }` and `IpcErrorWrapper`, which `ObjectTable` needs.
- Virtualization test is added to `test/unit/renderer-object-table.test.tsx` for viewport heights 400 and 1200, using the same `getAllByRole("row")` count as the existing 10,000 object test (header row included). The helper sets `HTMLElement.prototype.clientHeight`, as the existing `beforeEach` does.

### Spec deviations
- none

### Tradeoffs accepted
- The height override persists on `HTMLElement.prototype` after the 1200 case until the next `beforeEach` resets it to 400.

### Assumptions
- Row count of 40 includes the header `role="row"` element, matching the existing test.

### Follow-ups for human
- Phase 2 must fix both observed behaviors below, then flip the two `it.fails` tests to `it`.

### Test evidence
- RED -> GREEN:
  - Observed, focus: `pnpm test --maxWorkers=2 test/unit/renderer-dialogs` -> assertion `expected false to be true`; `document.activeElement` is `BODY` (no role, no class) after Escape. Test marked `it.fails` with `// Phase 2 fixes:` comment.
  - Observed, virtualization: at 400 px the assertion passes. At 1200 px `AssertionError: expected 41 to be less than or equal to 40`. 1200 px test marked `it.fails` with `// Phase 2 fixes:` comment.
  - GREEN: `pnpm test --maxWorkers=2` -> `Test Files 31 passed (31)`, `Tests 738 passed | 2 expected fail (740)`.
  - GREEN: `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm build` exit 0. e2e not run.
- Root cause (bugfix only): none; characterization only.

## FIX batch 1 (spec-review findings)

## Task FIX-1

### Decisions made
- Read DESIGN.md invariant 5: table bound is `ceil(viewportHeight / ROW_HEIGHT) + 2 * OVERSCAN + 1`, the extra one being the header.
- `ROW_HEIGHT` (40) and `OVERSCAN` (10) are not exported from `ObjectTable.tsx`, so the test declares them as literals with a comment naming the source. Production code untouched.
- Both viewport tests now assert the bound (31 at 400 px, 51 at 1200 px) and assert that the mounted row count with 10,000 objects equals the count with 1,000 objects at the same viewport. Tests renamed to describe the viewport bound. `it.fails` removed from the 1200 px test.
- Focus-return `it.fails` test in `renderer-dialogs.test.tsx` left unchanged for Phase 2.

### Spec deviations
- none

### Tradeoffs accepted
- Constants are duplicated in the test; they can drift from production values. The bound test would then fail or loosen.

### Assumptions
- Row count includes the header `role="row"` element, matching invariant 5.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN: test amendment, not a production change.
  - Previous state: 1200 px test `it.fails` with `expected 41 to be less than or equal to 40`.
  - GREEN: `pnpm test --maxWorkers=2` -> `Test Files 31 passed (31)`, `Tests 739 passed | 1 expected fail (740)`.
- Root cause (bugfix only): none

## Task FIX-2

### Decisions made
- Replaced the `"biome.json"` entry in `biome.jsonc` `files.includes` with `"biome.jsonc"`.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN: config change.
  - `npx biome check biome.jsonc` -> `Checked 1 file`, `No fixes applied`, 1 info (deprecated `recommended` field, unchanged). The file reported no new diagnostics, so no further fixes were needed.
  - GREEN: `pnpm lint` -> exit 0; `pnpm typecheck` -> exit 0; e2e not run.
- Root cause (bugfix only): none
