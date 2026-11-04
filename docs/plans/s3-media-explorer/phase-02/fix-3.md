# Phase 2 FIX batch 3 (quality review cycle 1)

You are the Phase 2 Implementer continuing in `/home/ngosi/projects/s3-explorer`. Read `/home/ngosi/projects/refract/plugin/shared/worker-contract.md` and `/home/ngosi/projects/refract/plugin/shared/erp.md`. Allowed paths: `src/main/connections/secrets.ts`, `test/unit/store.test.ts`, `test/unit/ipc-connections.test.ts`, `docs/plans/s3-media-explorer/phase-02/notes.md`, `docs/plans/s3-media-explorer/phase-02/journal.md`. Touch nothing else. Record RED and GREEN in `notes.md` under `## Fix 3`.

## Verified defect
`SecretVault.set` writes the secret to memory, then calls `cipher.encryptString` and writes `secrets.json` with no guard. Electron documents that `encryptString` throws when encryption fails. `ConnectionStore.create` and `update` have already saved `connections.json` before they call `vault.set`. A throw therefore leaves the record created or changed and the secret in memory, while the caller gets `REQUEST_FAILED`. A retry then creates a duplicate connection.

## Required behavior
`SecretVault.set` never throws because of a persistence failure. When `encryptString` throws, or the temp file write or rename throws, it keeps the secret in the in-memory map, writes nothing partial, and returns `false`. The existing `sessionOnly` derivation then reports `sessionOnly: true` and `hasSecret: true` with no other change. Do not rethrow, log, or wrap the underlying error, so no value-bearing message escapes. When a previous ciphertext exists on disk for that id and the new persist fails, leave the old file content untouched. Do not change `store.ts`, the order of record and secret writes, `delete`, or `allowed()`. The review claim that `allowed()` can throw is not supported by the Electron typings, so leave it alone.

## RED tests first
1. Vault level, in `test/unit/store.test.ts`: a cipher whose `encryptString` throws. `set` resolves `false`, `get` returns the secret, and `secrets.json` does not exist.
2. Vault level: a vault whose directory does not exist, with a working cipher. `set` resolves `false` and `get` returns the secret.
3. Through the registered IPC listeners in `test/unit/ipc-connections.test.ts`: with the throwing cipher, `connections:create` for a manual connection returns `ok: true` with `sessionOnly: true` and `hasSecret: true`, and a following `connections:update` with new keys also returns `ok: true`. Assert that no serialized response contains the fake secret values.

## Style
`src/main/connections/secrets.ts` still runs imports, the interface, the types, and the class members together with no blank lines. Add blank lines between the import block and the declarations, between declarations, and between class members, matching `src/main/s3/client.ts`. Change no behavior while doing so.

## Done when
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exit 0, and the built preload still requires only `electron`. Append `# EXTERNAL RESPONSE` to `phase-02/journal.md` and return the ERP block with `TASK_COMPLETE` only if every check passes. Otherwise report the failing output.
