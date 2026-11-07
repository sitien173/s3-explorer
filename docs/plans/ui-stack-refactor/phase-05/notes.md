<!-- refract-shared-version: 2.5.0 -->

# Phase 5 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-05/notes.md, fill the
heading, then append one `## Task <M>` block per task (and additional batch
sections on resumed `FIX:` rounds). Keep the file; never overwrite earlier task
blocks. Empty sub-sections = `- none`. Every task gets a block even if all
`none`.
-->

## Task <M>

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
  - RED: `<exact command>` -> `<exact behavioral assertion failure; not ImportError/SyntaxError>`
  - GREEN: `<exact command>` -> `<exact pass/skip counts>`
- Root cause (bugfix only): <reproduction and root-cause evidence, or `none`>

## Task 1

### Decisions made
- Scanner covers hex, rgb/hsl/hwb/lab/lch/oklab/oklch/color(), and CSS named colors. In TSX, a named color counts only when it is a quoted value after a style or attribute key.
- Tokens are read from the `@theme` block and the `prefers-color-scheme: dark` `:root` block of `globals.css`. The test also asserts WCAG AA ratios in both themes.
- Color-literal scan skips `styles/tokens.css`, `styles/app.css`, and `styles/tds/`. Job B deletes them. Until then they carry the legacy look for feature components.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- A pre-existing `renderer-tokens.test.ts` was overwritten. I did not keep its old contents.

### Follow-ups for human
- RED for the token assertions against the old `globals.css` was not captured. The two `tds` assertions were captured RED.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/zz-red.test.ts` (temp copy with `it.fails` as `it`, deleted after) -> `has no tds- classes` and `has no TDS files` fail; 2 failed, 29 passed
  - GREEN: `pnpm test --maxWorkers=2` -> 36 files passed, 903 passed, 2 expected fail
- Root cause (bugfix only): none
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-07T17:02:10+07:00
- Finished: 2026-11-07

## Task 2

### Decisions made
- `globals.css` now holds the tokens. Light values sit in `@theme static`, dark overrides in `@media (prefers-color-scheme: dark) { :root }`, plus `color-scheme: light dark`, a reduced-motion rule, and the Inter `@font-face` (moved from `tokens.css`).
- Added `scrim` color, `control`/`surface`/`overlay` radii, `overlay` shadow, and a 13 px base text scale.
- `Button` exposes `data-variant` and `data-size`. `renderer-dialogs.test.tsx` asserts those instead of `tds-btn--*`.
- All 18 files in `components/ui` no longer use `tds-` or `app-` classes.
- `sonner.tsx` uses `theme="system"`.

### Spec deviations
- `test/unit/dom-setup.ts` gained a `window.matchMedia` stub. Sonner's system theme calls it and jsdom lacks it. The file is outside the listed paths.
- The TDS stylesheets and `tokens.css` stay imported by `globals.css` until Job B. The old `@theme inline` mappings (`primary`, `muted`, `card`, `popover`, `border`) were removed; no renderer file outside `ui/` was checked for them.

### Tradeoffs accepted
- Unlayered `body` rule in `globals.css` overrides the legacy body rule until Job B deletes `app.css`.

### Assumptions
- none

### Follow-ups for human
- Job B should grep feature components for utilities backed by the removed mappings.
- Computed contrast ratios (text on background unless noted): light primary 16.83, secondary 8.81, tertiary on sidebar 4.98, accent 5.57; dark primary 15.63, secondary 10.10, tertiary on elevated 4.97, accent 6.48. Focus ring equals accent: light 5.57, dark 6.48 on background.

### Test evidence
- RED -> GREEN:
  - RED: token assertions against the old `globals.css` not captured
  - GREEN: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test --maxWorkers=2` 903 passed, 2 expected fail; `pnpm build` 0
- Root cause (bugfix only): none
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-07T17:02:10+07:00
- Finished: 2026-11-07

## Task 3

### Decisions made
- Three sub-agents restyled the 22 feature files in parallel under one token map. I reviewed the results with grep, typecheck, and the full unit suite, not line by line.
- Banners, spinners, field captions, and field labels stay plain elements carrying the wrapper utility classes. `Alert`, `Spinner`, `FieldDescription`, and `FieldError` would add `role="status"` or `role="alert"` or change the tag.
- Progress fill and "completed" transfer status use `text-foreground` and `bg-foreground`. There is no positive token.
- `tds-text-input--error` had no CSS. Inputs get `border-destructive` when the field has an error.
- Deleted `tokens.css`, `app.css`, and `styles/tds/`, and their imports in `globals.css`. `ls styles` lists only `globals.css`.
- Removed the `legacy` filter from the scanner test and flipped both `it.fails` to `it`.
- Replaced the e2e TDS token checks (`--color-neutral-100`, `--radius-md`, `--surface-neutral-01`) with an emulateMedia check. Dark expects `rgb(28, 28, 30)`, light `rgb(255, 255, 255)`, for both body and `--color-background`.
- Removed-mapping grep: no `primary`, `muted`, `card`, or `popover` utilities remain outside `components/ui`.

### Spec deviations
- `test/unit/renderer-shell.test.tsx` changed two assertions that read removed class names: `closest(".app-bucket-row")` became `parentElement`, and `app-transfers-body` became `overflow-y-auto`.

### Tradeoffs accepted
- Legacy font sizes mapped by name, so some text shifts 1 to 3 px. Dialog text renders smaller than before.
- Legacy line-heights were dropped. Skeleton radius is now 6 px.
- Three classes with no CSS definition were dropped: `app-search-status-text`, `app-table-col`, `app-filter-match-count`.

### Assumptions
- Ids, `form` attributes, and storage keys that begin with `app-` (`app-rename-form`, `app-open-url-form`, `app-new-folder-form`, `app-shell`, `app-shell-last-viewer-width`) are not classes and stay. The scanner does not flag them.

### Follow-ups for human
- Visual check of dialogs and sidebar in both themes. The suite cannot judge look.
- First full unit run after the restyle had 16 failures and 2 worker timeouts (584 s). The rerun passed with 905 tests. Treat as load flake.

### Test evidence
- RED -> GREEN:
  - RED: the two `it.fails` assertions failed against the TDS sources in Job A
  - GREEN: `pnpm test --maxWorkers=2` 36 files, 905 passed, 0 expected fail; `grep -rn "tds-" src/renderer` prints nothing
- Root cause (bugfix only): none
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-07
- Finished: 2026-11-07

## Task 4

### Decisions made
- Re-enabled `useButtonType`, `useKeyWithClickEvents`, `noStaticElementInteractions`, `noSvgWithoutTitle`, `useMediaCaption`, and the three CSS rules. The CSS rules had no violations after Task 3.
- `noSvgWithoutTitle`: added `aria-hidden="true"` to the three decorative svgs.
- Kept off, each with its own reason in `biome.jsonc`: `useSemanticElements`, `useFocusableInteractive`, `noLabelWithoutControl`.
- `useButtonType` is off only under an override for `test/**`, reason: test doubles render bare buttons outside any form.
- New `biome-ignore` sites, 4: `Shell.tsx` drop zone (`noStaticElementInteractions`), `ObjectTable.tsx` row (`useKeyWithClickEvents`), `MediaView.tsx` video and audio (`useMediaCaption`).

### Spec deviations
- none

### Tradeoffs accepted
- `useSemanticElements` and `useFocusableInteractive` stay off because native table elements and tabbable rows would change the virtualized layout and accessible roles.

### Assumptions
- "At most 5 biome-ignore sites" counts only the ones added for these rules.

### Follow-ups for human
- The repo holds 10 `biome-ignore` sites in total. Six pre-date this task (four `useExhaustiveDependencies`, one `noConstantCondition`, one `noEmptyPattern`). If the limit means 10 in total, it is exceeded.

### Test evidence
- RED -> GREEN:
  - RED: with the rules on and before fixes, `pnpm exec biome lint` reported 46 a11y violations in src and test
  - GREEN: `pnpm lint` 0; `pnpm typecheck` 0; `pnpm test --maxWorkers=2` 905 passed; `pnpm build` 0
- Root cause (bugfix only): none
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-07
- Finished: 2026-11-07

## FIX-1
### Decisions made
- Reduced motion: split the global rule. Animation declarations use `*:not([class*="motion-reduce:animate-pulse"])`, so spinners and skeletons keep the pulse. Transition and scroll rules still apply to all elements. Comment corrected.
- Selected row: `shadow-[inset_2px_0_0_var(--color-accent)]` plus `hover:bg-selection`, so hover cannot replace the selection fill. Accent on background is 5.57 light and 6.48 dark, above 3:1.
- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`.
- Biome: `useFocusableInteractive` scoped to ObjectTable.tsx, `noLabelWithoutControl` scoped to ui/label.tsx and ui/field.tsx, each with its reason. `useSemanticElements` stays global.
- Scanner: bg-, text-, border-, rounded-, shadow- suffixes must be a globals.css token or a listed built-in. Arbitrary `[...]` and `(...)` values are skipped. Border side prefixes are stripped before the check.
- MediaView: removed `outline-none` from video and audio.
### Spec deviations
None. Findings 6 and 8 untouched.
### Tradeoffs accepted
- The built-in suffix list in the scanner is explicit, so a new valid built-in needs one added entry.
### Assumptions
- Elements carrying `motion-reduce:animate-pulse` in their class string are the only ones that should animate under reduced motion.
### Follow-ups for human
- Look at selected rows in both themes.
### Test evidence RED->GREEN
- Scanner: temporary `bg-white` in viewer/TextView.tsx failed the renderer sources test, listing `components/viewer/TextView.tsx: bg-white`. Removed, test GREEN.
- Reduced-motion exemption and selected-row indicator tests were written after the edits. RED against the old code was not captured.
- Fresh: typecheck 0, lint 0 (one existing info), test 36 files and 908 passed, build 0. e2e not run.
