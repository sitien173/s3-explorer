<!-- refract-shared-version: 2.5.0 -->

# Phase 4 — Decision Notes

<!--
Worker Notes template. Copy to docs/plans/ui-stack-refactor/phase-04/notes.md, fill the
heading, then append one `## Task 1

### Decisions made
- Key roots: `["connections"]` and `["profiles"]` for channels without a connection id; every other key starts with the connection id (`[id, "buckets"]`, `[id, "objects", bucket, prefix]`, `[id, "countPrefix", bucket, prefix]`, `[id, "stream", bucket, key]`).
- Read channels covered: connections list, listProfiles, bucketsList, objectsList (infinite, `nextToken` as page param), opsCountPrefix, streamOpen (`staleTime: Infinity`). `streamOpenUrl` is not a query because each call creates a new proxy handle.
- `invalidations` returns exact `QueryKey[]` per mutation; `invalidateKeys(queryClient, keys)` applies them. Object mutations target parent listings only, so unrelated prefixes, buckets, and connections stay fresh.
- `createQueryClient()` sets `retry: false` and `refetchOnWindowFocus: false` because IPC errors carry codes the UI handles itself.
- pnpm added `@tanstack/query-core@5.107.1`, `@tanstack/react-query@5.107.1`, and `zustand@5.1.0` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Kept as instructed.

### Spec deviations
- none

### Tradeoffs accepted
- Deleting a prefix invalidates the parent listing and prefix counts, not cached listings nested under the deleted prefix. Those use default `staleTime: 0`, so they refetch on next mount.

### Assumptions
- `api.ts` does not accept an abort signal, so query functions ignore `signal`.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/renderer-queries.test.tsx` (inert stub) -> 21 failed, e.g. `parentPrefix` returned "x", `queryKeys.objectList` returned `[]`, `invalidations.createBucket is not a function`.
  - GREEN: `pnpm test --maxWorkers=2 test/unit/renderer-queries.test.tsx test/unit/renderer-store.test.ts` -> 32 passed.

## Task 2

### Decisions made
- Store holds location (`connectionId`, `bucket`, `prefix`), `selection` (existing `SelectionState` through `selectionReducer`), `viewerTarget`, one `dialog` union, and `transfersOpen`. Only ids are stored: the connection dialog keeps `editingId`, not the connection object.
- `selectConnection`, `selectBucket`, and `navigate` clear selection and viewer, matching `handleSelectConnection`, `handleSelectBucket`, and `handleNavigate` in `App.tsx`. Search state is not in the store; Job B decides where it lives.
- `setViewerTarget` accepts an updater, because `App.tsx` already calls it with one.
- Operation report content is not in the store, only the `report` dialog kind.
- `store.ts` has one `@ts-ignore` on the `Viewer` type import: the node test project type-checks `store.ts` without `--jsx`. Same pattern as `selection.test.ts`. `tsconfig*.json` is outside the allowed files.

### Spec deviations
- none

### Tradeoffs accepted
- A single `dialog` slot means opening a dialog replaces an open one. The old code used separate flags that could in theory overlap.

### Assumptions
- Bucket dialogs (add, create, delete) stay local to `Sidebar`; the spec lists no store field for them.

### Follow-ups for human
- Job B must keep `selectedRowsRef` (row lookup by key) outside the store, since rows are server data.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm test --maxWorkers=2 test/unit/renderer-store.test.ts` (no-op actions) -> 7 failed, 3 passed, e.g. `expected null to equal { kind: "rename" }`.
  - GREEN: same command -> 10 passed.
- Phase checks after both tasks: `pnpm typecheck` 0; `pnpm lint` 0 (one pre-existing Biome deprecation info); `pnpm test --maxWorkers=2` 34 files, 884 passed; `pnpm build` 0. e2e not run.

## Task 3
### Decisions made
- `Shell.tsx` holds the former `App` body; `App.tsx` keeps the provider, toaster and re-exports so existing imports and tests keep working.
- `refreshKey` and `refreshTrigger` props and the refresh counter are gone. Mutations call `invalidateKeys` with the maps in `invalidations`.
- `selectedRowsRef` stays outside the store, as Job A noted.
- `ViewerTarget*` types moved into `store.ts`. The Coordinator asked for a JSX-free module outside `Viewer.tsx`; a separate `types.ts` failed TS6307 under `tsconfig.node.json`, so they live in `store.ts`. The `@ts-ignore` in `store.ts` is removed, which supersedes the Job A note.
- Tests render through `test/unit/render-with-query.tsx`, one fresh `QueryClient` per render.

### Spec deviations
- none

### Tradeoffs accepted
- Delete and rename tests check the invalidation maps against live infinite queries, not the `Shell` handlers. A full `Shell` mount needs most of the shell mocks. Create bucket is tested through the real `Sidebar`.

### Follow-ups for human
- Consider one `Shell` level test for delete and rename wiring in a later phase.

### Test evidence
- Mutation check: breaking `createBucket` and `rename` in `queries.ts` made 3 of the 5 new tests fail; restored afterwards.
- `pnpm vitest run --project unit test/unit/renderer-listing-freshness.test.tsx` -> 5 passed.

## Task 4
### Decisions made
- Reset-on-change effects became render-phase comparisons in `Sidebar` and `Viewer`, and `ImageView` derives the error from a stored url. Behavior is unchanged.
- `SearchBar.cleanupListeners` is a `useCallback` with no deps and is listed in the unmount effect.
- Test hook factories moved to module scope with props. `window.test.ts` renames its constructor mock to `createBrowserWindow`.

### Spec deviations
- none

### Tradeoffs accepted
- 5 `biome-ignore` sites, the limit:
  - `DeleteBucketDialog.tsx`: target is captured only when the dialog opens.
  - `ObjectTable.tsx` reset effect: connection, bucket and prefix are reset triggers.
  - `ObjectTable.tsx` selection prune: `updateSelection` is recreated each render.
  - `MediaView.tsx`: `url` is a reset trigger for refs and state.
  - `ConfirmDeleteDialog.tsx`: `onFailure` is unstable and would restart the count.

### Follow-ups for human
- The `ObjectTable` and `ConfirmDeleteDialog` sites could be removed by stabilizing callbacks in a later phase.

### Test evidence
- `pnpm lint` 0 after fixes; before them 33 errors.
- `pnpm typecheck` 0; `pnpm test --maxWorkers=2` 35 files, 889 passed; `pnpm build` 0. e2e not run.


## Task FIX-1
### Decisions made
- `ConfirmDeleteDialog` counts folders with `useQuery(countPrefixQuery)`, enabled only while open with a single folder target. `counting` is `isFetching`, so a cached count never enables Delete before the refetch ends. `onFailure` runs from an effect through React 19 `useEffectEvent` when the count query errors. Biome 2.6.6 accepts it and the `biome-ignore` is gone. The reset of delete state on open or item change is now a render-phase comparison.
- `ConnectionDialog` reads profiles with `useQuery(profilesQuery)` enabled while open. A second effect keeps the `!getValues("profile")` default of the first profile for new connections.
- `ConnectionDialog` gained 1 `biome-ignore`: `isOpen` is a reset trigger so fields clear on open and close, as before. Total is now 4 sites: `DeleteBucketDialog`, `ObjectTable` selection prune, `MediaView`, `ConnectionDialog`.
- `Viewer` renders `<ImageView key={streamData.url}>`. `ImageView` uses a plain `hasError` boolean again.
- `ObjectTable` resets filter text and local selection with a render-phase scope comparison. Its `biome-ignore` is removed.

### Intentional behavior change
- `ObjectTable`: refresh and mutations no longer clear the filter text or the local selection. They reset only when connection, bucket or prefix changes. This is kept on purpose, because refresh now invalidates queries and does not remount the listing.

### Spec deviations
- none

### Tradeoffs accepted
- Finding 5 (invalidation replays all loaded pages) left unchanged as instructed.
- The Shell tests stub `RenameDialog` and `ConfirmDeleteDialog` through `vi.doMock`. `NewFolderDialog` is defined inside `Shell.tsx`, so that test uses the real dialog with a mocked `api.ops.createFolder`.

### Test evidence
- Shell wiring (`renderer-shell.test.tsx`, 3 new tests): the mock table keeps listings for `docs/` and `sibling/` active. After delete, rename and new folder, `api.objects.list` is called again for `docs/` and not for `sibling/`. Removing the `invalidateKeys` call from the three handlers made all 3 fail; restored and verified byte-identical.
- Image retry (`renderer-viewer-image.test.tsx`): failed A, then cached B, then A shows the image. Without the `key` it fails; with it, it passes. Both streams are cached first, because a first load unmounts `ImageView` and hides the bug.
- Dialogs (`renderer-dialogs.test.tsx`, 3 new tests): folder count through the query, count failure calls `onFailure` once and survives a parent rerender with a new callback, default profile selection.
- `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test --maxWorkers=2` 36 files, 896 passed; `pnpm build` 0. e2e not run.
