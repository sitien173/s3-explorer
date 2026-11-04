# Phase 2 FIX batch 2 (spec findings)

You are the Phase 2 Implementer continuing in `/home/ngosi/projects/s3-explorer`. Read `/home/ngosi/projects/refract/plugin/shared/worker-contract.md` and `/home/ngosi/projects/refract/plugin/shared/erp.md`. The contract is `docs/plans/s3-media-explorer/phase-02/prompt.md`, amended by `fix-1.md`. The declared file set is unchanged. Touch no other file.

The Coordinator found three spec defects by running code. Do not re-investigate them. Fix each with RED first, and record each RED and GREEN in `notes.md` under `## Fix 2`.

## Defect 1: null does not clear region or endpoint (contract 5)
`update` with `region: null` or `endpoint: null` stores literal `null` in `connections.json`. The response schema then rejects it, so the caller gets `REQUEST_FAILED` after the file was already changed.
Required behavior: `null` removes the key from the stored record. `sessionToken: null` removes the stored session token from the secret. The response is `ok: true` and the view has no `region` or `endpoint` key. Write the RED test through the registered `connections:update` listener with a fake `ipcMain`, and assert on `connections.json` as well. Fix it in `store.ts`.

## Defect 2: replacement keys are dropped when the old secret is gone (contracts 4 and 5)
After a restart with a `basic_text` cipher, a manual connection reports `hasSecret: false`. `update` with `accessKeyId` and `secretAccessKey` then leaves `hasSecret` false, because `store.update` only stores when an old secret exists.
Required behavior: when both `accessKeyId` and `secretAccessKey` are supplied, store them whether or not an old secret exists. `sessionToken` is kept only when supplied. When only one key is supplied and no old secret exists, reject the request as `INVALID_REQUEST` with the fixed message `Both keys are required`. Allow `INVALID_REQUEST` in the `allowed` code list in `register.ts` and pass that one fixed message through. Every other non-`REQUEST_FAILED` code keeps the generic `Request failed`. When an old secret exists, a single key still merges as now. The update stays manual-only: a profile connection never gets a secret, so supplied keys for a profile connection are ignored as now. RED tests: lost-secret re-entry gives `hasSecret: true`, a single key with no old secret gives `INVALID_REQUEST`, and a single key with an old secret merges. Invalidate the cached client as the handler already does.

## Defect 3: `any` where contract 9 requires inferred types
`Api` in `src/shared/ipc.ts` and the preload, handlers, and `register.ts` use `any`. Contract 9 requires `ipc.ts` to export the inferred types and a typed `Api`.
Required behavior:
- Export inferred request and response types with `z.infer`, a `Result<T>` envelope type, and an `Api` whose methods take the inferred request type and return `Promise<Result<ResponseType>>`. Request type for `list` and `listProfiles` is optional.
- The preload uses those types with `import type` only, and still imports values only from `channels.ts`. After `pnpm build`, every `require` specifier in `out/preload/index.cjs` is still `electron`.
- Remove the `any` casts in `register.ts` and `connections.ts` where the types allow it. If a cast stays because the channel-indexed schema map cannot express it, keep one narrow cast with a one-line comment saying why. Change no behavior.
- `pnpm typecheck` must prove the types: add a type-level check in an existing unit test, for example an `expectTypeOf` assertion that `Api['connections']['create']` rejects a request without `kind`.

## Done when
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exit 0. Preload requires only `electron`. Append `# EXTERNAL RESPONSE` to `phase-02/journal.md`. Return the ERP block with `TASK_COMPLETE` only if every check passes. Otherwise report the failing output.
