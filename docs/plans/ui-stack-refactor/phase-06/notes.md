<!-- refract-shared-version: 2.5.0 -->

# Phase 6 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-06/notes.md, fill the
heading, then append one `## Task <M>` block per task (and additional batch
sections on resumed `FIX:` rounds). Keep the file; never overwrite earlier task
blocks. Empty sub-sections = `- none`. Every task gets a block even if all
`none`.
-->

## Task 1

### Decisions made
- `keyboardAction` returns `"quicklook"` for Space and `"toggle"` for Ctrl or Cmd+Space.
- `ObjectTable` gains `onQuickLook(row)` (object rows only, active row first) and `onVisibleRowsChange(rows)`, which Shell uses to read sibling rows by index.
- A click now only selects. The `onSelectObject` prop is removed because it opened the docked viewer.
- Enter and double-click already opened a folder or called `onOpenRow`; kept, covered by a characterization test.

### Spec deviations
- none

### Tradeoffs accepted
- `onVisibleRowsChange` runs in an effect on every render. It only writes a ref in Shell, so it cannot loop.

### Assumptions
- Space on a folder does nothing. The spec limits Quick Look to objects.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/selection.test.ts test/unit/renderer-object-table.test.tsx` -> `maps Space to Quick Look`: expected 'toggle' to be 'quicklook'; `opens Quick Look on the active object with Space...`: expected "vi.fn()" to be called 1 times, but got 0 times. Two earlier runs failed on fixture typos (folder shape, `dblclick` casing) and were fixed before this RED.
  - GREEN: same command -> 2 files passed, 54 tests passed.
- Late-found test gap, fixed in the second run: the test "scrolls an off-screen active row into view when Quick Look moves the selection to it" first failed because jsdom reports `scrollHeight` as 0. `@tanstack/virtual-core` 3.19.10 clamps every scroll target to `scrollHeight - clientHeight` (`src/index.ts` lines 2233-2239 and 2368-2370), so `scrollToIndex(300)` asked for top 0. This is a jsdom artifact, not a component bug. The test now stubs `scrollHeight` to `(rows + 1) * ROW_HEIGHT`, asserts a `scrollTo` call with top > 0, asserts `row-300.txt` renders and `row-0.txt` does not, and restores `scrollHeight` in `finally`. Mutation check: commenting out `rowVirtualizer.scrollToIndex` in `ObjectTable.tsx` makes this test fail (24 passed, 1 failed); the line was restored.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- New `src/renderer/src/components/QuickLook.tsx` is a dialog named `Quick Look <fileName>`. Space opens it from the active object row; Escape or the close button closes it.
- Arrow keys move by index through the sibling rows that `ObjectTable` reports through `onVisibleRowsChange`, skipping folders. A target without siblings gets no navigation.
- Navigation is debounced 120 ms so rapid arrows produce one `streamOpen` call.
- Loaded targets are cached and reused. A failed load is retried once, then shows the error.
- Closing or navigating unloads media and aborts the text request. Focus returns to the originating row.
- The store holds the Quick Look target. `Shell.tsx` renders `<QuickLook>`, and the Open URL flow opens it.
- `ImageView.tsx`, `MediaView.tsx` and `TextView.tsx` were adjusted to be driven by `QuickLook`. `ImageView` resets its error state when a target is shown again; covered in `renderer-viewer-image.test.tsx`.

### Spec deviations
- none

### Tradeoffs accepted
- The accessible name is `Quick Look <fileName>`, so it does not reuse "Object preview".

### Assumptions
- none

### Follow-ups for human
- The Coordinator-run e2e must confirm the dialog and Escape flow in a real Electron window. Unit tests use jsdom.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/renderer-quicklook.test.tsx` against an inert `QuickLook` scaffold that rendered nothing -> every dialog lookup failed (behavioral, not an import error). The exact assertion text was not kept in notes before the context was compacted.
  - GREEN: `pnpm test --maxWorkers=2` -> 37 files passed, 923 tests passed.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- `AppShell.tsx` now has the sidebar and main panes only. The viewer panel and the `app-shell-last-viewer-width` saved-layout code are removed.
- `Viewer.tsx` is deleted. Imports and code orphaned by the removal were dropped.
- `test/unit/renderer-appshell.test.tsx` covers the two-pane layout. The docked-viewer tests are removed from `renderer-shell.test.tsx`.
- `e2e/app.spec.ts` locators use the Quick Look dialog and Escape. e2e was not run.

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
  - RED: the AppShell and Shell tests were changed before the production edits; the exact failure text was not kept in notes before the context was compacted.
  - GREEN: `pnpm test --maxWorkers=2` -> 37 files passed, 923 tests passed. `pnpm typecheck` exit 0. `pnpm lint` exit 0 (1 info). `pnpm build` exit 0.
- `grep -rn "Object preview\|app-shell-last-viewer-width" src test e2e` prints nothing. `Viewer.tsx` does not exist.
- Root cause (bugfix only): none

## Coordinator fix after e2e

- e2e failed: `getByRole("dialog", { name: /Quick Look faststart\.mp4/ })` found no dialog. In Chromium, Base UI `Dialog.Title` sets `aria-labelledby` on the popup, and that overrides `aria-label`, so the accessible name is the file name alone.
- Fix: removed the overridden `aria-label` from `QuickLook.tsx`. The e2e locator is now `{ name: "faststart.mp4" }`. The unit tests now read the name through `aria-labelledby` instead of the raw `aria-label` attribute.
- After the fix: typecheck 0, lint 0, test 37 files and 923 passed, build 0, e2e 1 passed.
- One unit run reported an unhandled `ReferenceError: window is not defined` from a Sonner timer after teardown in `renderer-toasts-dom.test.tsx`. That file is unchanged in this phase. The rerun was clean, so this is logged as a load flake.

## FIX-1

Source: quality review 7205eae1 (PASS_WITH_DEBT). Finding 6 accepted, unchanged.

### Decisions made
- Finding 1: `useSettledTarget` in `QuickLook.tsx` now settles the first target at once when nothing is settled (`if (target && settled === null) setSettled(target)` during render). Later changes still debounce by 120 ms.
- Finding 2: `QuickLook` renders `MediaView` only while `open`, so media pauses and unloads when `open` turns false, before the exit transition ends.
- Finding 3: Space closes Quick Look even when a video or audio element has focus, as Finder does (Coordinator decision). `TYPING_TARGET` no longer lists VIDEO and AUDIO. A new `MEDIA_TARGET` keeps arrow keys from navigating while a media element has focus, so seeking still works.
- Finding 4: added a `renderer-shell.test.tsx` case with the real `ObjectTable`: Space opens Quick Look on `a.png`, ArrowRight, Escape, then `b.png` is `aria-selected` and focused.
- Finding 5: the three repeated error boxes are now one local `ErrorAlert` component in `QuickLook.tsx`.

### Spec deviations
- `QuickLook` composes the Base UI Dialog parts directly (Root, Portal, Backdrop, Popup, Title, Close) and imports only `useFinalFocus` from `ui/dialog.tsx`. It does not use the `ui/dialog.tsx` wrapper. Reason: the wrapper's popup is a small centered dialog, and Quick Look needs a large popup, its own z-index container, custom enter and exit classes, `initialFocus` on the popup and a `finalFocus` that returns to the current grid row. Overriding all of that through the wrapper would cost more than composing the parts. Focus restoration still shares the wrapper's `useFinalFocus`.

### Tradeoffs accepted
- Space on a focused video or audio element no longer toggles playback. Users start and pause with the media controls or by clicking.

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- RED (before the fixes, `pnpm test --maxWorkers=2 test/unit/renderer-quicklook.test.tsx`):
  - Finding 1, "debounces arrows pressed within 120 ms of opening, after settling the opened target at once": `AssertionError: expected "vi.fn()" to be called 2 times, but got 4 times`.
  - Finding 3, "closes on Space even when the video element has focus, like Finder": `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`.
  - Finding 2, "pauses and unloads media as soon as Quick Look closes, without waiting for the exit transition": `AssertionError: expected "vi.fn()" to be called at least once` at `expect(pause).toHaveBeenCalled()`. The test holds the exit transition open by stubbing `Element.prototype.getAnimations`; without that stub the first draft passed, because jsdom unmounts the popup at once.
  - Finding 4: no RED. The wiring already worked and the test adds coverage. Mutation check: deleting the `dispatchSelection` call in `Shell.tsx` `handleQuickLookNavigate` fails the test with `expected 'false' to be 'true'`. The line was restored.
  - Finding 5: refactor, covered by the existing error tests.
- GREEN: `pnpm test --maxWorkers=2` -> 37 files, 927 tests passed (923 before, plus 4 new). `pnpm typecheck` exit 0. `pnpm lint` exit 0 (1 info, the Biome config migration notice). `pnpm build` exit 0.
- The existing test "ignores arrow keys and Space typed into a form control" no longer asserts that Space is ignored on a video element; it is renamed to say Space in a text field, and the video Space case moved to the new test.
- Root cause (bugfix only): Finding 1: the settled state started as null on every open, so the debounce effect never produced a settled value until 120 ms passed without an arrow key.
