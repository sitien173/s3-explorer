<!-- refract-shared-version: 2.5.0 -->

# Phase 8 — Decision Notes

## Task 1

### Decisions made
- Exported `MAX_HANDLES = 1024` from `src/main/stream/handles.ts`.
- Implemented LRU eviction using ES6 Map insertion order in `HandleRegistry`: calling `get(handle)` or receiving a dedupe hit in `create(target)` touches the entry by deleting and re-inserting it at the end of `targetsByHandle` and `handlesByTarget`. When capacity exceeds 1,024, the oldest entry is evicted from both maps.
- Added integration test in `test/integration/proxy.test.ts` asserting that an evicted handle returns 403 ("Forbidden") with `access-control-allow-origin: null` and `x-content-type-options: nosniff`.

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
  - RED: `pnpm vitest run test/unit/handles.test.ts` -> `AssertionError: expected 1025 to be 1024` (4 failed, 14 passed)
  - GREEN: `pnpm vitest run test/unit/handles.test.ts` -> `Test Files 1 passed (1), Tests 18 passed (18)`
  - Integration: `pnpm test:integration` -> `Test Files 8 passed (8), Tests 29 passed (29)`
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Resolved debt D-P4 by updating `invalidateKeys` in `src/renderer/src/queries.ts` to call `queryClient.resetQueries({ queryKey })` followed by `queryClient.invalidateQueries({ queryKey, refetchType: "none" })` for object-list keys (`key.length >= 2 && key[1] === "objects"`). Chosen over `maxPages` because `resetQueries` cleanly resets the paged listing to only the first page upon mutations without truncating older pages while a user actively scrolls.
- Resolved debt D-P1-Q5 in `test/unit/renderer-object-table.test.tsx` by adding an assertion that mounted row count at 1200 px is strictly greater than at 400 px.
- Built `src/renderer/src/components/ObjectGrid.tsx` with row-by-row virtualization over N column lanes (`CELL_WIDTH = 120`, `CELL_HEIGHT = 120`, `GRID_OVERSCAN_ROWS = 1`), satisfying DESIGN.md Invariant 5 (`(ceil(viewportHeight / cellHeight) + 2 * gridOverscanRows) * columns`). Added unit tests verifying viewport bounds at 400 px and 1200 px and confirming 1200 px mounts more cells than 400 px.
- Reused Finder key map, selection model, context menu, and accessibility (`role="grid"`, `aria-multiselectable="true"`, `role="row"`, `role="gridcell"`) in `ObjectGrid`, supporting ArrowLeft/Right by one cell and ArrowUp/Down by one row of columns.
- Added `viewMode: "list" | "grid"` and `setViewMode` to `src/renderer/src/store.ts` using zustand `persist` middleware with `partialize` (persisting only `viewMode` under key `"s3-view-mode"`). Handled corrupted and invalid stored values via `merge` falling back to `"list"`.
- Added segmented control toggle in `src/renderer/src/components/Toolbar.tsx` with `List` and `LayoutGrid` icons, `aria-pressed`, and tooltips ("List view" and "Grid view").
- Updated `src/renderer/src/Shell.tsx` to read `viewMode` from `useShellStore`, wire the toolbar toggle, and render `ObjectGrid` or `ObjectTable` accordingly.

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
  - RED: `pnpm vitest run test/unit/renderer-queries.test.tsx` -> `AssertionError: expected [ undefined, 't1', 't2' ] to deeply equal [ undefined ]` (1 failed, 22 passed)
  - GREEN: `pnpm vitest run test/unit/renderer-queries.test.tsx` -> `Test Files 1 passed (1), Tests 23 passed (23)`
  - RED: `pnpm vitest run test/unit/renderer-store.test.ts` -> `AssertionError: expected undefined to be 'list'` (4 failed, 10 passed)
  - GREEN: `pnpm vitest run test/unit/renderer-store.test.ts` -> `Test Files 1 passed (1), Tests 14 passed (14)`
  - RED: `pnpm vitest run test/unit/renderer-shell.test.tsx -t "renders the view mode segmented toggle"` -> `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "List view"` (1 failed, 23 skipped)
  - GREEN: `pnpm vitest run test/unit/renderer-shell.test.tsx -t "renders the view mode segmented toggle"` -> `Test Files 1 passed (1), Tests 1 passed | 23 skipped`
  - RED: `pnpm vitest run test/unit/renderer-object-grid.test.tsx` -> `AssertionError: expected "vi.fn()" to be called at least once` (9 failed)
  - GREEN: `pnpm vitest run test/unit/renderer-object-grid.test.tsx` -> `Test Files 1 passed (1), Tests 9 passed (9)`
  - Table bound check (D-P1-Q5): `pnpm vitest run test/unit/renderer-object-table.test.tsx` -> `Test Files 1 passed (1), Tests 26 passed (26)`
  - Shell viewMode switching: `pnpm vitest run test/unit/renderer-shell.test.tsx` -> `Test Files 1 passed (1), Tests 25 passed (25)`
- Root cause (bugfix only): none

## Task 3

### Decisions made
- Implemented `ThumbnailScheduler` and `useThumbnailScheduler` in `src/renderer/src/thumbnails.ts` enforcing:
  - At most 4 concurrent requests in flight (`THUMBNAIL_CONCURRENCY = 4`), counting both `stream.open` and `loadImage` until onload or onerror.
  - 150 ms scroll idle delay (`SCROLL_IDLE_DELAY_MS = 150`) resetting on scroll events via `onScroll()`.
  - Scheduling restricted strictly to visible rows (excluding overscan rows calculated by `virtualRow.start + virtualRow.size > scrollTop && virtualRow.start < scrollTop + clientHeight`).
  - Filtering with `isEligibleThumbnail`: only S3 object rows with `size !== undefined && size <= MAX_THUMBNAIL_SIZE_BYTES` (5 MiB) and `mediaKind("", row.key) === "image"`.
  - Media playback pausing via `isQuickLookPlayingMedia(viewerTarget)`: pauses when Quick Look plays video or audio (`kind === "video" || kind === "audio"`), and automatically resumes when closed or switched to non-media.
  - Failure handling: on stream/load error, row status transitions to `error`, showing the `FileText` type icon with no retry and no toast.
  - Cancellation: pending work, timers, and in-flight responses are cancelled on component unmount or prefix change.
- Wired `useThumbnailScheduler` into `ObjectGrid.tsx`, rendering `<img loading="lazy" decoding="async" alt="" src={thumbnail.url} className="size-16 object-contain rounded-control" />` on loaded thumbnails and falling back to type icons on idle, loading, or error.
- Added e2e grid toggle step in `e2e/app.spec.ts` navigating to "Grid view", verifying the seeded object's `gridcell` is visible, and returning to "List view". As noted in prompt instructions, the e2e seed fixture contains only `seeded/faststart.mp4` (video) without image objects, so the `127.0.0.1` image src check was omitted and documented here.

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
  - RED: `pnpm vitest run test/unit/renderer-thumbnails.test.ts` -> `AssertionError: expected "vi.fn()" to be called 4 times, but got 0 times` (7 failed, 2 passed)
  - GREEN: `pnpm vitest run test/unit/renderer-thumbnails.test.ts` -> `Test Files 1 passed (1), Tests 10 passed (10)`
  - Grid Thumbnail unit test: `pnpm vitest run test/unit/renderer-object-grid.test.tsx` -> `Test Files 1 passed (1), Tests 10 passed (10)`
  - Full unit test suite: `pnpm test --maxWorkers=2` -> `Test Files 40 passed (40), Tests 979 passed (979)`
- Root cause (bugfix only): none

## FIX-1

### Decisions made
- Finding 1: Updated `invalidateKeys` in `src/renderer/src/queries.ts` for object-list keys to use `queryClient.setQueriesData` to trim `InfiniteData` to page 1 (`pages.slice(0, 1)`, `pageParams.slice(0, 1)`) without calling `resetQueries`, followed by a standard `invalidateQueries({ queryKey })`. Removed redundant `refetchType: "none"`. Added test in `test/unit/renderer-queries.test.tsx` verifying data stays rendered and `isLoading` remains false during invalidation while preserving the 3-page refetch test.
- Finding 2: Extracted shared listing and browser logic into reusable modules:
  - `src/renderer/src/useObjectListing.ts`: shared infinite listing, folder/object derivation, pagination status, error parsing, and filter/scope reset.
  - `src/renderer/src/useBrowserSelection.ts`: shared selection state, selection pruning, arrow navigation with configurable `moveDelta` (`moveDelta: { up: -1, down: 1 }` in Table, `{ up: -columns, down: columns, left: -1, right: 1 }` in Grid), shortcut dispatch, Quick Look trigger, and context menu dispatch.
  - `src/renderer/src/components/ObjectContextMenuItems.tsx`: shared context menu items for single objects, single folders, and multi-selection delete.
  - `src/renderer/src/components/ObjectListingFallbacks.tsx`: shared `ObjectAccessDenied` and `ObjectSsoFallback` components.
  - Refactored `ObjectTable.tsx` and `ObjectGrid.tsx` to consume the extracted modules with identical behavior.
- Finding 3: In `src/renderer/src/thumbnails.ts`, tracked generation counter and total active in-flight request count (`pendingCount`). A request counts toward `THUMBNAIL_CONCURRENCY = 4` until its promise settles in `finally`, even across `cancelAll`. Guarded `finally` so settled promises from stale generations do not mutate current generation state or in-flight keys. Added test verifying at most 4 requests are pending after cancel and reschedule.
- Finding 4: In `useThumbnailScheduler`, cleared React state `thumbnails` on scheduler recreation, and cleared scheduler state in `cancelAll`. In `Shell.tsx`, set `key={`${connectionId}/${bucket}/${prefix}`}` on `ObjectGrid`. Added test verifying switching buckets with the same object key displays no stale image.
- Finding 5: In `ObjectGrid.tsx`, added `onError` to `<img>` calling `markThumbnailError(row.key)` so failed image loads switch to the type icon. In `defaultLoadImage`, wired `AbortSignal` to clear `img.src = ""` and remove event listeners on cancel. Added unit test for `defaultLoadImage`.
- Finding 6: In `ObjectGrid.tsx`, subtracted horizontal padding (`- 24`) from container width when deriving column count. Wired `ResizeObserver` through a callback ref on the scroll container so it attaches even when initial render is an error branch.
- Finding 7: In `ObjectGrid.tsx`, accounted for the 12 px top padding in `trulyVisibleRows` (`virtualRow.start + virtualRow.size + 12 > scrollTop && virtualRow.start + 12 < scrollTop + clientHeight`), memoized rows on the visible key string, and prevented redundant scheduler resets when visible keys remain unchanged. Added test verifying keys in overscan rows are never passed to `openStream`.
- Finding 8: In `src/main/stream/proxy.ts`, checked request method, handle presence, and token validation before calling `options.registry.get(handle)`, preventing unauthenticated requests from touching the LRU registry. Verified with existing proxy unit tests and integration tests.
- Finding 9: In `ObjectGrid.tsx`, added `getMediaIcon(key)` using `mediaKind("", key)` to render `FileImage`, `FileVideo`, `FileAudio`, and `FileText` when thumbnail is unavailable or fails. Added test verifying error fallback renders mediaKind icon.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- none

### Test evidence
- Unit: `pnpm test --maxWorkers=2` -> 40 test files passed, 985 passed
- Integration: `pnpm test:integration` (RustFS up) -> 8 test files passed, 29 passed
- Typecheck: `pnpm typecheck` -> exit 0
- Lint: `pnpm lint` -> exit 0 (1 known deprecated config info)
- Build: `pnpm build` -> exit 0

