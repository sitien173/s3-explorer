# Phase 2 FIX batch 1

You are the Phase 2 Implementer continuing in `/home/ngosi/projects/s3-explorer`. Read `/home/ngosi/projects/refract/plugin/shared/worker-contract.md` and `/home/ngosi/projects/refract/plugin/shared/erp.md`. The original contract is `docs/plans/s3-media-explorer/phase-02/prompt.md`. This batch amends contract 11 and closes the gaps your first response named. Declared files are unchanged from the original prompt. Add nothing else.

## Root cause already established (do not re-investigate)
The AWS SDK `endpoint_url` lookup ignores the client-level `profile` option and reads the default profile. Evidence: `test/integration/client.test.ts` fails on the profile call with `InvalidAccessKeyId`. The same client passes when `AWS_PROFILE=rust` is set. `S3Client` accepts `ignoreConfiguredEndpointUrls?: boolean`.

## Amended contract 11 for profile connections
Resolve the endpoint in `src/main/s3/client.ts`:
1. `connection.endpoint` when set.
2. Else the profile's own `endpoint_url`, read with the same `loadSharedConfigFiles` call that `profiles.ts` uses. Reuse a helper from `profiles.ts` if one fits. Do not duplicate parsing. Honor the `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` env vars at call time, as before.
3. Else pass `ignoreConfiguredEndpointUrls: true` so `[default]` never applies to another profile.
Pass the resolved value as `endpoint`. Keep `profile`, `region?`, `forcePathStyle`, `followRegionRedirects: true`. Manual connections are unchanged.

## Tasks (RED first, record each RED and GREEN in notes.md under `## Fix 1`)
1. Add unit cases to `test/unit/client.test.ts` using the fixtures, and watch them fail first:
   - A profile connection on `static-keys` has no `endpoint_url` and resolves no custom endpoint, even though `[default]` sets one.
   - A non-default profile that sets its own `endpoint_url` resolves it. Add that profile to `test/fixtures/aws/config` and update the profiles test only if its sorted output assertion needs it.
   - An explicit connection endpoint wins over the profile's.
   Resolve the endpoint with `await client.config.endpoint?.()`.
2. Implement the amended contract.
3. Close the coverage gaps you named. Compare your tests with every case listed in the Tasks section of the original prompt and add each missing one. List them in notes.md.
4. Reformat `src/main/s3/client.ts` and any other new file you wrote as dense one-liners to the surrounding multi-line style, as in `src/main/window.ts`. Change no behavior while doing so.

## Done when
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exit 0, and the integration test passes with the profile named `rust` unchanged. No stray files. Append `# EXTERNAL RESPONSE` to `phase-02/journal.md` and return the ERP block with `TASK_COMPLETE` only if every check passes. Otherwise report the failing output.
