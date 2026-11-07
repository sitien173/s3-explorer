# Phase 8: Grid view, thumbnails, and handle LRU

## Goal & Outcome
- Plan Goal: Move the S3 Media Explorer renderer onto Base UI, React Hook Form with Zod 4, TanStack Query, Zustand, Biome, and an Apple-style layout without changing IPC, CSP, or Electron security settings.
- Phase Outcome:
  - A virtualized grid or gallery view sits beside the table, with a toolbar toggle. The view mode persists across restarts in `localStorage`.
  - Image objects show thumbnails loaded through the existing stream proxy under a load budget.
  - `HandleRegistry` in the main process is bounded by a 1,024-entry LRU.
  - Two Phase 8 debt items are resolved.

## Context & Architecture
- Code root: `/home/ngosi/projects/s3-explorer` | Records root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-stack-refactor/phase-08/base`
- Prior State:
  - Phases 1 to 7 are done.
  - Base UI wrappers live in `components/ui`.
  - Forms use RHF with Zod (`forms.ts`).
  - TanStack Query lives in `queries.ts`, and the Zustand shell store in `store.ts`.
  - Apple-style tokens live in `styles/globals.css`.
  - `QuickLook.tsx` is the overlay viewer.
  - `Toolbar.tsx` is the unified 44 px toolbar.
  - `CommandPalette.tsx` opens on Ctrl or Cmd+K.
  - `platform.ts` exports `isMac`.
  - Checks at base:
    | Check | Baseline |
    |---|---|
    | `pnpm typecheck` | exit 0 |
    | `pnpm lint` | exit 0, with 1 known info about the deprecated `recommended` field; ignore it |
    | `pnpm test --maxWorkers=2` | 38 files, 948 passed |
    | `pnpm build` | exit 0 |
    | e2e | 1 passed |
    | `pnpm test:integration` | only "deletes 2,500 keys in three batches" times out; that failure is known |
  - Always pass `--maxWorkers=2`. Two tests are known load flakes; if only one of them fails, re-run once:
    - `test/unit/transfers.test.ts` "unique part file".
    - An unhandled Sonner-timer error from `renderer-toasts-dom.test.tsx`.
- Code Context:
  - `src/main/stream/handles.ts` (58 lines): `HandleRegistry`.
    - It has two Maps, `targetsByHandle` and `handlesByTarget`, which dedupe by target identity.
    - `create(target)` returns an existing handle or a new random 32-hex handle.
    - `get(handle)` validates the format.
    - It also has `size` and `clear()`.
    - Tests are in `test/unit/handles.test.ts`. The proxy integration tests are in `test/integration/proxy.test.ts`, and an unknown handle already yields 403 there. Read the proxy server under `src/main/stream/` to confirm.
  - `src/renderer/src/components/ObjectTable.tsx` (608 lines).
    - It uses `@tanstack/react-virtual` `useVirtualizer` with `ROW_HEIGHT = 40` and `OVERSCAN = 10`.
    - It also handles selection, the Finder key map from Phase 6 (Space for Quick Look, arrows, Enter, and so on), and the context menu.
    - Its tests are in `test/unit/renderer-object-table.test.tsx`. Lines 126 to 129 hold the 400 px and 1200 px bound tests.
  - `src/renderer/src/queries.ts`.
    - `streamOpenQuery({ connectionId, bucket, key })` calls `api.stream.open` and has `staleTime: Infinity`. It returns a `127.0.0.1` proxy URL.
    - `objectsInfiniteQuery` is the paged listing.
    - `invalidations` and `invalidateKeys` mark keys stale through `invalidateQueries`.
  - CSP already allows `img-src 'self' data: http://127.0.0.1:*`. No CSP change is needed or allowed.
  - QuickLook from Phase 6 retries `stream.open` once after a 403. A thumbnail must not do this; on failure it falls back to the type icon.

## Invariants & Boundaries
- DESIGN.md invariant 5: the grid mounts at most `(ceil(viewportHeight / cellHeight) + 2 * gridOverscanRows) * columns` cells, with `gridOverscanRows` of 1 or 2.
  - Virtualize rows of N column lanes. Derive the column count from the container width and a fixed cell width.
  - Test this with 10,000 objects at 400 px and 1200 px viewport heights.
  - The table's bound must not drift.
- Thumbnail budget:
  - Images only: decide by extension or content type, and keep one helper for this, reusing the Phase 6 viewer type detection.
  - Only objects whose listing `size` is 5 MiB or less (`5 * 1024 * 1024`).
  - Only cells in the visible rows, not the overscan rows, and only after 150 ms of scroll idle.
  - At most 4 requests in flight at once, counting `stream.open` plus the image load until `onload` or `onerror`.
  - Paused while Quick Look shows a playing video or audio target; resume after it closes.
  - On failure, show the type icon with no toast and no retry.
  - Use `loading="lazy"` and `decoding="async"` on the `<img>`, with `alt=""` because the cell has its own accessible name.
- `HandleRegistry`:
  - Holds at most 1,024 entries (export `MAX_HANDLES = 1024`).
  - Evicts the least recently used entry from both maps.
  - `get` and the dedupe hit in `create` both count as a touch.
  - An evicted handle yields 403 through the existing proxy path.
  - No IPC change, and no change to the handle format.
  - Invariant 2 of the original design must keep holding.
  - A Quick Look video that is playing stays alive, because every Range request calls `get` and so touches its handle.
- View mode:
  - `viewMode: "list" | "grid"` lives in the Zustand store and persists in `localStorage` under one key.
  - Use the Zustand `persist` middleware with `partialize`, persisting only `viewMode`. Verify its API with `npx ctx7@latest` for zustand 5.1.0.
  - An invalid stored value falls back to `"list"`.
- Shared behavior: the grid reuses the table's selection model, Finder key map, Quick Look trigger, and context menu.
  - Extract shared hooks or helpers rather than duplicating them, but extract only what the grid needs.
  - In the grid, Left and Right move by one cell and Up and Down move by one row of columns.
  - The grid has `role="grid"` with rows and gridcells, or an equivalent accessible pattern, so the `useFinalFocus` fallback (`[role="grid"]`) still finds it.
- Debt to resolve in this phase:
  - D-P1-Q5: in `renderer-object-table.test.tsx`, assert that the mounted row count at 1200 px is greater than at 400 px. Do the same for the grid.
  - D-P4: invalidating a deeply scrolled infinite listing refetches every loaded page. Fix it in `invalidateKeys` or the listing query: for object-list keys, use `resetQueries` or `maxPages`. Record which you chose and why in notes. Add a unit test showing that a 3-page listing refetches only the first page after invalidation. All other invalidation tests must still pass.
- Apple style:
  - Square cells about 112 to 128 px wide, with the icon or thumbnail on top and a two-line truncated name below.
  - Selection uses the accent token.
  - Tokens only, with no color literals in the renderer.
  - Honor reduced motion.
  - The toolbar toggle is a two-button segmented control with icons, `aria-pressed`, and tooltips, named "List view" and "Grid view".
- Out of Scope:
  - New dependencies. `@tanstack/react-virtual` and zustand are already installed.
  - `src/preload/**`, `src/shared/**`, and IPC.
  - CSP, `index.html`, and `window.ts`.
  - Any file under `docs/` except your phase records.
  - `~/.aws`, `.env*`, and any connection or credential store under Electron userData.

## Files
Allowed production and test paths:
- Modify: `src/main/stream/handles.ts`, `test/unit/handles.test.ts`, `test/integration/proxy.test.ts`
- Create: `src/renderer/src/components/ObjectGrid.tsx`, `test/unit/renderer-object-grid.test.tsx`, plus a small shared hook or helper module under `src/renderer/src/` if the extraction needs one. A new `.ts` file imported by `test/*.ts` must be added to `tsconfig.node.json`.
- Modify: `src/renderer/src/components/{Toolbar,ObjectTable,QuickLook}.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/store.ts`, `src/renderer/src/queries.ts`, `e2e/app.spec.ts`, `tsconfig.node.json`, and the matching existing unit tests.
- Phase records: `docs/plans/ui-stack-refactor/phase-08/{notes,journal}.md`

## Tasks
This phase runs as two jobs. Use TDD and record RED in notes.

**Job A: Tasks 1 and 2 only. Stop after Task 2 and return `NEXT: TASK_COMPLETE` scoped to Tasks 1 and 2.**
- task-1: HandleRegistry LRU.
  - Write the tests first in `handles.test.ts`:
    - Capacity is 1,024.
    - The 1,025th distinct target evicts the least recently used one.
    - `get` touches an entry.
    - A dedupe hit touches an entry.
    - An evicted target gets a new handle on `create`.
    - The old handle's `get` returns `undefined`.
    - `clear` resets everything.
  - Implement this with Map insertion order: delete and re-set on a touch.
  - Add an integration test in `proxy.test.ts` showing that an evicted handle returns 403. Use a registry and fill it past capacity; check how the test builds its registry.
  - Run `pnpm test:integration` if your environment allows it, and report the result. RustFS may be needed; if it is unavailable, say so and the Coordinator will run it.
- task-2: Build `ObjectGrid.tsx` and the view mode.
  - Write the cell-bound tests first, at 400 px and 1200 px with 10,000 objects, including the assertion that 1200 px mounts more than 400 px. Also add the matching more-than assertion to the table test (debt D-P1-Q5).
  - Cover shared selection, the key map, Space for Quick Look, the context menu, and `role="grid"`.
  - Add `viewMode` to the store with persistence, plus store tests for the round trip and the invalid-value fallback.
  - Add the Toolbar segmented toggle.
  - In Shell, render ObjectGrid or ObjectTable according to `viewMode`.
  - Resolve debt D-P4 in `queries.ts` and add its test.

**Job B: Task 3, sent later as "Continue Phase 08".**
- task-3: Thumbnails.
  - Write the scheduler tests first, with fake timers:
    - At most 4 in flight.
    - The 150 ms idle delay is reset by scrolling.
    - Only visible rows are scheduled.
    - Images over 5 MiB and non-image types are skipped.
    - Scheduling pauses while Quick Look plays media and resumes afterwards.
    - On failure, the icon shows with no toast.
    - Unmount or a prefix change cancels pending work.
  - Build the scheduler as a small hook or module, then wire it into ObjectGrid.
  - Add one e2e step in `e2e/app.spec.ts`:
    - After the bucket opens, click "Grid view" and assert a gridcell for a seeded object is visible.
    - If the seed has an image, assert its `img` gets a `127.0.0.1` `src`; otherwise skip that check and say so in notes.
    - Click "List view" and assert the table is back.
  - Write the step, but do not run e2e.

## Done When
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm lint` (Baseline: exit 0)
  - `pnpm test --maxWorkers=2` (Baseline: 948 passed; expect more)
  - `pnpm build` (Baseline: exit 0)
- The Coordinator runs `xvfb-run -a pnpm e2e` and `pnpm test:integration` itself. Do not run e2e; it needs exclusive use of port 19000.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary:
- You are the phase implementer, not the Coordinator.
- Edit code only in `/home/ngosi/projects/s3-explorer`.
- Write phase records only under `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-08/`.
- Do not run Git commits, resets, stashes, branch changes, or ref updates.
- Do not invoke Coordinator skills or submit nested jobs.
- Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if it is unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `/home/ngosi/projects/s3-explorer/docs/plans/ui-stack-refactor/phase-08/journal.md`, then return that block and the matching status line from `erp.md`.
