# Phase 3 FIX 1: event-path redaction and search start races

Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Checkpoint under review: `cc38159`
Parent prompt: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/phase-03/prompt.md`. Its contracts, invariants, and forbidden paths still apply. Read it first.
Worker contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`. Response format: `/home/ngosi/projects/refract/plugin/shared/erp.md`.

Both defects below were reproduced by the Coordinator with a throwaway probe against `browseHandlers`. Fix only these two. Change nothing else.

## Defect 1: `searchDone.error` leaks access key ids (Invariant 1)
Probe: a stub client whose `send` throws `new Error("denied for AKIAFIXTUREFIXTURE00 here")`, then `searchStart`. The `search:done` payload carried `error.message` of `Error: denied for AKIAFIXTUREFIXTURE00 here`.

Cause: the redaction `/(AKIA|ASIA)[A-Z0-9]{16}/g` lives only in the `register.ts` catch block. The `searchDone` error is built by `mapS3Error` in `src/main/ipc/browse.ts` and sent with `sender.send`, so it never passes through that block. Contract 5 said not to add a second redaction. That wording was wrong for the event path and is amended here.

Required change: apply the same replacement, with the same regex and the replacement text `[redacted]`, to the message inside `mapS3Error` in its `REQUEST_FAILED` branch, so every consumer of `mapS3Error` gets a redacted message. Leave the `register.ts` redaction as it is. Applying it twice is harmless.

## Defect 2: `searchStart` races around `await deps.clients.get`
Probe A: the sender is destroyed during `clients.get`. The `once("destroyed")` listener attaches after the event, so it never fires and the search ran to completion (5 `client.send` calls) against a destroyed sender.
Probe B, by code reading: `registry.has(jobId)` is checked before `await deps.clients.get`, and `registry.set` runs after it. Two concurrent `searchStart` calls with the same `jobId` can both pass the check.

Required change in `searchStart`, in this order:
1. `store.get` and the `NOT_FOUND` check, as now.
2. `const client = await deps.clients.get(connection)`. This is the only await before registration.
3. With no await between the following steps: if `sender.isDestroyed()`, return `{ jobId: input.jobId }` without registering a job or calling `runSearch`. Otherwise, if `registry.has(jobId)`, throw the coded `INVALID_REQUEST` error `"Job already exists"`. Otherwise attach `sender.once("destroyed", ...)`, `registry.set`, and start `runSearch` as now.

## Tests, RED first
Add to `test/unit/ipc-browse.test.ts`. Show a behavioral RED for each before the fix.
- Redaction: a stub client that throws an error whose message embeds `AKIAFIXTUREFIXTURE00`. After `searchStart` settles, the `search:done` payload parses against `searchDonePayloadSchema`, its `error.message` does not contain the key id and does contain `[redacted]`, and `assertNoSecrets` passes on the payload.
- Destroyed during get: `clients.get` destroys the fake sender before it resolves. Assert that the stub `client.send` was never called, `getRegistrySize()` is `0`, and the fake sender's destroyed-listener count is `0`.
- Concurrent duplicate: `clients.get` is delayed with a short timer. Fire two `searchStart` calls with the same `jobId` through `register` with a fake `ipcMain`. Exactly one reply is `ok: true` and the other is `INVALID_REQUEST`. Only one search runs. After it settles, the registry is empty and the listener count is `0`.
Keep fixture names free of the secret-scan substrings, case-insensitively.

## Files
Modify only:
- `src/main/ipc/browse.ts`
- `test/unit/ipc-browse.test.ts`
- `docs/plans/s3-media-explorer/phase-03/notes.md` (append `## Fix 1` with RED and GREEN evidence)
- `docs/plans/s3-media-explorer/phase-03/journal.md` (append `# EXTERNAL RESPONSE` under a new `## Fix 1 Response` heading)

Do not touch any other path. No `any` in production code. No Git commits, resets, stashes, or ref writes. No dependency changes.

## Done When
From `/home/ngosi/projects/s3-explorer`, all exit 0, with the unit count at least 66 and the integration count at 6:
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm build`
Return the `# EXTERNAL RESPONSE` block and its status line.
