<!-- refract-shared-version: 2.4.0 -->

# Phase 2 — Decision Notes

## Task 1

### Decisions made
- none

### Spec deviations
- Shadcn generation and required dependencies were not completed because the CLI's registry request timed out.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Restore access to https://ui.shadcn.com/r/colors/neutral.json and rerun the requested `pnpm dlx shadcn@4.23.0 add` command.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm dlx shadcn@4.23.0 add button input label field native-select checkbox dialog alert-dialog tooltip badge spinner separator` -> registry lookup failed: connection timeout.
  - GREEN: not run in initial batch.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- none

### Spec deviations
- Initial batch did not create DOM coverage.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: not run in initial batch.
  - GREEN: not run in initial batch.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- none

### Spec deviations
- Initial batch did not migrate dialogs.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: not run in initial batch.
  - GREEN: not run in initial batch.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- Ran `tds rules` and fetched TDS component output for tooltip, caret, dropdown-panel, and action-list-item for reference.

### Spec deviations
- Initial batch had no changed components for Rule 10 review.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: not run.
  - GREEN: `tds rules` printed mandatory rules and the four requested CSS component records were available.
- Root cause (bugfix only): none

## Resumed batch — Coordinator response

## Task 1

### Decisions made
- Registry retry succeeded in two groups: `pnpm dlx shadcn@4.23.0 add button input label field checkbox` and `pnpm dlx shadcn@4.23.0 add dialog alert-dialog tooltip badge spinner`.
- Registry omitted separator in the first group's created files, but generated it as a field dependency. `native-select` was unavailable; wrote the native select wrapper manually.
- Removed the generated `cn` dependency and pinned `radix-ui` to exact version `1.8.1`; generated aliases resolve to local `lib/utils` where used.
- Fetched actual TDS CSS via `tds component` for tooltip, caret, dropdown-panel, action-list-item into the four declared TDS style files.

### Spec deviations
- Primitive generator output needed substantial adaptation; styling review/scanner has not passed.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: first test command failed behaviorally against the legacy dialog: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> no `alertdialog` role; legacy dialog exposed role `dialog`.
  - GREEN: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> 1 test passed, 1 test passed. It covers alertdialog accessible name, Escape close, and focus return.
  - Fresh `pnpm typecheck` -> exit 0. Fresh `pnpm build` -> exit 0.
  - `pnpm test` -> 23 passed files; scanner failed (generated shadcn classes violate scanner) and renderer-transfers initially could not resolve alias imports; subsequent relative-import fix addressed alias resolution, but full suite has not been rerun.
- Root cause (bugfix only): not applicable

## Task 2

### Decisions made
- Added a jsdom DOM test for destructive dialog role, Escape dismissal, and focus restoration.
- Controlled dialogs use Radix open/close autofocus callbacks to capture and restore the external trigger; callback rationale is that the existing application controls open state outside Radix Trigger.

### Spec deviations
- Coverage does not yet cover all six dialogs and new-folder dialog, labels/button names, or tab focus trap.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Expand DOM coverage to each dialog and add focus-trap assertions.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> assertion failure: unable to find role `alertdialog` named `Delete object` when rendered through legacy Dialog.
  - GREEN: same command after rendering Radix AlertDialog -> 1 test passed, 1 test passed.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Migrated the six named dialog components and App's new-folder modal to Radix wrappers; destructive delete uses AlertDialog. Changed only the requested e2e delete locator.
- Sidebar also imported the custom Dialog. Updated it to the new wrapper to permit deletion of the custom component and avoid a remaining import.

### Spec deviations
- E2E still fails at the Manual Credentials button locator after the Add connection dialog opens; full dialog migration accessibility behavior is not accepted yet.
- Dialog styling and component scanner compliance remain unfinished.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Diagnose why Playwright sees the Manual Credentials button in the snapshot but times out locating/clicking it under the dialog locator.

### Test evidence
- RED -> GREEN:
  - RED: legacy role regression recorded under Task 2.
  - GREEN: `pnpm typecheck` exit 0; `pnpm build` exit 0.
  - `xvfb-run -a pnpm e2e` -> 0 passed, 1 failed; 30-second timeout at Manual Credentials locator.
  - `grep -R -n 'components/Dialog"\|./Dialog"' src/renderer/src` -> no output.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- Ran `tds rules`; copied TDS CSS sources verbatim from CLI output.

### Spec deviations
- Rule 10 checklist is not fully passed. Scanner currently identifies unbridged/non-token utility classes in generated badge, checkbox, field, input, label, separator, and tooltip primitives.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Replace remaining non-TDS classes with TDS styling, then rerun scanner and full test suite.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> scanner assertion found non-token utilities including `rounded-full`, `bg-primary/90`, and `shadow-xs` in generated primitives.
  - GREEN: `pnpm test` -> 25 files passed, 574 tests passed after replacing the generated styling with TDS classes.
- Root cause (bugfix only): none

## Resumed batch — Coordinator findings

## Task 1

### Decisions made
- Added the Vitest `@` alias to match the renderer source alias after verifying transfer tests could not resolve it.
- Replaced remaining scaffold-only primitive styling with semantic TDS classes. No scanner rule was weakened.

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
  - RED: `pnpm test` -> `renderer-tokens.test.ts` failed because generated primitives used non-token classes; transfers suite import failure was also present before alias fix.
  - GREEN: `pnpm test` -> 25 files passed, 574 tests passed; scanner real-file scan passed.
- Root cause (bugfix only): root causes were generated non-TDS class strings and absent unit-project alias; fixed in primitive files and Vitest config respectively.

## Task 2

### Decisions made
- Added dialog DOM assertions for alertdialog accessible name, focus entering the dialog, Tab focus containment, Escape close, and focus restoration. Existing e2e exercises the migrated form dialog labels and button names.

### Spec deviations
- Unit DOM test directly covers AlertDialog, not individual component renders for all six dialogs and new-folder modal. Extend with per-component cases if specifically required by reviewer.

### Tradeoffs accepted
- none

### Assumptions
- Existing e2e provides end-to-end coverage of the named form labels and submit buttons.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> legacy dialog did not expose `alertdialog` role for `Delete object`.
  - GREEN: `pnpm test` -> 25 files passed, 574 tests passed, including the new alertdialog focus/Escape case.
- Root cause (bugfix only): legacy custom dialog used role `dialog`; Radix AlertDialog now supplies the alertdialog role.

## Task 3

### Decisions made
- Added an explicit accessible name to controlled Radix Content after Playwright snapshot showed the dialog role lacked a computed accessible name, causing the nested locator to wait indefinitely.

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
  - RED: `xvfb-run -a pnpm e2e` -> timeout locating Manual Credentials inside Add connection; Playwright snapshot showed the dialog without an accessible name.
  - GREEN: `xvfb-run -a pnpm e2e` after explicit `aria-label` on controlled Radix dialog content -> 1 passed.
  - `grep -R -n 'components/Dialog"\|./Dialog"' src/renderer/src` -> no matches.
- Root cause (bugfix only): Dialog Content did not expose its Title through the Radix label relationship in the compatibility wrapper; explicit accessible label resolves the e2e role locator.

## Task 4

### Decisions made
- Rule 10 self-check: TDS rules loaded; all new UI class strings use `tds-*` classes or existing permitted layout utilities; form input/label/checkbox and dialog-title associations, dialog accessible names, dismissal labels, and buttons checked. Imported TDS CSS came from `tds component` output.

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
  - RED: real-file scanner rejected generated classes such as `bg-primary/90`, `rounded-full`, `shadow-xs`.
  - GREEN: `pnpm test` -> 25 files, 574 tests passed; scanner passes with no rule weakening.
  - Fresh `pnpm typecheck` -> exit 0; `pnpm build` -> exit 0; `xvfb-run -a pnpm e2e` -> 1 passed.
- Root cause (bugfix only): none

## Fix batch 1

### Task 1 — Real dialog component DOM coverage

#### Decisions made
- Added a mocked `api` module based on `src/renderer/src/api.ts`; resolved calls return IPC-style `{ ok, data }` results.
- New-folder coverage renders the same controlled `ui/dialog` usage pattern with the exact title, label, and footer actions. Mounting `App` would pull in its broad shell and many unrelated API hooks; no extraction or App edit was needed.

#### Spec deviations
- none

#### Tradeoffs accepted
- App's new-folder behavior is verified through the component's exact dialog usage pattern rather than mounting the full App tree.

#### Assumptions
- Existing e2e continues to cover app-level flow; the isolated DOM test focuses on the new-folder dialog semantics and keyboard handling.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> first run exposed a test fixture cleanup issue (duplicate trigger); after cleanup, same command failed on RenameDialog and OpenUrlDialog focus return: after Escape `document.activeElement` was `body`, not the opener.
  - GREEN: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> 1 file passed, 7 tests passed. Includes all six real components plus new-folder pattern; role/name, listed labels/actions, focus-in, Tab containment, Escape, and opener restoration assertions pass.
- Root cause (bugfix only): OnOpenAutoFocus captured the auto-focused form input rather than the external trigger for RenameDialog and OpenUrlDialog. The opener is now captured at the controlled open transition before Radix focus management, then restored on close.

### Task 2 — Fresh verification

#### Decisions made
- none

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: targeted DOM run above failed two opener-restoration assertions.
  - GREEN: `pnpm typecheck` -> exit 0; `pnpm test` -> 25 files, 580 tests passed; `pnpm build` -> exit 0; `xvfb-run -a pnpm e2e` -> 1 passed.
- Root cause (bugfix only): same focus timing root cause documented under Task 1.

## Fix batch 2

### Task 1 — Connection kind toggle variants

#### Decisions made
- none

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- The unselected kind control uses `secondary`; selected state uses the default/primary Button variant.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` -> the new assertion failed because the unselected Manual Credentials toggle contained `tds-btn--primary` and also had incompatible stacked variants.
  - GREEN: same command -> 1 file passed, 7 tests passed after replacing hand-authored classes with `size="sm"` and selected-state `variant` props.
- Root cause (bugfix only): Button's default variant/size were combined with an additional custom TDS class string, leaving conflicting classes on the element.

### Task 2 — Radix opener capture lifecycle

#### Decisions made
- Capture focus in a document `focusin` tracker that only records targets outside modal roles; capture the last outside target into the opener ref in a `useLayoutEffect` keyed to `isOpen`. On Radix close autofocus, restore focus and clear the ref.

#### Spec deviations
- none

#### Tradeoffs accepted
- A module-level document focus listener keeps capture available even when dialog components render `null` while closed; it ignores focus movement within a dialog or alertdialog.

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/renderer-dialogs.test.tsx` after replacing render-time mutation with layout-effect capture -> all 7 dialog focus-return assertions failed because the wrapper mounts only after `isOpen` becomes true and auto-focused content steals the active element.
  - GREEN: same command after adding the outside-dialog focus tracker and retaining Radix close-autofocus restoration -> 1 file passed, 7 tests passed.
- Root cause (bugfix only): Several components return `null` while closed, so a local closed-state effect cannot track the opener; focus capture must observe outside focus before the dialog mounts.

### Task 3 — Unused aliases and verification

#### Decisions made
- Deleted unused `DialogHeader` and `DialogFooter` aliases; repository search found no consumers.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: none; repository search `grep -R -n 'DialogHeader\\|DialogFooter' src/renderer/src --include='*.tsx'` found only the two export definitions.
  - GREEN: `pnpm typecheck` exit 0; `pnpm test` 25 files, 580 tests passed; `pnpm build` exit 0; `xvfb-run -a pnpm e2e` 1 passed.
- Root cause (bugfix only): none

