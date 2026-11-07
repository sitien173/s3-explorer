<!-- refract-shared-version: 2.5.0 -->

# Phase 6 — Journal: Quick Look and Finder bindings

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-06/journal.md at phase
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
- Started: 2026-11-07T17:56:32+07:00
- Finished: 2026-11-07T18:17:46+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase: 06 (Tasks 1, 2, 3) / Started: 2026-11-07T17:56:32+07:00 / Finished: 2026-11-07T18:17:46+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Quick Look replaces the docked viewer: new key map, a `QuickLook` dialog with sibling navigation, and a two-pane `AppShell` with `Viewer.tsx` deleted.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modify | src/renderer/src/selection.ts | Space gives `quicklook`; Ctrl or Cmd+Space toggles |
| Modify | src/renderer/src/components/ObjectTable.tsx | `onQuickLook`, `onVisibleRowsChange`; click only selects; `onSelectObject` removed |
| Create | src/renderer/src/components/QuickLook.tsx | Quick Look dialog |
| Modify | src/renderer/src/components/viewer/ImageView.tsx | Driven by Quick Look; error reset |
| Modify | src/renderer/src/components/viewer/MediaView.tsx | Driven by Quick Look; unload on close |
| Modify | src/renderer/src/components/viewer/TextView.tsx | Driven by Quick Look; abort on close |
| Modify | src/renderer/src/Shell.tsx | Renders `QuickLook`; Open URL flow opens it |
| Modify | src/renderer/src/components/AppShell.tsx | Viewer panel and saved viewer width removed |
| Delete | src/renderer/src/components/Viewer.tsx | Removed |
| Modify | test/unit/selection.test.ts | Key-map tests |
| Modify | test/unit/renderer-object-table.test.tsx | Quick Look and scroll-into-view tests, `scrollHeight` stub |
| Create | test/unit/renderer-quicklook.test.tsx | Quick Look behavior tests |
| Modify | test/unit/renderer-appshell.test.tsx | Two-pane layout tests |
| Modify | test/unit/renderer-shell.test.tsx | Docked-viewer tests removed |
| Modify | test/unit/renderer-viewer-image.test.tsx | Image error reset test |
| Modify | e2e/app.spec.ts | Quick Look dialog and Escape locators (not run) |
| Modify | docs/plans/ui-stack-refactor/phase-06/notes.md | Task 1, 2, 3 blocks |
| Modify | docs/plans/ui-stack-refactor/phase-06/journal.md | This response |
## NOTES
- phase-06/notes.md  (## Task 1, ## Task 2, ## Task 3)
- Fresh checks: `pnpm typecheck` exit 0; `pnpm lint` exit 0 (1 info); `pnpm test --maxWorkers=2` 37 files, 923 tests passed (baseline 908); `pnpm build` exit 0.
- `grep -rn "Object preview\|app-shell-last-viewer-width" src test e2e` prints nothing. `Viewer.tsx` does not exist.
- The last unit test failure was a jsdom artifact: virtual-core clamps scroll targets to `scrollHeight - clientHeight`, and jsdom reports `scrollHeight` as 0. The test now stubs it. Removing `scrollToIndex` from `ObjectTable.tsx` makes the test fail; the line was restored.
- Gap: exact RED failure text for Tasks 2 and 3 was not kept before context compaction. Notes say so. Task 1 RED is recorded in full.
## SPEC COMPLIANCE
- Meets Spec? WITH_DEBT  — all `Done When` checks pass except that the Task 2 and Task 3 RED output is described, not quoted; e2e is left to the Coordinator.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

## Quality Review

Job 7205eae1 (balanced, cc/claude-opus-medium) on checkpoint 0a5517b.

# CODE QUALITY REVIEW

**Status: PASS_WITH_DEBT**

Nothing blocks this phase. Finding 1 breaks the spec's 120 ms debounce rule in production, and the test setup hides it. I'd fix it before Phase 8 adds the cache that relies on this path. I did not edit any files, change git state or run any commands besides read-only inspection.

## Findings

1. **Non-blocking, but breaks a spec rule: the debounce does nothing for arrows pressed in the first 120 ms after opening.** `QuickLook.tsx:42-55`.
   - Shell always mounts `<QuickLook>` with `target=null`, so the settled target starts as null. It goes back to null on every close (line 48).
   - On open, the hook returns `settled ?? target`, which is the target itself. Each arrow press clears the pending timer, so the settled value stays null. Every rapid arrow then calls `streamOpen` right away until the user pauses for 120 ms.
   - The test misses this because its harness mounts `QuickLook` with `initial={s3("a.png")}`, so the settled target already holds A (`renderer-quicklook.test.tsx:215`).
   - Fix: when the settled value is null and a target exists, set it during render: `if (target && settled === null) setSettled(target)`. Add a test that renders the harness with `initial={null}`, opens it, and presses three arrows inside 120 ms. Expect two `stream.open` calls.

2. **Non-blocking: media keeps playing during the 200 ms close animation.** `QuickLook.tsx:83`, `MediaView.tsx:37-47`.
   - When the dialog closes, `settled` falls back to the last shown target. `MediaView` stays mounted until the popup's exit transition finishes, and only unloads on unmount.
   - In jsdom there is no animation, so the test can't see this. In Electron the audio audibly runs past close.
   - Fix: give `MediaView` a prop for whether Quick Look is open, and pause when it turns false. Or skip rendering the media view while `!open`.

3. **Non-blocking: Space does not close Quick Look while the `<video>` or `<audio>` element has focus.** `QuickLook.tsx:30,174`.
   - `TYPING_TARGET` includes VIDEO and AUDIO, so Space toggles playback instead of closing. The spec says Space closes Quick Look.
   - This is a defensible choice, but it is undocumented. Fix: record it under Spec deviations in `notes.md`, or drop VIDEO and AUDIO from the Space check and keep them only for arrow keys.

4. **Non-blocking: Shell's wiring has no test.** `Shell.tsx:418-426, 802-809, 829`.
   - Nothing tests that "selection follows navigation", meaning that `handleQuickLookNavigate` calls `dispatchSelection`. The quicklook test harness just sets the target. If someone removed `dispatchSelection`, every unit test would still pass, and the off-screen scroll and focus restore would silently fall back to the old row.
   - The Open URL flow opening Quick Look is covered only by e2e.
   - Fix: add a `renderer-shell.test.tsx` case. Open Quick Look on a row, press ArrowRight, close, and assert that `aria-selected` and focus land on the next object row.

5. **Non-blocking: QuickLook doesn't use the dialog wrapper the spec names.** `QuickLook.tsx:189-332`.
   - The spec says to use the Base UI Dialog wrapper in `components/ui/dialog.tsx`. QuickLook imports only `useFinalFocus` from it, then rebuilds Root, Portal, the `z-[1000]` container and the Backdrop with the Base UI parts directly.
   - It also copies the error-alert markup three times (lines 225, 243, 253).
   - Fix: build on the wrapper with a size or variant override, or record the deviation in notes. Pull the alert box into one local component.

6. **Non-blocking, minor dead code: the folder branch in `handleSelectRow` is now almost unreachable.** `Shell.tsx:428-433`.
   - It runs `setViewerTarget(null)` when a folder row is selected. Quick Look is modal and the grid ignores keys while a dialog is open, so this branch can no longer clear an open preview.
   - Leave it or remove it; it does no harm.

7. **Note: closing focuses the row itself, not the grid.** `QuickLook.tsx:69-73`.
   - The grid tracks the active row through `aria-activedescendant`. Focusing a `tabIndex=-1` row mixes two focus models. Keyboard events still bubble up to the grid handler, so nothing breaks.
   - This matches the spec's "focus returns to the row", so no change is needed.

## Verified

- **Media on navigation:** the media view unmounts the moment the target changes, because `waiting` swaps it for the spinner. Its cleanup pauses, removes `src` and calls `load()`, and the `retryKey` dependency also unloads remounted elements. The test checks `isConnected`, `src` removal, `pause` and `load`.
- **Text abort:** the effect cleanup aborts the request. The error callback is read through a ref, so a new callback never restarts the request. The test checks that the signal is aborted on navigation and on close.
- **No stale response:** while debounced, `streamData` is null, and the query is keyed by the settled target. Timers are cleared on target change, on unmount and on close.
- **Retry once:**
  - `removeQueries` removes only the `queryKeys.stream(conn, bucket, key)` entry, then `refetch` runs. The retry budget is tracked per target id.
  - A second error shows the inline Retry and "Open with system app" buttons.
  - There is no loop: the test asserts exactly 2 calls after the second error and 3 after a manual Retry.
  - A stream target (Open URL) skips the cache drop.
- **Key map:**
  - Space gives Quick Look, and Ctrl or Cmd+Space toggles selection (`selection.ts:122`).
  - A click only selects, and Shift or Ctrl+click extends.
  - Enter with one item selected, or a double-click, opens a folder or opens Quick Look.
  - The input and open-dialog guards are kept (`ObjectTable.tsx:169-172`).
  - In Quick Look, arrows skip folders and work by index. A target without siblings does nothing.
- **Scroll and focus on close:** the `scrollToIndex` effect follows the controlled `activeRowKey` (`ObjectTable.tsx:139-141`). The test fails if that line is removed, per the notes. Focus returns to `object-row-<key>` and falls back to the grid; both cases are tested.
- **Accessibility:**
  - The dialog is named by `Dialog.Title`. The Coordinator's `aria-label` removal is correct, and the tests read the name through `aria-labelledby`.
  - The close button is labelled "Close Quick Look". The modal traps focus.
  - `motion-reduce:` is applied to the backdrop, the popup and the spinner.
  - All styling tokens (`scrim`, `elevated`, `overlay`, `separator`) exist in `globals.css`, with no color literals.
- **Removed tests:** the three removed `renderer-shell` tests covered the docked viewer's resizable layout, which no longer exists. `renderer-appshell` now covers the two-pane layout, and the image error reset moved to `renderer-viewer-image`.
- **No orphaned code:** `viewerOpen`, `onViewerClose`, the `viewer` prop, `onSelectObject` and the saved viewer width are gone. `useDefaultLayout` is still re-exported from `ui/resizable.tsx`, but `renderer-shell.test.tsx:13` still uses it, so it is not orphaned. The store keeps only `viewerTarget`, which Quick Look now uses.
- **e2e change:** the locator moves to the dialog. Closing with Escape is added before the Open URL step and after it. No assertion was weakened.

## Review Result

- Spec Status: PASS. Coordinator check: Viewer.tsx deleted; no "Object preview" or saved viewer width remains; Space maps to quicklook and Ctrl or Cmd+Space to toggle; 120 ms debounce, text AbortController, and a retry-once that removes the single streamOpen entry; src/main, src/preload, src/shared, package.json, and index.html unchanged. The Coordinator fixed the e2e Quick Look locator and removed an aria-label that Base UI's aria-labelledby overrode; see notes.
- Quality Status: PASS_WITH_DEBT (7205eae1). FIX-1 (b8f1b658) fixed findings 1 to 5. Coordinator validation after FIX-1: typecheck 0, lint 0 (1 info), test 37 files and 927/927, build 0, e2e 1 passed.
- Debt:
  - Finding 6: the folder branch in Shell handleSelectRow that clears the viewer target is almost unreachable. It does no harm. Owner: accepted.
  - Finding 7: on close, focus goes to the row element, while the grid uses aria-activedescendant. This matches the spec. Owner: accepted.
  - Coordinator decision: Space closes Quick Look even when a video element has focus, so Space no longer toggles playback there. Owner: accepted, add to the Phase 9 manual checklist.
  - One run hit an unhandled Sonner timer ReferenceError after teardown in renderer-toasts-dom.test.tsx; the rerun was clean. Owner: Phase 9 (load flake).

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-06/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-06/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.

## FIX-1 Implementation Response

# EXTERNAL RESPONSE
## META
- Phase: 06 FIX-1 / Started: n/a / Finished: 2026-11-07T18:34:56+07:00 / Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Fixed review 7205eae1 findings 1 to 5 with TDD: first-open debounce, media unload on close, Space closes from media, shell selection wiring test, and one local ErrorAlert. Finding 6 left as accepted.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modify | src/renderer/src/components/QuickLook.tsx | Settle first target at once; MediaView only while open; Space check drops VIDEO and AUDIO; local ErrorAlert |
| Modify | test/unit/renderer-quicklook.test.tsx | Tests for findings 1, 2, 3; Space-in-video assertion moved |
| Modify | test/unit/renderer-shell.test.tsx | Quick Look selection and focus wiring test |
| Modify | docs/plans/ui-stack-refactor/phase-06/notes.md | FIX-1 block, Spec deviation for Dialog composition |
| Modify | docs/plans/ui-stack-refactor/phase-06/journal.md | This response |
## NOTES
- phase-06/notes.md  (## FIX-1)
- RED recorded in notes for findings 1, 2, 3. Finding 4 had no RED (coverage only); a mutation check on dispatchSelection shows the test fails without it.
- Checks: `pnpm typecheck` exit 0; `pnpm lint` exit 0 (1 info); `pnpm test --maxWorkers=2` 37 files, 927 tests passed; `pnpm build` exit 0. e2e not run.
- The media close test stubs `Element.prototype.getAnimations` to keep the exit transition pending, because jsdom unmounts at once and the unfixed code passed without it.
- Tradeoff: Space on a focused video or audio element no longer toggles playback (Coordinator decision).
## SPEC COMPLIANCE
- Meets Spec? YES
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE
