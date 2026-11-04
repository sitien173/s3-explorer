<!-- refract-shared-version: 2.4.0 -->

# Phase 3 — Decision Notes

## Task 1

### Decisions made
- Defined `AnyChannel = keyof RequestByChannel` while retaining `Channel` as the union of connection channels so `connections.ts` remains untouched and compliant with invariants.

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
  - RED: `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> `AssertionError: expected [] to deeply equal [ { name: 'charlie', …(2) }, …(3) ]` (4 failed, 1 passed)
  - GREEN: `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> `Test Files 1 passed (1), Tests 5 passed (5)` (and `pnpm test` -> `Test Files 7 passed (7), Tests 46 passed (46)`)
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Implemented `SearchJobRegistry` in `browse.ts` exposing `jobRegistry` and `getRegistrySize` on browse handler map to provide clean test visibility without public API surface.

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
  - RED: `pnpm exec vitest run test/unit/search-match.test.ts` -> `AssertionError: expected false to be true` (10 failed, 2 passed); `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> `AssertionError: expected [] to deeply equal [ 'search:batch', …(2) ]` (4 failed, 5 passed)
  - GREEN: `pnpm exec vitest run test/unit/search-match.test.ts` -> `Test Files 1 passed (1), Tests 12 passed (12)`; `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> `Test Files 1 passed (1), Tests 9 passed (9)`; `pnpm test` -> `Test Files 8 passed (8), Tests 62 passed (62)`
- Root cause (bugfix only): none

## Task 3

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
  - RED: `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> added secret scanning assertions across all browse responses and streaming event payloads
  - GREEN: `pnpm exec vitest run test/unit/ipc-browse.test.ts` -> `Test Files 1 passed (1), Tests 10 passed (10)`
  - Verification: `pnpm build` -> `out/preload/index.cjs` requires only `electron`; `timeout 10 xvfb-run -a pnpm exec electron .` exited 124 without errors beyond the expected ozone Wayland/Vulkan log.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- Factored shared RustFS test harness and seeding utilities into `test/integration/helpers.ts` with explicit 120s timeout in test hooks to ensure reliable bucket seeding and teardown without hook timeouts.

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
  - RED: `pnpm test:integration` -> `Error: Hook timed out in 10000ms` during teardown of 2,500 seeded objects before adding 120s hook timeout to afterAll
  - GREEN: `pnpm test:integration` -> `Test Files 4 passed (4), Tests 6 passed (6)` (`list.test.ts`: 2,500 keys paginated, folder marker dropped, special character keys preserved, bucketsList verified; `search.test.ts`: case-insensitive special character search exact match set, prefix-only query returning 0 matches, cancel after first batch yielding cancelled: true and no further batches)
- Root cause (bugfix only): none

## Fix 1

### Decisions made
- Supported optional `jobRegistry` in `browseHandlers` dependencies for test observability while keeping production code fully typed and zero `any`.

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
  - RED: `pnpm exec vitest run test/unit/ipc-browse.test.ts`
    - Defect 1: `AssertionError: expected 'Error: denied for AKIAFIXTUREFIXTURE0…' not to contain 'AKIAFIXTUREFIXTURE00'`
    - Defect 2 (probe A): `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`
    - Defect 2 (probe B): `AssertionError: expected 2 to be 1`
    - Overall RED result: `Test Files 1 failed (1), Tests 3 failed | 10 passed (13)`
  - GREEN: `pnpm exec vitest run test/unit/ipc-browse.test.ts`
    - Overall GREEN result: `Test Files 1 passed (1), Tests 13 passed (13)`
  - Verification:
    - `pnpm typecheck` -> exit code 0
    - `pnpm test` -> `Test Files 8 passed (8), Tests 66 passed (66)`, exit code 0
    - `pnpm test:integration` -> `Test Files 4 passed (4), Tests 6 passed (6)`, exit code 0
    - `pnpm build` -> exit code 0
- Root cause (bugfix only):
  - Defect 1: `mapS3Error` in `src/main/ipc/browse.ts` did not apply `/(AKIA|ASIA)[A-Z0-9]{16}/g` redaction on its `REQUEST_FAILED` branch, allowing raw key IDs to leak when `runSearch` rejects and sends `searchDone`.
  - Defect 2: In `searchStart`, `registry.has(input.jobId)` was checked before `await deps.clients.get(connection)`, allowing concurrent invocations to pass duplicate checks before registration, and the `destroyed` listener was registered after `clients.get`, allowing searches to execute against senders destroyed during client acquisition.
