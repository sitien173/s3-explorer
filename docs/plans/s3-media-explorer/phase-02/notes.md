

## Fix 3

### Decisions made
- `SecretVault.set` commits the new value to memory first, then handles encrypt/write/rename persistence failures as a `false` result without exposing the underlying error.
- The temp file is removed on write or rename failure; the existing target remains protected by the temp-file/rename flow.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- `allowed()` remains unchanged as directed; failure handling is scoped to encryption and file persistence.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - Vault RED: `pnpm exec vitest run --project unit test/unit/store.test.ts -t 'encryption throws|directory cannot be written'` -> both tests failed because `SecretVault.set` propagated the encryption error and missing-directory `ENOENT`.
  - Ciphertext-preservation RED: `pnpm exec vitest run --project unit test/unit/store.test.ts -t 'encryption throws|preserves existing ciphertext|directory cannot be written'` -> 3 tests failed; replacement encryption propagated its error and did not return `false`.
  - IPC RED: `pnpm exec vitest run --project unit test/unit/ipc-connections.test.ts -t 'cipher persistence throws'` -> manual create returned `ok: false` rather than a successful session-only view.
  - GREEN: `pnpm exec vitest run --project unit test/unit/store.test.ts test/unit/ipc-connections.test.ts` -> 2 files, 14 tests passed; covers throwing encryption, persistence failure, prior ciphertext preservation, in-memory reads, IPC create/update, session-only status, and secret-free responses.
- Fresh verification:
  - `pnpm install --frozen-lockfile` -> Already up to date; exit 0.
  - `pnpm typecheck` -> exit 0.
  - `pnpm test` -> 6 files, 41 tests passed.
  - `pnpm test:integration` -> 2 files, 2 tests passed.
  - `pnpm build` -> exit 0.
  - `grep -o 'require("[^"]*")' out/preload/index.cjs | sort -u` -> only `require("electron")`.
