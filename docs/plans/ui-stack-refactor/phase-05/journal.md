<!-- refract-shared-version: 2.5.0 -->

# Phase 5 — Journal: Apple-style theme with light and dark

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-05/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-stack-refactor/PLAN.md
- Implementation Profile: balanced
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: <Refract job ID or n/a>
- Review Job: <Refract job ID or n/a>
- Started: 2026-11-07T17:02:10+07:00
- Finished: <ISO timestamp>

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 05 Job A, Tasks 1 and 2 | Started: 2026-11-07T17:02:10+07:00 | Finished: 2026-11-07 | Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Rewrote the token scanner test and defined light and dark semantic tokens in globals.css, and restyled every `components/ui` file with Tailwind utilities without `tds-` classes.
## FILES MODIFIED
| Action | Path | Change |
| modify | test/unit/renderer-tokens.test.ts | Scanner and token tests; two `it.fails` marked Job B |
| modify | test/unit/renderer-dialogs.test.tsx | Assert data-variant and data-size instead of tds-btn classes |
| modify | test/unit/dom-setup.ts | matchMedia stub for Sonner system theme |
| modify | src/renderer/src/styles/globals.css | Semantic tokens, dark override, color-scheme, reduced motion, Inter font-face |
| modify | src/renderer/src/styles/tokens.css | Removed the Inter font-face block |
| modify | src/renderer/src/components/ui/*.tsx | alert, alert-dialog, badge, breadcrumb, button, checkbox, context-menu, dialog, field, input, label, resizable, select, separator, sheet, skeleton, sonner, spinner, tooltip restyled |
| modify | docs/plans/ui-stack-refactor/phase-05/notes.md | Task 1 and Task 2 blocks |
| modify | docs/plans/ui-stack-refactor/phase-05/journal.md | This response |
## NOTES
- phase-05/notes.md (## Task 1, ## Task 2). Fresh: typecheck 0, lint 0, test 903 passed and 2 expected fail, build 0. e2e not run.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT - Task 2 scope met; RED for token assertions against old globals.css not captured and dom-setup.ts edited outside listed paths (see notes).
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE


## Quality Review

Job 7b70ad1a (balanced) on checkpoint a84ab88.

# CODE QUALITY REVIEW

**Status: PASS_WITH_DEBT**

Nothing blocks merge. Contrast passes AA in both themes, every utility class resolves to a real token, and no focus ring was lost. The debt is one reduced-motion inconsistency, weak selected-row contrast, a font-order question, Biome rules disabled more widely than needed, and one test guard that was dropped.

## Findings

1. **Non-blocking. The spinner's reduced-motion pulse never runs.** In `src/renderer/src/styles/globals.css:100-110`, the global reduced-motion rule is unlayered. It forces `animation-duration: 0.01ms` and `animation-iteration-count: 1` on every element. That beats the layered `motion-reduce:animate-pulse` variant used at 7 spinner sites, such as `ui/spinner.tsx:8` and `ObjectTable.tsx:572`. Spinners are therefore static under reduced motion. The comment on line 100 says they keep a pulse, which is wrong.
   - Fix: limit the animation declarations to `*:not([class*="motion-reduce:animate-pulse"])` so the pulse runs. The other option is to remove the variant from all 7 sites and correct the comment.

2. **Non-blocking. Selected table rows are hard to see.** At `ObjectTable.tsx:481`, the selected row's only cue is `bg-selection`. That measures 1.27:1 against the background in light and 1.48:1 in dark, and 1.16:1 and 1.21:1 against the surface color. WCAG 1.4.11 asks for 3:1 on state indicators. Hover also replaces the selection color. This is better than the base commit, whose old selection color measured 1.08:1, so it is not a regression. The sidebar already adds `border-accent` for its active bucket.
   - Fix: add an accent indicator to selected rows, such as `shadow-[inset_2px_0_0_var(--color-accent)]`. Or use the macOS style: accent fill with `text-accent-foreground`.

3. **Non-blocking, needs a human decision. Bundled Inter never renders on Linux.** In `globals.css:37`, `system-ui` comes before `"Inter"`. On Linux, `system-ui` always resolves to some font, so Inter is never used. This matches the order the spec lists, but defeats its intent that Inter is the Linux fallback.
   - Fix: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`.

4. **Non-blocking. Two Biome rules are switched off for the whole repo when only a few files need it.** The reasons given are sound.
   - `biome.jsonc:57` `useFocusableInteractive`: all 4 violations are in `ObjectTable.tsx`, lines 407-418.
   - `biome.jsonc:59` `noLabelWithoutControl`: both violations are in `ui/label.tsx:4` and `ui/field.tsx:12`.
   - Fix: move each rule into an `overrides` entry limited to those files, so new feature code stays linted.
   - `useSemanticElements` has 13 sites across 5 files, so leaving it off everywhere is reasonable.

5. **Non-blocking. The test that caught undefined-token classes was removed.** The old `renderer-tokens.test.ts` included "accepts custom-property utilities only for defined tokens". The rewrite has no equivalent. Because `@theme static` resets `--color-*`, `--radius-*`, `--shadow-*` and `--text-*`, a class like `bg-white` or `rounded-md` would now silently produce no CSS. My build cross-check found no such class today, but nothing stops one being added.
   - Fix: add a scanner test. It should fail any `bg-`, `text-`, `border-`, `rounded-`, or `shadow-` class whose suffix is not a known token or a built-in size.

6. **Non-blocking. Banner and spinner styles are copy-pasted.** The error-banner class string is repeated about 20 times, for example `Shell.tsx:117`, `Sidebar.tsx:147` and `ObjectTable.tsx:307`. Spinner markup is copied 6 times. The worker skipped the `Alert` and `Spinner` wrappers to avoid adding roles, which is valid, but any future style change now means editing every copy.
   - Fix: export `bannerClass` and `spinnerClass` constants from `ui/alert.tsx` and `ui/spinner.tsx` and use them at each site.

7. **Non-blocking, carried over from the base commit. Video and audio elements have no focus ring.** `outline-none` on the `<video>` and `<audio>` elements at `viewer/MediaView.tsx:149` and `:162` hides their focus ring. The old `app.css:708` did the same.
   - Fix: remove `outline-none` so the global `:focus-visible` ring applies.

8. **Non-blocking, not verified at runtime. Some toast classes probably have no effect.** The `group-[.toaster]:bg-elevated`, text, border and shadow classes at `ui/sonner.tsx:12` are likely overridden by Sonner's own unlayered styles. The CSS variables set at lines 20-23 already do the theming. This pattern predates the phase.
   - Fix: leave as is, or drop those classes and keep only the variables.

## Verified

- **Contrast, recomputed from `globals.css`:**

  | Pair | Light | Dark | Minimum |
  |---|---|---|---|
  | Primary text on background | 16.83 | 15.63 | 4.5 |
  | Secondary text on background | 8.81 | 10.10 | 4.5 |
  | Tertiary text, worst surface | 4.98 on sidebar | 4.97 on elevated | 4.5 |
  | Accent on background | 5.57 | 6.48 | 4.5 |
  | Button text on accent | 5.57 | 6.88 | 4.5 |
  | Button text on destructive | 6.05 | 7.17 | 4.5 |
  | Focus ring, worst surface | 4.85 | 4.87 | 3 |
  | Focus ring on selection | 4.39 | 4.39 | 3 |
  | Input and select border, worst surface | 3.16 | 3.92 | 3 |

  These match the worker's notes.
- **Borders and separators:** separators measure 1.18 to 1.57:1. Only decorative hairlines, dialog borders backed by shadows, and text-labelled outline buttons use them, so 1.4.11 does not apply.
- **Disabled states:** text at 50% opacity measures 2.2 to 4.8:1. WCAG exempts disabled controls, and the text stays legible.
- **Focus rings:** a base `:focus-visible` outline uses the ring color. Button, input, select, resize handle and breadcrumb add explicit outlines. `outline-none` appears only on context-menu popups and items, which show an accent highlight instead, and on media elements, as in finding 7.
- **Theme switching:** the compiled CSS has the dark overrides in an unlayered `@media (prefers-color-scheme: dark) :root` block, and `color-scheme: light dark` is set. Sonner uses `theme="system"`.
- **No undefined tokens:** I ran a script over every class-like string in `src/renderer/src` against the selectors in the fresh build output. The only tokens missing are not classes. All CSS variables used in the build are defined, apart from Tailwind's own fallbacks and Base UI's runtime `--transform-origin`.
- **tailwind-merge:** it groups the custom color and size names correctly. For example, `text-base text-foreground` keeps both classes. The custom radius names are not merged against each other, but no caller overrides them today.
- **Reduced motion:** transitions on `duration-*` and `transition-*` utilities are cut to 0.01ms by the unlayered rule. The skeleton uses `motion-reduce:animate-none`. Sonner has its own reduced-motion handling.
- **Status colors:** transfer status is always shown as a text label, so having no "positive" color does not hide any state. Upload and download now use `Badge`.
- **Biome ignores:** all 4 new `biome-ignore` comments are justified.
  - The `Shell.tsx:693` drop zone has the Upload button as its keyboard path.
  - The `ObjectTable.tsx` row's keys are handled by the grid container through `aria-activedescendant` at line 391.
  - The two `MediaView` media elements have no caption tracks in S3.
  - Turning `useButtonType` off only for `test/**` is sound. All 20 violations are test doubles.
- **Test changes:**
  - In `renderer-shell.test.tsx`, `parentElement` is the same row element that `.app-bucket-row` used to find. `overflow-y-auto` still checks the scroll container.
  - In `renderer-dialogs.test.tsx`, the `data-variant` and `data-size` checks are as strong as the old ones. The `not.toBe("default")` line is redundant.
  - The scanner covers hex, color functions and named colors, plus WCAG ratios for text, accent, ring and input in both themes.
  - The e2e check confirms both the `body` color and the token value under dark and light emulation.
- **Dead code:** every token defined in `globals.css` is used. Orphan classes and deleted files are gone, and the `matchMedia` stub in `dom-setup.ts` is needed for Sonner.

I did not edit any files, change git state, or run e2e. I created only scratch scripts under `/tmp/rev5`, plus a temporary script in the repo root that I deleted right away. Each finding's line number is as of `a84ab88`.

## Review Result

- Spec Status: PASS. The Coordinator checked the work against prompt.md. `styles/` holds only globals.css. No `tds-` string or color literal remains in .ts or .tsx files. index.html, package.json, src/main, src/preload, and src/shared are unchanged. Reduced-motion and color-scheme rules exist.
- Quality Status: PASS_WITH_DEBT (7b70ad1a). Findings 1, 2, 3, 4, 5 and 7 are fixed in FIX-1, job 1e285b3c, a retry of b21321f8, which compacted before it edited anything. Coordinator validation after FIX-1: typecheck 0, lint 0 with 1 info, test 36 files and 908/908, build 0, e2e 1 passed.
- Debt:
  - Finding 6: the banner and spinner class strings are duplicated. Export shared class constants from ui/alert.tsx and ui/spinner.tsx. Owner: Phase 9.
  - Finding 8: the group-[.toaster] classes in ui/sonner.tsx probably have no effect. Owner: Phase 9.
  - The Biome `linter.rules.recommended` field is deprecated, and `pnpm lint` reports 1 info. Run `biome migrate` or switch to the preset form. Owner: Phase 9.
  - Nobody has visually checked both themes, including selected rows, dialogs, and the sidebar. Owner: the Phase 9 manual checklist.
  - RED was not captured for the reduced-motion and selected-row tests. Owner: accepted.
  - The Phase 1 a11y and CSS rule debt is resolved. useSemanticElements stays off with a reason. useFocusableInteractive and noLabelWithoutControl are off only for the files that need them.

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-05/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-05/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.

# EXTERNAL RESPONSE
## META
- Phase: 05 Job B, Tasks 3 and 4 | Started: 2026-11-07 | Finished: 2026-11-07 | Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Restyled all feature components onto Tailwind utilities, deleted tokens.css, app.css, and styles/tds, flipped the scanner assertions, added the e2e dark and light background check, and re-enabled the a11y and CSS Biome rules.
## FILES MODIFIED
| Action | Path | Change |
| modify | src/renderer/src/Shell.tsx | Utilities, one biome-ignore |
| modify | src/renderer/src/components/{AddBucketDialog,AppShell,Breadcrumb,ConfirmDeleteDialog,ConnectionDialog,CreateBucketDialog,DeleteBucketDialog,ObjectTable,OpenUrlDialog,OperationReport,RenameDialog,SearchBar,Sidebar,SsoBanner,Toolbar,TransfersDrawer,Viewer}.tsx | Dropped tds- and app- classes, svg aria-hidden, one biome-ignore in ObjectTable |
| modify | src/renderer/src/components/viewer/{ImageView,MediaView,PdfView,TextView}.tsx | Same, two biome-ignore in MediaView |
| modify | src/renderer/src/styles/globals.css | Removed legacy imports |
| delete | src/renderer/src/styles/{tokens.css,app.css,tds/*} | Legacy TDS styling |
| modify | biome.jsonc | Re-enabled rules, per-rule reasons, test override |
| modify | test/unit/renderer-tokens.test.ts | it.fails to it, removed legacy filter |
| modify | test/unit/renderer-shell.test.tsx | Two assertions off removed class names |
| modify | e2e/app.spec.ts | emulateMedia dark and light background check replaces TDS token checks |
| modify | docs/plans/ui-stack-refactor/phase-05/notes.md | Task 3 and Task 4 blocks |
| modify | docs/plans/ui-stack-refactor/phase-05/journal.md | This response |
## NOTES
- phase-05/notes.md (## Task 3, ## Task 4). Fresh: typecheck 0, lint 0, test 36 files and 905 passed, build 0. `ls styles` lists only globals.css; `grep -rn "tds-" src/renderer` prints nothing. e2e not run.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT - Done When met; 10 biome-ignore sites exist in total, 4 added here, and visual check in both themes is pending (see notes).
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## FIX-1 Response

# EXTERNAL RESPONSE
## META
- Phase: 05 FIX-1 | Finished: 2026-11-07 | Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Fixed review findings 1, 2, 3, 4, 5 and 7. Findings 6 and 8 were not touched.
## FILES MODIFIED
| Action | Path | Change |
| modify | src/renderer/src/styles/globals.css | Pulse exemption in reduced-motion rule, comment fixed, font order |
| modify | src/renderer/src/components/ObjectTable.tsx | Selected row inset accent bar and hover:bg-selection |
| modify | src/renderer/src/components/viewer/MediaView.tsx | Removed outline-none from video and audio |
| modify | biome.jsonc | Two a11y rules moved from global off to scoped overrides |
| modify | test/unit/renderer-tokens.test.ts | Utility scanner test, helper test, reduced-motion exemption test |
| modify | test/unit/renderer-object-table.test.tsx | Selected row indicator assertions |
| modify | docs/plans/ui-stack-refactor/phase-05/notes.md | FIX-1 block |
| modify | docs/plans/ui-stack-refactor/phase-05/journal.md | This response |
## NOTES
- phase-05/notes.md (## FIX-1). Fresh: typecheck 0, lint 0, test 36 files and 908 passed, build 0. Scanner RED shown with temporary bg-white, then removed. e2e not run.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT - RED not captured for the reduced-motion and selected-row tests, which were written after the edits.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE
