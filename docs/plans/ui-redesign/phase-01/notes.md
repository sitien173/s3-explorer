<!-- refract-shared-version: 2.4.0 -->

# Phase 1 — Decision Notes

## Task 0
### Decisions made
- none
### Spec deviations
- Before-run passed, but required baseline screenshots were not captured.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- Capture and compare the required before/after screenshots.
### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: `xvfb-run -a pnpm e2e` -> 1 passed; screenshots missing.
- Root cause (bugfix only): none

## Task 1
### Decisions made
- Used `new-york` style in hand-authored shadcn config.
### Spec deviations
- `pnpm dlx shadcn@4.23.0 info` failed: Invalid configuration found in components.json. CLI acceptance remains unmet.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- Correct config schema and verify shadcn CLI; inspect/revert incidental pnpm-workspace.yaml auto-edit (not part of declared file set).
### Test evidence
- RED -> GREEN:
  - RED: `pnpm dlx shadcn@4.23.0 info` -> Invalid configuration found in components.json.
  - GREEN: none.
- Root cause (bugfix only): none

## Task 2
### Decisions made
- Split component stylesheet by each of 18 marker ranges, preserving marker bytes in each output.
### Spec deviations
- Main stylesheet split; formal byte-for-byte base comparison was not run.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- Verify concatenation against base ref.
### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: `pnpm build` -> exit 0, Tailwind renderer CSS built.
- Root cause (bugfix only): none

## Task 3
### Decisions made
- none
### Spec deviations
- Scanner rewrite, fixture coverage, and real-file scan were not implemented; current scanner fails after stylesheet removal.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- Complete scanner task test-first.
### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> 2 failed, 563 passed; renderer scanner assertion says components.css must exist.
  - GREEN: none.
- Root cause (bugfix only): none

## Task 4
### Decisions made
- none
### Spec deviations
- CSP updated, but CSP assertions, jsdom setup registration, computed-style e2e coverage and screenshots are incomplete. The existing suite has an obsolete assertion that CSP must not contain unsafe-inline.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- Update CSP test, add e2e computed-style assertions, capture screenshots, and investigate preflight visual differences.
### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> `window.test.ts` reports expected CSP not-to-contain unsafe-inline assertion failed.
  - GREEN: none.
- Root cause (bugfix only): `style-src` intentionally now contains `'unsafe-inline'`; test is stale.

## Verification (initial batch, superseded by Batch 2)
- `pnpm typecheck` -> failed initially on TS5101; fixed by removing baseUrl and using a relative `./src/renderer/src/*` paths target.
- `pnpm build` -> passed.
- `pnpm test` -> initial failures recorded above; resolved in Batch 2.

## Batch 2 — completion work

## Task 0
### Decisions made
- Built and ran an archived base tree at `/tmp/s3-base`; temporary screenshot edits were confined to that copy.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- Generated bucket IDs vary between runs and are not UI differences.
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `cd /tmp/s3-base && xvfb-run -a pnpm e2e` -> initial attempt timed out clicking the visible Add connection button; retry with `{ force: true }` in the temporary archived copy succeeded.
  - GREEN: `cd /tmp/s3-base && xvfb-run -a pnpm e2e` -> 1 passed; created `test-results/phase-01-before-main.png` and `test-results/phase-01-before-connection-dialog.png`.
- Root cause (bugfix only): none

## Task 1
### Decisions made
- Used schema-valid config without a serialized `base` field; shadcn 4.23 reports the Radix base from the new-york style.
- Used relative tsconfig path `./src/renderer/src/*`; TS 6 rejects non-relative paths without deprecated baseUrl.
### Spec deviations
- none
### Tradeoffs accepted
- `pnpm-workspace.yaml` contains the pnpm-generated `lucide-react@1.68.0` minimumReleaseAgeExclude entry, accepted by Coordinator.
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm dlx shadcn@4.23.0 info` -> Invalid configuration found in components.json (before schema correction).
  - GREEN: `pnpm dlx shadcn@4.23.0 info` -> reports Tailwind v4, Radix base, and @/components/ui alias. Output:
```text
Project
  framework         Manual (manual)
  frameworkVersion  -
  srcDirectory      Yes
  rsc               No
  typescript        Yes
  tailwindVersion   v4
  tailwindConfig    -
  tailwindCss       src/renderer/src/styles/globals.css
  importAlias       @

Configuration
  style        new-york
  base         radix
  rsc          No
  typescript   Yes
  iconLibrary  lucide
  rtl          No
  menuColor    -
  menuAccent   -

Preset
  code  -

Aliases
  components  @/components
  utils       @/lib/utils
  ui          @/components/ui
  lib         -
  hooks       @/hooks

Resolved Paths
  cwd             /home/ngosi/projects/s3-explorer
  tailwindConfig  -
  tailwindCss     /home/ngosi/projects/s3-explorer/src/renderer/src/styles/globals.css
  utils           /home/ngosi/projects/s3-explorer/@/lib/utils
  components      /home/ngosi/projects/s3-explorer/@/components
  lib             /home/ngosi/projects/s3-explorer/@/lib
  hooks           /home/ngosi/projects/s3-explorer/@/hooks
  ui              /home/ngosi/projects/s3-explorer/@/components/ui

registries:
  @shadcn  https://ui.shadcn.com/r/styles/{style}/{name}.json

Installed Components
  No components installed.

Links
  docs        https://ui.shadcn.com/docs
  components  https://ui.shadcn.com/docs/components/radix/[component].md
  ui          https://ui.shadcn.com/code/apps/v4/registry/bases/radix/ui/[component].tsx
  examples    https://ui.shadcn.com/code/apps/v4/registry/bases/radix/examples/[component]-example.tsx
  schema      https://ui.shadcn.com/schema.json
```
- Root cause (bugfix only): Invalid `base` property and missing Tailwind `config` key; corrected against schema.json.

## Task 2
### Decisions made
- none
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: none
  - GREEN: `python3` exact byte comparison against `git show refs/plans/ui-redesign/phase-01/base:src/renderer/src/styles/components.css` -> `marker sections: 18 base bytes: 86004 split bytes: 86004 exact: True`.
```sh
python3 - <<'PY'
import re,subprocess,pathlib,sys
base=subprocess.check_output(['git','show','refs/plans/ui-redesign/phase-01/base:src/renderer/src/styles/components.css'])
markers=list(re.finditer(rb'/\*\s*tds component:\s*([\w-]+)\s*\*/',base))
combined=b''.join(pathlib.Path('src/renderer/src/styles/tds/'+m.group(1).decode()+'.css').read_bytes() for m in markers)
print('marker sections:',len(markers),'base bytes:',len(base),'split bytes:',len(combined),'exact:',combined==base)
if combined!=base: sys.exit(1)
PY
```
- Root cause (bugfix only): none

## Task 3
### Decisions made
- Implemented fixture coverage for hex/core-token restrictions, JSX/cn/cva class validation, utility allowlisting, primitive semantic styling, dangerous HTML, CSS selector/token checks, and full renderer scanning.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- Token-valued arbitrary utilities use Tailwind `-(--token)` notation.
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> 1 failed, 11 passed; assertion output: `Non-token design utility text-primary` (the bridged text color was falsely rejected).
  - GREEN: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> 1 file, 12 tests passed, including real-file scan.
- Root cause (bugfix only): semantic bridge colors and token-valued type/radius/shadow utilities were not accepted by the initial class rule; widened allowed semantic/token matching.

## Task 4
### Decisions made
- Set body background to the required surface-neutral-01 in app.css; shell remains on its existing neutral-02 surface.
### Spec deviations
- none
### Tradeoffs accepted
- Screenshot comparison shows no layout or style regression; only per-run bucket identifiers differ. Dialog dimensions/contents remain visually equivalent.
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: initial `pnpm test` -> production CSP assertion failed because it rejected unsafe-inline after the specified style-src change.
  - GREEN: `pnpm exec vitest run --project unit test/unit/window.test.ts test/unit/dom-setup.test.ts --maxWorkers=1` -> 2 files, 52 tests passed. Full e2e includes computed color token, radius (normalized CSS serialization), and resolved body background assertions.
- Root cause (bugfix only): prior assertion incorrectly rejected unsafe-inline without distinguishing style-src from script-src.

## Fresh verification — 2026-11-05
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> 24 files, 566 tests passed.
- `pnpm build` -> exit 0.
- `pnpm test:integration` -> 7 files, 25 tests passed.
- `xvfb-run -a pnpm e2e` -> 1 passed; computed-style assertions passed and after screenshots saved.
- Base screenshots rerun afterward from `/tmp/s3-base`; all four required PNGs exist.
- Visual comparison: main-screen layout/styles are unchanged; only generated bucket ID text differs. The Add connection dialog keeps the same contents, dimensions and layout (control positions differ by at most a few screenshot pixels due to render timing); no preflight regression was observed.

## Fix batch 1

## Task 1
### Decisions made
- Added the alias to root `tsconfig.json` because shadcn resolves aliases from the root config.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- The web tsconfig's matching paths can remain; root paths are needed by the CLI path resolver.
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm dlx shadcn@4.23.0 info` -> Resolved Paths reported `utils /home/ngosi/projects/s3-explorer/@/lib` and `ui /home/ngosi/projects/s3-explorer/@/components/ui`.
  - GREEN: `pnpm dlx shadcn@4.23.0 info` -> Resolved Paths reports `utils /home/ngosi/projects/s3-explorer/src/renderer/src/lib/utils` and `ui /home/ngosi/projects/s3-explorer/src/renderer/src/components/ui`.
  - `pnpm typecheck` -> exit 0.
- Root cause (bugfix only): CLI resolves aliases using root `tsconfig.json`; that config lacked compilerOptions.paths.

## Task 2
### Decisions made
- none
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- Tailwind and its Vite plugin are build-only dependencies and should not be packaged by electron-builder.
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: inspected `package.json`; `tailwindcss` and `@tailwindcss/vite` were in `dependencies`.
  - GREEN: `pnpm add -D tailwindcss@4.3.4 @tailwindcss/vite@4.3.4` -> both moved to devDependencies at exact pins; pnpm reported lockfile policy pass and updated package metadata/lockfile.
  - Fresh verification: `pnpm typecheck` exit 0; `pnpm test` 24 files/566 tests passed; `pnpm build` exit 0; `xvfb-run -a pnpm e2e` 1 passed.
- Root cause (bugfix only): both build-time-only Tailwind packages had been declared as production dependencies.

## Fix batch 2

## Task 1
### Decisions made
- Scan object property names (identifier, string literal, and no-substitution template literal) as class strings, independently of values.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> `scans object-literal class keys passed to cn` failed: expected 1 violation, received 0 for `cn({"bg-red-500": true})`.
  - RED: same command -> shorthand `cn({bgRed})` also expected 1 violation, received 0.
  - GREEN: same command -> 13 tests passed after visiting object-literal keys.
- Root cause (bugfix only): object traversal scanned only PropertyAssignment initializers and ignored property names/shorthand names.

## Task 2
### Decisions made
- Classify border/ring widths, sides/styles, text alignment, and font weights as structural utilities before applying palette restrictions; font family rules no longer reject weight classes.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> structural fixture failed with 8 false color violations for the listed allowed classes. After that correction, the added `font-mono` TDS-family assertion failed because it was incorrectly accepted as a family token.
  - GREEN: same command -> 19 tests passed; allowed structure/font-weight fixtures pass and border-red-500, ring-blue-500, text-gray-500, and non-TDS font-mono each fail as violations.
- Root cause (bugfix only): broad prefix matching treated structural utilities as colors and font weights as font families.

## Task 3
### Decisions made
- Added the requested `bg-red-primary` forbidden-color fixture.
### Spec deviations
- No scanner code change was needed: the existing bridged-color pattern in this checkout was already anchored at `^` and the fixture reports a violation.
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: none; the reviewed condition was already satisfied in the starting file.
  - GREEN: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> fixture passes with `bg-red-primary` rejected.
- Root cause (bugfix only): none; no matching false acceptance reproduced because the color regex was already anchored.

## Task 4
### Decisions made
- Validate every `(--custom-property)` value found in a class against definitions extracted by `getDefinedTokens(tokens.css)`; `scanFile` passes that set to the class scanner.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> custom-property fixture failed: expected 1 violation for `gap-(--not-a-token)`, received 0.
  - GREEN: same command -> 16 tests passed; defined `--gap-md` and `--surface-neutral-01` pass, undefined names fail for gap and bg utilities.
- Root cause (bugfix only): arbitrary custom-property names were allowed without checking the token registry.

## Task 5
### Decisions made
- Restored nested at-rule and multi-undefined-token fixtures, and checked each split TDS file's exact marker prefix.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: none; these are restored characterization fixtures and the implementations already pass them.
  - GREEN: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> 18 tests passed; nested @media/@supports, both undefined tokens, and all marker prefixes verified.
- Root cause (bugfix only): none.

## Task 6
### Decisions made
- Deduplicate violations using source position and token index, preserving distinct invalid classes at separate locations.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-tokens.test.ts --maxWorkers=1` -> `reports one finding for cn inside className` failed: expected 1, received 2.
  - GREEN: same command -> 19 tests passed after source-position deduplication.
- Root cause (bugfix only): the TSX visitor traversed `cn(...)` as part of className and again as a call expression.

## Fresh verification — Fix batch 2
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> 24 files, 573 tests passed.
