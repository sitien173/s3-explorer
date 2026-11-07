<!-- refract-shared-version: 2.5.0 -->

# Phase 8 — Journal: Grid view, thumbnails, and handle LRU

<!--
Phase Journal template. Copy to docs/plans/ui-stack-refactor/phase-08/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-stack-refactor/PLAN.md
- Implementation Profile: balanced
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: n/a
- Review Job: n/a
- Started: 2026-11-08T01:42:34+07:00
- Finished: 2026-11-08T02:54:00+07:00

## Implementation Response

# EXTERNAL RESPONSE
## META
- Phase: 8 (Job A: Tasks 1 and 2)
- Started: 2026-11-08T01:42:34+07:00
- Finished: 2026-11-08T02:54:00+07:00
- Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Implemented HandleRegistry 1,024-entry LRU eviction with proxy 403 handling, built virtualized ObjectGrid with persistent viewMode toggle, and resolved debts D-P1-Q5 and D-P4.
## FILES MODIFIED
| Action | Path | Change |
| Modify | src/main/stream/handles.ts | Export MAX_HANDLES and implement 1,024-entry LRU eviction and touch logic |
| Modify | test/unit/handles.test.ts | Add unit tests for capacity, LRU eviction, touch on get/dedupe, and new handle on recreate |
| Modify | test/integration/proxy.test.ts | Add integration test verifying 403 on LRU-evicted handle |
| Create | src/renderer/src/components/ObjectGrid.tsx | Virtualized grid view with Finder keys, selection, context menu, and accessibility |
| Create | test/unit/renderer-object-grid.test.tsx | Unit tests for viewport bounds at 400px/1200px, keys, selection, and context menu |
| Modify | src/renderer/src/components/Toolbar.tsx | Add segmented view mode toggle with aria-pressed, tooltips, and icons |
| Modify | src/renderer/src/Shell.tsx | Connect viewMode store state, toggle in Toolbar, and render ObjectGrid or ObjectTable |
| Modify | src/renderer/src/store.ts | Add viewMode state with zustand persist middleware, partialize, and list fallback |
| Modify | test/unit/renderer-store.test.ts | Add round trip and invalid-value fallback tests for viewMode |
| Modify | src/renderer/src/queries.ts | Resolve debt D-P4 by resetting object-list queries on mutation invalidation |
| Modify | test/unit/renderer-queries.test.tsx | Add unit test verifying 3-page listing refetches only first page on invalidation |
| Modify | test/unit/renderer-object-table.test.tsx | Resolve debt D-P1-Q5 asserting 1200px mounts more rows than 400px |
| Modify | test/unit/renderer-shell.test.tsx | Add unit test for toolbar segmented toggle and Shell switching between table and grid |
| Modify | docs/plans/ui-stack-refactor/phase-08/notes.md | Add Task 1 and Task 2 decision notes and test evidence |
| Modify | docs/plans/ui-stack-refactor/phase-08/journal.md | Update metadata and record implementation response |
## NOTES
- docs/plans/ui-stack-refactor/phase-08/notes.md (## Task 1, ## Task 2)
- Fresh verification checks: typecheck passed, lint passed, unit tests 39 files / 968 passed, build passed, integration tests 8 files / 29 passed.
## SPEC COMPLIANCE
- Meets Spec? YES — All Task 1 and Task 2 criteria met with behavioral RED->GREEN evidence, Invariants 2 and 5 verified, and debts D-P1-Q5 and D-P4 resolved.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

Phase 8 completed. Journal: docs/plans/ui-stack-refactor/phase-08/journal.md.

# EXTERNAL RESPONSE
## META
- Phase: 8 (Job B: Task 3)
- Started: 2026-11-08T02:32:00+07:00
- Finished: 2026-11-08T02:54:00+07:00
- Plan dir: docs/plans/ui-stack-refactor
## SUMMARY
Implemented thumbnail scheduler with 4-request concurrency, 150 ms scroll idle delay, Quick Look media pause/resume, and lazy decoding img tags in ObjectGrid.
## FILES MODIFIED
| Action | Path | Change |
| Create | src/renderer/src/thumbnails.ts | ThumbnailScheduler, useThumbnailScheduler hook, eligibility and media predicates |
| Create | test/unit/renderer-thumbnails.test.ts | Unit tests with fake timers for concurrency, idle delay, visibility, predicates, pause, error, and cancel |
| Modify | src/renderer/src/components/ObjectGrid.tsx | Wire thumbnail scheduler into visible cells, render lazy/async img tags, and handle scroll idle |
| Modify | test/unit/renderer-object-grid.test.tsx | Add unit test verifying thumbnail img element attributes when loaded |
| Modify | e2e/app.spec.ts | Add grid view toggle and cell visibility assertions |
| Modify | tsconfig.node.json | Add mediaKind.ts and thumbnails.ts to includes |
| Modify | docs/plans/ui-stack-refactor/phase-08/notes.md | Append Task 3 decisions and RED->GREEN test evidence |
| Modify | docs/plans/ui-stack-refactor/phase-08/journal.md | Update metadata and record Task 3 external response |
## NOTES
- docs/plans/ui-stack-refactor/phase-08/notes.md (## Task 3)
- Fresh verification checks: typecheck passed (0 errors), lint passed (0 errors), unit tests passed (40 files, 979 passed), build passed (exit 0).
## SPEC COMPLIANCE
- Meets Spec? YES — All Task 3 requirements satisfied with behavioral RED->GREEN test evidence, fake timer coverage, no extra dependencies, no color literals, and clean build/typecheck/lint.
## CLARIFICATIONS NEEDED
None
## NEXT
TASK_COMPLETE

Phase 8 completed. Journal: docs/plans/ui-stack-refactor/phase-08/journal.md.

## Quality Review

### Review f2e2aa2e (balanced) on 2e472fe..f5e3ae8

**Status: FAIL**

I read the code and the diff only. I did not run any tests. Claims that start with "Inferred" come from reading code, not from running it.

## Findings

**1. Blocking. D-P4 blanks the list after every mutation.** `src/renderer/src/queries.ts:139-143`
- Fact: `resetQueries` sets the active listing's data back to `undefined`. `ObjectTable.tsx:93` and `ObjectGrid.tsx:91` then see `isLoading` and render the skeleton.
- Fact: `Shell.tsx:365` calls `invalidateKeys` once for each completed upload. A 20-file upload therefore shows the skeleton up to 20 times.
- Inferred: scroll position resets to 0. The selection-prune effect at `ObjectGrid.tsx:230` then drops any selected keys that sit beyond page 1.
- Fact: the extra `invalidateQueries({refetchType:"none"})` call does nothing useful. Worse, it marks the data that was just fetched as stale. When the user toggles between list and grid, the newly mounted view refetches every loaded page, which is the exact D-P4 problem.
- Fact: for `deleteBucket`, `bucketObjects` matches `isObjectListKey`, so the bucket's listings are reset. That is acceptable. `deleteConnection` passes `[connectionId]`, so it still refetches all loaded pages. That is minor.
- `maxPages` would limit how far the user can scroll, so it is not a good option.
- Fix: trim the cached data to the first page, then invalidate normally. The current rows stay on screen and only page 1 refetches, in the background.
  ```ts
  queryClient.setQueriesData<InfiniteData<ObjectsPage, string | undefined>>({ queryKey }, (d) =>
    d && { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) });
  return queryClient.invalidateQueries({ queryKey });
  ```
  Keep the 3-page test. Add a test that `isLoading` stays false during the invalidation.

**2. Blocking. Nothing was extracted, so ObjectGrid copies ObjectTable.** `src/renderer/src/components/ObjectGrid.tsx:87-330, 380-430, 640-688`
- The spec says to extract shared hooks or helpers rather than duplicate them.
- Copied code: the listing and error derivation, scope reset, selection pruning, most of the key handler, context-menu dispatch, the menu content, the access-denied and SSO branches, and the toolbar filter.
- Fix: create `useObjectListing(scope)` for the listing, error and scope-reset logic. Create `useBrowserSelection` for pruning, `updateSelection` and the shared key actions; it should take `moveDelta` per arrow key so the grid can move by `columns`. Create a shared `<ObjectContextMenuItems>` component.

**3. Blocking. More than 4 thumbnail requests can be in flight.** `src/renderer/src/thumbnails.ts:101-110`
- `cancelAll` clears `inFlight` while the earlier `openStream` and image loads are still running.
- After a prefix change, `pump` starts 4 new requests next to the 4 old ones, so up to 8 run at once.
- If a key restarts before its old request settles, the old `finally` block at :195-196 deletes the new request's `inFlight` entry and its cancel flag. The count is then wrong.
- Fix: track generations. Keep `inFlight` until each promise settles, and have the `finally` block ignore results from an older generation. Add a test for this: cancel, then reschedule, then assert at most 4 are pending.

**4. Non-blocking, but needs fixing. Thumbnail state goes stale.** `thumbnails.ts:222-245`
- Inferred: when the bucket changes and the prefix stays `""`, `thumbnails` is not cleared. Shell does not set `key` on ObjectGrid. Objects with the same key can show the previous bucket's image until the new scheduler first reports a state change.
- Inferred: on a prefix change, `setThumbnails({})` runs, but `scheduler.state` keeps `loaded`. When the user goes back to a folder where every thumbnail had loaded, the cells show icons.
- Fix: clear React state in the scheduler-creation effect. Reset `this.state` in `cancelAll`.

**5. Non-blocking, but needs fixing. An evicted or stale thumbnail URL shows a broken image.** `ObjectGrid.tsx:606`
- Fact: the proxy sends `Cache-Control: no-store` (`proxy.ts:31`).
- Inferred: each thumbnail is fetched twice, once by `defaultLoadImage` and once by `<img>`. When a virtualized cell remounts, it fetches again, and that request does not count toward the budget. After 1,024 or more newer handles, a remounted cell gets a 403 and the browser's broken-image glyph appears.
- Fix: add `onError` to the `<img>` that marks the key as `error`, so the icon shows. Optionally clear `img.src` in `defaultLoadImage` on cancel so the load stops.
- Quick Look's cached `streamOpenQuery` URL can also go stale. The existing single retry after a 403 covers that.

**6. Non-blocking. Column count ignores padding.** `ObjectGrid.tsx:128`
- `clientWidth` includes the `p-3` padding. For example, at width 730 the grid gets 6 columns, which need 744 px and cause horizontal overflow.
- The resize effect runs only once, with `[]`. If the first render is the access-denied branch, the ResizeObserver is never attached.
- Fix: use `clientWidth - 24`, and attach the observer through a callback ref.

**7. Non-blocking. `trulyVisibleRows` ignores padding.** `ObjectGrid.tsx:177-180`
- It reads `scrollTop` during render and ignores the 12 px top padding. It also builds a new array on every render, which reschedules the idle timer each time.
- The "visible only" test covers only the scheduler, not this calculation.
- Fix: offset by the padding, memoize on the visible key string, and add a grid test that overscan rows are never passed to `openStream`.

**8. Non-blocking. Unauthenticated requests can keep handles alive.** `proxy.ts:624`
- `registry.get` runs before the token check, and `get` now touches the entry.
- Fix: check the token before calling `get`.

**9. Non-blocking. Images that fail always show a generic icon.** `ObjectGrid.tsx:614`
- Every file uses `FileText`, so a failed thumbnail does not show its type icon.
- Fix: choose the icon with `mediaKind`.

## Verified

1. `handles.ts`:
   - Eviction removes the entry from both maps.
   - The size check `>=` runs before insert, so the registry never exceeds 1,024.
   - `get` and a dedupe hit both touch the entry by delete and re-set.
   - The handle format is unchanged.
   - Invariant 2 holds: an evicted handle gets 403 through the existing `!target` branch.
   - A Range request calls `get` and touches its handle. An in-flight stream keeps the target it resolved when the request started.
   - Thumbnails pause whenever the Quick Look target is video or audio, so a playing video is not evicted by thumbnails.
2. The unit tests would fail on a regression in capacity, touch on `get`, touch on dedupe, or re-creation. The integration test gets 206 first, then 403 after `MAX_HANDLES` inserts, so the 403 really comes from eviction.
3. The grid bound tests:
   - They use 10,000 objects at 400 and 1200 px against `(ceil(h/120)+2*1)*cols`.
   - They check that 10,000 and 1,000 objects mount the same count.
   - The 1200 px count is greater than the 400 px count for both the grid and the table.
4. Arrow keys move ±1 and ±`columns` through `selectionReducer`. Page Up and Page Down move by `columns*rows`. The grid has `role="grid"`, rows and gridcells, `aria-activedescendant` and `aria-selected`, so the `useFinalFocus` fallback still finds it.
5. Thumbnail eligibility:
   - One helper, `isEligibleThumbnail`, uses `mediaKind`.
   - The size limit is 5 MiB or less.
   - The idle delay is 150 ms and scrolling resets it.
   - Failures show no toast and do not retry.
   - The `destroyed` guard prevents setState after unmount.
   - The `<img>` uses `lazy`, `async` and `alt=""`.
6. The store:
   - It persists only `viewMode` under `s3-view-mode`.
   - `merge` falls back to `"list"` for invalid values and corrupt JSON.
   - `reset` is used only in tests.
7. The toolbar toggle has `aria-pressed`, the names "List view" and "Grid view", and tooltips.
8. The grid uses tokens only, with no color literals. The spinner uses `motion-reduce`.


### Re-review 33df1e79 (cc/claude-opus-medium) on f5e3ae8..9daaa10

**Status: PASS_WITH_DEBT**

All three blocking findings are fixed, and each fix has a test that would fail if it regressed. Three non-blocking issues are new. I read the code and the diff only; I did not run anything. Claims marked "Inferred" come from reading code, not from running it.

## Original findings

1. **Resolved.** `queries.ts:144-150` now trims the listing to page 1 and calls a plain invalidate; the redundant `refetchType:"none"` call is gone. The new test shows `isLoading` stays false and the old rows stay on screen during the refetch. The 3-page test still checks that only page 1 refetches. For `deleteBucket`, all listings in the bucket are trimmed and then refetched, which is fine.
2. **Resolved.** The shared logic now lives in `useObjectListing.ts`, `useBrowserSelection.ts`, `ObjectContextMenuItems.tsx` and `ObjectListingFallbacks.tsx`, and both views use them. The table tests are byte-identical to before (checked with `git diff --quiet`).
3. **Resolved.** `pendingCount` now goes down only when a request settles, and results from an older generation are ignored. The new test cancels, reschedules, and checks that no more than 4 requests are pending.
4. **Resolved, but the fix causes the new finding 10.** Bucket changes are covered: the scheduler-creation effect clears state, `cancelAll` resets `this.state`, and Shell now keys ObjectGrid by scope. The test uses a keyed wrapper, so it proves the key approach works.
5. **Partly resolved.** The `<img>` now has `onError`, and `defaultLoadImage` aborts through a signal; the abort is tested. The remaining gap is new finding 11.
6. **Resolved.** The column count now subtracts the 24 px padding. A callback ref attaches the ResizeObserver and disconnects the previous one when the node changes.
7. **Resolved.** The visibility check adds the 12 px padding, and rows are memoized on the visible-key string. A new grid test asserts that keys in overscan rows never reach `openStream`.
8. **Resolved.** `proxy.ts:624-632` checks the method, handle and `tokenMatches` before `registry.get`. Every failure still returns the same 403 "Forbidden" through `sendFixed`, the same constant-time `tokenMatches` comparison runs first, and the 29/29 integration run passes.
9. **Resolved.** `getMediaIcon` uses `mediaKind` (`ObjectGrid.tsx:47`), and a test covers the error fallback.

## Regression checks

- **Table:**
  - Arrow keys, Shift-extend and Home/End match the old code.
  - Page Up/Down moves by ±`visibleRowCount`, the same as the old `page:true` path.
  - Quick Look, Enter and the context-menu target match the old code.
  - The one difference is new finding 12.
- **Focus restore:** `useFinalFocus` (`ui/dialog.tsx:16-25`) looks up `[role="grid"]` when the dialog closes, so it finds the remounted grid. The fallback still works.
- **Hygiene:** no color literals in the new files, and no orphaned code. The `getItemElement` and `containerRef` options are used.

## New findings

10. **Non-blocking. A keyboard user loses focus when opening a folder in the grid.** `Shell.tsx:784`
    - Inferred: the key changes on every prefix change, so pressing Enter on a folder unmounts the focused grid and focus drops to `body`. The table is not keyed and keeps focus, so the two views now behave differently.
    - Fix: key only on `${connectionId}/${bucket}`. The hook's prefix effect already cancels work and clears state when only the prefix changes. Alternatively, keep the key and focus the grid on mount when `document.activeElement === document.body`.
11. **Non-blocking. `markThumbnailError` updates only React state.** `thumbnails.ts:315`
    - Inferred: the scheduler still records the key as `loaded`. The next state change from the scheduler (`setThumbnails({...nextState})`) puts back the evicted URL, the `<img>` remounts, gets a 403 and fires `onError` again. The cell would flicker each time another thumbnail finishes.
    - Fix: add `scheduler.markError(key)`, which sets `this.state[key] = {status:"error"}` and calls `onStateChange`, and call it from the hook. Add a test where one `onError` is followed by another thumbnail loading, and check that the first cell keeps the icon.
12. **Non-blocking, trivial. Alt+ArrowDown behaves differently.** `useBrowserSelection.ts`, around the `!altKey` arrow branch
    - Before, Alt+ArrowDown went through `keyboardAction` as `move-down`. Now it reaches `keyboardAction` as `move-down`, which no branch handles, so it falls through to `onGridAction("move-down")` and `onShortcut("move-down")`.
    - Fix: drop the `!altKey` guard for ArrowDown, or map `move-*` and `extend-*` actions to the same move path.
13. **Low.** `thumbnails.ts:228`
    - In the `finally` block, `controllers.delete(key)` can delete the controller of a newer request for the same key. A later cancel then cannot abort that image load.
    - Inferred: this is hard to reach now that the grid remounts on prefix change.
    - Fix: delete only if `this.controllers.get(key) === controller`.

### Coordinator fixes 09a648c

- F10: ObjectGrid keyed on connection/bucket only, so Enter on a folder keeps grid focus; prefix effect still cancels and clears thumbnails.
- F11: ThumbnailScheduler.markError owns error state; hook delegates. Test: error survives a later thumbnail load.
- F12: Alt+ArrowDown moves like ArrowDown again; only Alt+ArrowUp goes to parent.
- F13: finally deletes the controller only when it is still the same instance.
- Checks at 09a648c: typecheck 0, lint 0, test 40 files 986/986, build 0, e2e 1 passed. Integration 29/29 at 9daaa10 (src/main unchanged since).

## Review Result

- Spec Status: PASS (acceptance: grid bound tests at 400/1200 px with 10,000 objects, at most 4 thumbnail requests in flight, viewMode persisted in localStorage, 1,025th handle evicts LRU with proxy 403; integration 29/29)
- Quality Status: FAIL f2e2aa2e (3 blocking) -> FIX-1 c5f5c990 9daaa10 -> PASS_WITH_DEBT 33df1e79 -> Coordinator fixed F10-F13 at 09a648c. Final: PASS
- Debt: none new; D-P1-Q5 and D-P4 resolved

## Final Checkpoint

- Phase base ref: refs/plans/ui-stack-refactor/phase-08/base
- Phase implementation ref: refs/plans/ui-stack-refactor/phase-08/impl
- Plan commit ref: refs/plans/ui-stack-refactor/impl
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.
