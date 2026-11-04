<!-- refract-shared-version: 2.4.0 -->

# Phase 5 — Decision Notes

<!--
Worker Notes. Append one `## Task <M>` block per task and one `## Batch <N>`
section per resumed scope. Keep the file; never overwrite earlier blocks.
Empty sub-sections = `- none`. Every block records the verification facts the
prompt asks for, with the exact command and the observed result.
-->

## Batch 1: Scope A

## Task 1: Contract 1 — URL resolver

### Decisions made
- Matched virtual-hosted AWS names with anchored suffix patterns so dotted bucket names are captured from the right; the region capture is restricted to `[a-z]{2}(-[a-z]+)+-[0-9]+`.
- Kept HTTP object URLs as the trimmed original input with only query and fragment removed; decoded key segments independently so `+` remains `+`.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- `endpointHosts` contains normalized host values from `endpointHostOf`, as specified.

### Follow-ups for human
- none

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/resolve.test.ts` -> 42 failed, 23 passed (65 total); behavioral assertions showed accepted URLs returning `unsupported` instead of objects/presigned results, invalid URLs returning `unsupported`, and `endpointHostOf` returning `undefined` instead of normalized hosts.
  - GREEN: `pnpm exec vitest run --project unit test/unit/resolve.test.ts` -> 65 passed.
- Contract 1 audit: checked processing order, trimmed-length and parse failures, userinfo, S3 canonicalization, presign detection before host matching, all six AWS path/virtual host forms, default-port and HTTPS restrictions, right-anchored dotted-bucket matching, configured endpoint path/virtual matching, percent decoding, raw URL query/fragment removal, and the unsupported AWS/lookalike cases against the table.

## Task 2: Contract 2 — Range parsing

### Decisions made
- Parsed only a single `bytes=` range after trimming the whole header; safe-integer checks preserve zero-length suffixes as valid ranges.

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
  - RED: `pnpm exec vitest run --project unit test/unit/range.test.ts` -> 13 failed, 13 passed (26 total); behavioral assertions showed valid byte/suffix ranges returning `null` and formatter cases returning `bytes=0-`.
  - GREEN: `pnpm exec vitest run --project unit test/unit/range.test.ts` -> 26 passed.

## Task 3: Contract 3 — Handle registry

### Decisions made
- Used two `Map` instances for handle lookup and structural-target deduplication; target identity is a JSON tuple and stored targets are copied.

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
  - RED: `pnpm exec vitest run --project unit test/unit/handles.test.ts` -> 7 failed, 7 passed (14 total); behavioral assertions showed missing lookups/size tracking, duplicate fixed handles, and distinct targets sharing a handle.
  - GREEN: `pnpm exec vitest run --project unit test/unit/handles.test.ts` -> 14 passed.

### Scope verification
- `pnpm typecheck` -> exit 0. An earlier run exposed a TypeScript union-property error in the invalid-case table; the table was explicitly typed and the final run passed.
- `pnpm test` -> exit 0; 14 test files passed, 238 tests passed. The three added files contribute 105 tests, exactly increasing the 133-test baseline to 238; existing tests were unchanged.
- No integration tests were run. Removed generated `tsconfig.node.tsbuildinfo` and `tsconfig.web.tsbuildinfo`; no `*.tsbuildinfo`, `out/`, or `test/.tmp/` paths are in `git status`.

## Batch 2: Scope B

### Task 4: B0 — Resolver test-strength additions

#### Decisions made
- Built exactly sized valid AWS object URLs from the fixed prefix length, with a 8192-character acceptance and an 8193-character invalid case.
- Added a dotted bucket for every AWS virtual-hosted suffix pattern: region-less `s3`, regional `s3.<region>`, hyphenated `s3-<region>`, dualstack, FIPS, and FIPS dualstack. Kept the existing detailed regional dotted-key case unchanged.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- The valid length boundary is measured on the trimmed input, as Contract 1 specifies.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN (the requested source mutations demonstrate behavior):
  - RED length mutant: temporarily changed `trimmed.length > 8192` to `> 8190`; `pnpm exec vitest run --project unit test/unit/resolve.test.ts` -> 1 failed, 71 passed (72 total). The assertion for `accepts an object URL of exactly 8192 characters` failed with `{ ok: false, reason: 'invalid' }`.
  - RED suffix mutant: temporarily changed the region-less virtual-host regex `(.+)` to `([^.]+)`; the same command -> 1 failed, 71 passed. `matches dotted buckets on the region-less virtual-hosted endpoint` failed with `unsupported`.
  - GREEN: reverted both source lines; `pnpm exec vitest run --project unit test/unit/resolve.test.ts` -> 72 passed. `git diff -- src/main/url/resolve.ts` was empty after each revert and at final verification. No resolver production defect was found or fixed.
- Root cause (bugfix only): none.

### Task 5: B1 — Stream proxy implementation

#### Decisions made
- Kept token state private to each `createStreamProxy` instance, generated with `randomBytes(32).toString('hex')`; token checks reject unequal lengths before `timingSafeEqual`.
- Used per-request abort controllers, `res.on('close')`, Node `pipeline`, and body destruction; forwarded only normalized Range, If-Range, and Accept values to pass-through fetches.
- Shared fixed status/body mapping helpers and response-header allowlists between the request paths.

#### Spec deviations
- none

#### Tradeoffs accepted
- Node's `Readable.from(response.body, { objectMode: false })` adapts fetch's web stream without collecting the response body; pipeline carries backpressure.

#### Assumptions
- The S3 SDK's `GetObject` Body is a Node `Readable`, confirmed by the runtime probe below.
- Scope B does not use RustFS; RustFS-specific range/HEAD behavior is deferred to its integration scope, and no integration suite was run here.

#### Follow-ups for human
- Scope D must perform the RustFS probes for valid/open-ended/suffix/past-end/zero suffix ranges and HEAD on a presigned GET URL before relying on those facts.

#### Test evidence
- RED -> GREEN:
  - RED scaffold: after writing all initial proxy tests and before implementation, `pnpm exec vitest run --project unit test/unit/proxy.test.ts` -> 48 failed, 2 passed (50 total); failures were behavioral HTTP/status/header/describe assertions against the inert 501 server and inert describe result, not import or syntax errors.
  - GREEN implementation: `pnpm exec vitest run --project unit test/unit/proxy.test.ts` -> 50 passed. Subsequent focused tests raised the final proxy-file count to 53; final whole-suite evidence is in Scope verification below.
  - Root-cause follow-up RED/GREEN: the new pass-through 200 Content-Range assertion failed (`null` vs `bytes 0-3/10`) with `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'maps pass-through status 200'`; the relay helper was corrected to pass Content-Range whenever upstream supplied it, for either 200 or 206.
  - Root-cause follow-up RED/GREEN: the no-size describe fixture initially produced Node's implicit `Content-Length: 0`; using a non-empty chunked upstream response made the intended missing-size assertion valid. A failed pass-through fetch initially propagated `TypeError: fetch failed`; `describePassThrough` now converts it to fixed coded `REQUEST_FAILED` / `Request failed` as Contract 4 requires.
- Contract 4 line-by-line audit: verified loopback-only port-0 binding, repeated start and stop behavior, pre-start `urlFor` failure and URL format; 32-byte lowercase token and safe unequal-length constant-time comparison; identical fixed 403 routing checks and common headers; S3 lookup, GET/HEAD commands and abort signals, Range normalization, response headers, 206/200 selection, 416 size lookup and fixed error status/body mapping; explicit pass-through header allowlist, manual redirect limit/protocol/location checks and discarded-body cancellation; only permitted pass-through response headers/statuses; ranged-GET pass-through HEAD sizing/body cancellation; and coded, fixed-message `describe` behavior for both target kinds. Streaming uses pipeline and never accumulates a complete body.

### Task 6: B2 — Proxy contract tests

#### Decisions made
- Used an ephemeral real proxy listener, scripted `send` stub recording command inputs and abort signals, and local HTTP upstream servers; every server/proxy is closed in `afterEach`.
- All async close, abort, and cancellation checks use events or polling with a deadline; no fixed sleeps.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: initial behavioral-scaffold run recorded under Task 5.
  - GREEN: `pnpm exec vitest run --project unit test/unit/proxy.test.ts` -> final 53 passed.
- Required temporary proxy mutations, each reverted by editing the exact line/block back:
  1. Added pass-through `Authorization` and `Cookie` to the outgoing header set. `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'forwards only Range'` -> 1 failed, 51 skipped; the named allowlist test received `Bearer client-secret` instead of `undefined`.
  2. Removed `controller.abort()` from the response-close handler. `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'aborts the SDK signal'` -> 1 failed, 51 skipped; `waitFor` reported `Timed out waiting for proxy stream state` because the SDK signal did not abort.
  3. Removed the `redirects >= 3` condition. `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'rejects a fourth redirect'` -> 1 failed, 51 skipped; the test received 200 instead of 502 after following the fourth hop.
  4. Sent the SDK error message as the 502 body. `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'maps S3 unmapped error'` -> 1 failed, 51 skipped; body contained `AKIAFIXTUREFIXTURE00 https://private.example/object` instead of `Upstream error`.
- Mutation rollback check: `git diff -- src/main/stream/proxy.ts` was empty after all mutations were reverted (the file is newly created and untracked, so ordinary git diff does not display it); final source SHA-256 after the reverts and the separate Content-Range fix: `ce27472b70d3e3f8783624edeb2e2ae4b9a8d50b69c963202af087b1092e8bda`. The URL resolver diff is empty as well.

### Scope verification and runtime facts
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> exit 0; 15 test files, 298 passed. This is exactly 238 baseline + 7 B0 additions + 53 new proxy tests; no existing test was changed other than additive B0 coverage.
- Runtime fact 1: an inline Node 24 HTTP-server probe using `fetch(..., { redirect: 'manual' })` observed status 302, readable `Location: /next`, and a readable response body.
- Runtime fact 2: an inline Node S3 SDK probe against a local HTTP server observed `GetObject` Body as `instanceof Readable`; destroying it closed the upstream socket.
- Runtime fact 3: a real local HTTP request probe observed `IncomingMessage` `close` before a client disconnect, then `ServerResponse` `close` when the client destroyed its socket; response close is the disconnect signal.
- `rg -n '\\bany\\b|localhost|0\\.0\\.0\\.0' src/main/stream/proxy.ts` -> no matches. `git diff --check` -> clean.
- Removed generated `out/`, `test/.tmp/`, `tsconfig.node.tsbuildinfo`, and `tsconfig.web.tsbuildinfo`; none remain in Git status. No integration tests were run.

## Batch 3: Scope C

### Task 7: Contract 5 — IPC contracts and handlers

#### Decisions made
- Reused the shared bucket and object-key constraints and made both stream request schemas strict; the URL schema rejects a simultaneous `connectionId` and `anonymous: true`.
- Resolve endpoint hosts from one ordered `store.list()` snapshot, filtering both `undefined` and empty values before calling `resolveUrl`; use that same list to select the first pinned/extra-bucket match.
- Keep signed/presigned URL contents inside the main-process registry. All resolver failure strings are fixed and do not include the input.

#### Spec deviations
- none

#### Tradeoffs accepted
- Existing `register` policy maps `NOT_FOUND` errors to the generic renderer message `Request failed` while retaining the `NOT_FOUND` code; stream handlers still throw the specified coded `Connection not found` error.

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts test/unit/window.test.ts` -> 18 failed, 20 passed. IPC assertions showed the `stream:open` and `stream:openUrl` handlers were not registered; the CSP assertions showed the missing loopback sources and proxy-origin substitution. Failures were runtime assertions, not import errors.
  - GREEN: `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts` -> 14 passed. Final full-suite verification is recorded below.
- Required temporary safety mutations, each reverted before final verification:
  1. Echoed `request.url` in the `Invalid URL` error. `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts -t "fixed Invalid URL"` -> 1 failed, 13 skipped; `returns a fixed Invalid URL error without echoing the input` received `Invalid URL: https://user:pass@example.test/private-input-marker` instead of `Invalid URL`.
  2. Kept the empty endpoint host by removing the `host.length > 0` filter. `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts -t "drops empty endpoint hosts"` -> 1 failed, 13 skipped; `drops empty endpoint hosts before URL resolution` received a successful proxy response instead of `Unsupported URL` for `https://bucket./assets/movie.mp4`. The test was later expanded to cover undefined endpoint hosts too.
  3. Removed the `connectionId` plus `anonymous` refinement. `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts -t "rejects extra request keys"` -> 1 failed, 13 skipped; `rejects extra request keys and connectionId with anonymous access` received a successful proxy response for the conflicting request instead of `Invalid request`.
- The IPC tests exercise both registered channels through a fake `ipcMain`, the real `ConnectionStore`/`SecretVault`, and `HandleRegistry`; they scan every response/error with `assertNoSecrets`, including a presigned URL carrying an access key id.

### Task 8: Contract 6 — CSP and window policy

#### Decisions made
- Add the loopback source to `img-src`, `media-src`, and `connect-src`, then add `frame-src` after `connect-src`. The enforced response policy replaces every proxy wildcard with the runtime origin; the static meta policy remains byte-identical to `CSP`.
- Keep the existing Vite development additions and production-safe script/style directives.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/ipc-stream.test.ts test/unit/window.test.ts` -> the four new window assertions failed (`18 failed, 20 passed` overall), showing the missing CSP sources, wildcard substitution, and header origin.
  - GREEN: `pnpm test` -> 16 files passed, 316 tests passed; includes new checks for proxy image/media/connect/frame sources, exact production and dev substitution, preserved Vite sources, byte-identical meta CSP, and production unsafe-directive absence.

### Task 9: Contract 7 — App and preload wiring; Scope C verification

#### Decisions made
- Start the proxy before IPC registration and either `createWindow` call, set its allowed app origin from the renderer URL (or `"null"` for `file://`), reuse its origin for startup/activate windows, and call `stop()` on `before-quit`.
- Expose the typed `stream` API through preload using only the existing `import type` from `ipc.ts`.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- The renderer URL environment variable, when non-empty, is a valid URL.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: covered by the pre-implementation behavioral RED under Task 7: missing stream handler registration and the missing CSP/window behavior.
  - GREEN: `pnpm typecheck` -> exit 0. `pnpm test` -> exit 0; 16 files passed, 316 tests passed.
- `pnpm build` -> exit 0; built main, preload, and renderer bundles.
- Preload require audit: `node -e 'const fs=require("node:fs"); const text=fs.readFileSync("out/preload/index.cjs", "utf8"); const names=[...text.matchAll(/\brequire\s*\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g)].map((match)=>match[1]); console.log(JSON.stringify(names)); if (names.length === 0 || names.some((name)=>name !== "electron")) process.exit(1);'` -> `["electron"]`.
- Headless launch: `timeout 10 xvfb-run -a pnpm exec electron .` -> exit 124. Output was the unrelated Wayland/Vulkan ozone incompatibility line followed by the Electron binary's timeout `SIGTERM` diagnostic; no application error output.
- `git diff --check` -> clean. No integration tests were run. Removed generated `out/`, `tsconfig.node.tsbuildinfo`, and `tsconfig.web.tsbuildinfo`; none are in Git status.
- Final scope checks: `pnpm typecheck` -> exit 0; `pnpm test` -> exit 0, 16 files and 316 tests passed.

## Batch 4: Scope D

### Task 10: Contract 8 — Media fixtures

#### Decisions made
- Generated 10-second test patterns from lavfi sources at modest video/audio bitrates so the small fixtures remain comfortably below 5 MB.
- Wrote the three-page PDF in Bash, computing every object and xref offset from the file's current byte length. Python's standard library is used only for byte-level atom/xref validation.
- Write to per-file temporary paths and atomically rename; non-empty existing outputs are skipped and revalidated.

#### Spec deviations
- none

#### Tradeoffs accepted
- `python3` is required for validating top-level MP4 atom order and PDF byte offsets; it is not used to generate the PDF.

#### Assumptions
- The installed FFmpeg supports the specified H.264/AAC, VP9/Opus, MP3, and FLAC encoders; the executed `ffprobe` checks confirmed those encoders were available.

#### Follow-ups for human
- Scope E exercises `make-media.sh --large`; `large.mp4` was deliberately not generated in Scope D.

#### Test evidence
- `bash -n test/fixtures/make-media.sh && test/fixtures/make-media.sh` -> exit 0; reported `moov` before `mdat` for `faststart.mp4`, `moov` after `mdat` for `tailmoov.mp4`, and a valid three-page PDF/xref.
- Re-running the script -> exit 0 and skipped all seven non-empty existing fixtures, then repeated the validations.
- `ffprobe` results: `faststart.mp4` H.264/AAC, 10.000 s, 547,959 bytes; `tailmoov.mp4` H.264/AAC, 10.000 s, 547,959 bytes; `video.webm` VP9/Opus, 10.008 s, 334,084 bytes; `video.mkv` H.264/Opus, 10.008 s, 493,114 bytes; `audio.mp3` MP3, 10.000 s, 120,729 bytes; `audio.flac` FLAC, 10.000 s, 131,823 bytes. Each is below 5 MB.
- Fixture generator RED: not applicable; its required validations are executable in-script and passed on creation and skip/revalidation runs.

### Task 11: Context & Architecture — Runtime facts

#### Decisions made
- Used ephemeral inline Node probes and a disposable RustFS bucket; no probe files were left in `src/` or `test/`.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
1. `node --input-type=module` probe: a local `node:http` server returned 302 with `Location: /next`; `fetch(url, { redirect: "manual" })` reported `status: 302`, readable `location: /next`, and readable body `redirect-body`.
2. `node --input-type=module` probe with a local HTTP server and SDK `S3Client.send(new GetObjectCommand(...))`: `Body instanceof Readable` was `true`; calling `Body.destroy()` caused the server-side upstream socket `close` event (`upstream socket closed after Body.destroy(): true`). The probe polled for up to 3 seconds.
3. `node --input-type=module` local HTTP probe: a normally completed `/complete` response emitted both `IncomingMessage` `close` and `ServerResponse` `close` while the client had not been destroyed; after a real client socket destroy on `/stream`, `ServerResponse` `close` was observed. Output: `after normally completed response, client not destroyed: ["/complete: response close","/complete: request close"]`; `after explicit client destroy: ["/complete: response close","/complete: request close","/stream: response close","/stream: request close"]`. Thus request close is not a disconnect indicator; use response close with `!writableFinished` to distinguish completion from disconnect.
4. RustFS probe: started with `docker compose -f test/rustfs/compose.yaml up -d`, created a disposable bucket/object containing `0123456789abcdef`, issued SDK `GetObject` requests for each range, then stopped with `docker compose -f test/rustfs/compose.yaml down -v`. `bytes=2-5` -> 206, `ContentRange: bytes 2-5/16`, body `2345`; `bytes=4-` -> 206, `ContentRange: bytes 4-15/16`, body `456789abcdef`; `bytes=-3` -> 206, `ContentRange: bytes 13-15/16`, body `def`; `bytes=20-` -> error name `InvalidRange`, `$metadata.httpStatusCode: 416`; `bytes=-0` -> error name `InvalidRange`, status 416.
5. In that RustFS probe, `getSignedUrl` generated a presigned GET and global `fetch(signedUrl, { method: "HEAD", redirect: "manual" })` returned status 403, no `Location`, and an empty readable body. This agrees with method-bound signatures; the proxy's ranged-GET HEAD path does not rely on upstream HEAD.

### Task 12: Contract 9 — RustFS proxy integration

#### Decisions made
- Reused `setupHarness`, `createTestBucket`, `emptyAndDeleteBucket`, and `assertNoSecrets`; added a real registry/proxy and a second real `register` setup with the harness's real store/vault/factory and the counting client override.
- Uploaded both MP4 fixtures, validated exact prefix/suffix/open-ended range bytes, full-object SHA-256, HEAD, and past-end 416; covered token/method rejection and presigned/configured-endpoint URL paths.
- Generated the 200 MiB random object lazily in 1 MiB `randomBytes` chunks through `Readable.from` and `lib-storage` `Upload` (8 MiB parts, queue size 2), avoiding a whole-object Buffer.

#### Spec deviations
- none

#### Tradeoffs accepted
- The proxy-abort integration test destroys the real Node HTTP response after at least 4 MiB has arrived; the received event chunk can make the reported client byte count slightly exceed 4 MiB.

#### Assumptions
- Case-insensitive `rg -ni 'akia|asia' test/fixtures/make-media.sh test/integration/proxy.test.ts` found no forbidden substrings in fixture/object names or test source.

#### Follow-ups for human
- none

#### Test evidence
- Focused GREEN: `pnpm exec vitest run --project integration test/integration/proxy.test.ts` -> 1 file passed, 4 tests passed.
- Required abort safety mutation: temporarily commented out `controller.abort()` in the `res.on("close")` handler while retaining body destruction. `pnpm exec vitest run --project integration test/integration/proxy.test.ts -t 'aborts the upstream stream'` -> 1 failed, 3 skipped; exact failure was `Error: waitFor timed out after 15000 ms` at the abort-signal assertion. Reverted with `git checkout -- src/main/stream/proxy.ts`; subsequent `git diff -- src/main/stream/proxy.ts` was empty.
- Required token safety mutation: temporarily removed `!tokenMatches(token, expectedToken)` from proxy routing. `pnpm exec vitest run --project integration test/integration/proxy.test.ts -t 'same fixed 403'` -> 1 failed, 3 skipped; exact assertion was `expected 200 to be 403` for the missing-token request. Reverted with `git checkout -- src/main/stream/proxy.ts`; subsequent `git diff -- src/main/stream/proxy.ts` was empty.
- Three consecutive required `pnpm test:integration` runs each exited 0 with 7 files and 25 tests passed (run durations 37.46 s, 37.66 s, and 36.48 s). The final scope-verification run also exited 0 with 7 files and 25 tests passed (32.65 s).
- The tests assert the client received at least 4 MiB before destroy, upstream bytes remained below 15,728,640, and the injected SDK `abortSignal` became aborted via polling with a 15-second deadline. Every stream IPC response/error is passed through `assertNoSecrets`.

### Scope verification
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> exit 0; 16 files passed, 316 tests passed.
- Final `pnpm test:integration` -> exit 0; 7 files passed, 25 tests passed. The three immediately consecutive required integration runs also each passed as recorded above.
- `docker ps --filter 'name=rustfs' --format '{{.Names}} {{.Status}}'` -> no output; no RustFS container remained.
- `git diff --check` -> clean. Removed generated `out/`, `test/.tmp/`, and root TypeScript build-info files after verification; no worker-generated artifacts remain in Git status. `src/main/stream/proxy.ts` has no diff after both required safety mutations.

## Batch 5: Scope E

### Task 13: Contract 10 — Seek check and closeout

#### Decisions made
- Added exact-pinned `jiti@2.7.0`, the `seek:2gb` package script, and the script TypeScript include; the offline pnpm lockfile diff adds only the jiti importer entry.
- The seek script uses a `createReadStream` and `lib-storage` `Upload` (8 MiB parts, queue size 2), a counting `Transform` around the SDK `GetObject` body, and the actual SDK `abortSignal`. It only reads 4 MiB from the client before destroying its HTTP request.
- The script probes RustFS with `ListBucketsCommand`, starts the compose service only when the probe fails, and uses `try/finally` plus SIGINT/SIGTERM handlers to clean up the proxy, object, bucket, client, and any RustFS service it started.
- Retained the generated 2,227,667,364-byte `test/.tmp/media/large.mp4` as the ignored cache for subsequent seek checks.

#### Spec deviations
- none

#### Tradeoffs accepted
- The ffmpeg CBR buffer is 1800M rather than 3600M because x264's `bufsize` option is bounded by a signed 32-bit value; the 1800M rate still generated a file above the required 2 GiB threshold.

#### Assumptions
- RustFS is available through the compose service at `http://127.0.0.1:19000`, with the fixture credentials and region specified by the plan.

#### Follow-ups for human
- none

#### Test evidence
- Offline dependency install: `pnpm add -D -E jiti@2.7.0 --offline` -> exit 0. Output:
  ```text
  ✓ Lockfile passes supply-chain policies (verified 5h ago)
  Lockfile is up to date, resolution step is skipped
  Already up to date

  devDependencies:
  + jiti 2.7.0

  Done in 895ms using pnpm v11.22.0
  ```
- `git diff -- pnpm-lock.yaml` -> exit 0; the entire diff is only:
  ```diff
  +      jiti:
  +        specifier: 2.7.0
  +        version: 2.7.0
  ```
- Large fixture root-cause reproduction: first `test/fixtures/make-media.sh --large` -> exit 222. ffmpeg reported:
  ```text
  [libx264 @ 0x5d1da00d1200] Value 3600000000.000000 for parameter 'bufsize' out of range [-2.14748e+09 - 2.14748e+09]
  [libx264 @ 0x5d1da00d1200] Error setting option bufsize to value 3600M.
  [vost#0:0/libx264 @ 0x5d1da00d0c80] Error applying encoder options: Numerical result out of range
  Error opening output file /home/ngosi/projects/s3-explorer/test/.tmp/media/large.304993.mp4.
  Error opening output files: Numerical result out of range
  ```
  Root cause: 3600M is 3,600,000,000, larger than x264's signed 32-bit `bufsize` maximum. Changed only the large fixture's buffer to 1800M; bitrate, minrate, and maxrate remain 1800M. GREEN: the rerun of `test/fixtures/make-media.sh --large` -> exit 0 and printed `Verified moov before mdat: faststart.mp4`, `Verified moov after mdat: tailmoov.mp4`, `Verified doc.pdf header, trailer, three pages, and xref offsets`, and `Media fixtures ready in /home/ngosi/projects/s3-explorer/test/.tmp/media`. `stat -c '%n %s bytes' test/.tmp/media/large.mp4` -> `test/.tmp/media/large.mp4 2227667364 bytes`; `ffprobe -v error -show_entries stream=codec_name -of csv=p=0 test/.tmp/media/large.mp4` -> `h264` and `aac`.
- Required abort-detection mutation: temporarily removed `controller.abort()` from the client-close handler in `src/main/stream/proxy.ts` while retaining `upstreamBody?.destroy()`. `pnpm seek:2gb` -> exit 1, with the abort check named:
  ```text
  $ jiti scripts/seek-2gb.ts
  RustFS did not answer ListBuckets; starting the compose service
   Network rustfs_default  Creating
   Network rustfs_default  Created
   Container rustfs-rustfs-1  Creating
   Container rustfs-rustfs-1  Created
   Container rustfs-rustfs-1  Starting
   Container rustfs-rustfs-1  Started
  RustFS is ready
  ttfbMs=23.52 clientBytes=4210478 upstreamBytes=6242041 fileBytes=2227667364 offset=1113833682 upstreamAborted=false
   Container rustfs-rustfs-1  Stopping
   Container rustfs-rustfs-1  Stopped
   Container rustfs-rustfs-1  Removing
   Container rustfs-rustfs-1  Removed
   Network rustfs_default  Removing
   Network rustfs_default  Removed
  seek:2gb failed: Seek threshold failure: upstream abort signal was not aborted
  [ELIFECYCLE] Command failed with exit code 1.
  ```
  Reverted exactly with `git checkout -- src/main/stream/proxy.ts`; `git diff -- src` -> empty (exit 0). `docker ps --filter 'name=rustfs' --format '{{.Names}} {{.Status}}'` -> no output.
- Two required real runs after reverting the mutation both exited 0. `pnpm seek:2gb` run 1 output:
  ```text
  $ jiti scripts/seek-2gb.ts
  RustFS did not answer ListBuckets; starting the compose service
   Network rustfs_default  Creating
   Network rustfs_default  Created
   Container rustfs-rustfs-1  Creating
   Container rustfs-rustfs-1  Created
   Container rustfs-rustfs-1  Starting
   Container rustfs-rustfs-1  Started
  RustFS is ready
  ttfbMs=23.92 clientBytes=4210478 upstreamBytes=6230830 fileBytes=2227667364 offset=1113833682 upstreamAborted=true
   Container rustfs-rustfs-1  Stopping
   Container rustfs-rustfs-1  Stopped
   Container rustfs-rustfs-1  Removing
   Container rustfs-rustfs-1  Removed
   Network rustfs_default  Removing
   Network rustfs_default  Removed
  ```
  Run 2 output:
  ```text
  $ jiti scripts/seek-2gb.ts
  RustFS did not answer ListBuckets; starting the compose service
   Network rustfs_default  Creating
   Network rustfs_default  Created
   Container rustfs-rustfs-1  Creating
   Container rustfs-rustfs-1  Created
   Container rustfs-rustfs-1  Starting
   Container rustfs-rustfs-1  Started
  RustFS is ready
  ttfbMs=25.37 clientBytes=4228855 upstreamBytes=4462167 fileBytes=2227667364 offset=1113833682 upstreamAborted=true
   Container rustfs-rustfs-1  Stopping
   Container rustfs-rustfs-1  Stopped
   Container rustfs-rustfs-1  Removing
   Container rustfs-rustfs-1  Removed
   Network rustfs_default  Removing
   Network rustfs_default  Removed
  ```

#### Final Done When verification
- Fresh `pnpm typecheck` -> exit 0 (`tsc -b tsconfig.node.json tsconfig.web.json`).
- Fresh `pnpm test` -> exit 0; 16 test files passed, 316 tests passed.
- Fresh `pnpm test:integration` -> exit 0; 7 test files passed, 25 tests passed; RustFS compose teardown completed.
- Fresh `pnpm build` -> exit 0; main, preload, and renderer bundles built.
- Preload require audit, after build: `node -e 'const fs=require("node:fs"); const text=fs.readFileSync("out/preload/index.cjs", "utf8"); const names=[...text.matchAll(/\brequire\s*\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g)].map((match)=>match[1]); console.log(JSON.stringify(names)); if (names.length === 0 || names.some((name)=>name !== "electron")) process.exit(1);'` -> exit 0, output `["electron"]` (the only require specifier is `electron`).
- Fresh required headless launch `timeout 10 xvfb-run -a pnpm exec electron .` -> exit 124 as expected. Output contained only the unrelated Wayland/Vulkan ozone line and timeout termination:
  ```text
  [336096:1104/021608.592031:ERROR:ui/ozone/platform/wayland/gpu/wayland_surface_factory.cc:249] '--ozone-platform=wayland' is not compatible with Vulkan. Consider switching to '--ozone-platform=x11' or disabling Vulkan
  /home/ngosi/projects/s3-explorer/node_modules/.pnpm/electron@45.2.1_supports-color@7.2.0/node_modules/electron/dist/electron exited with signal SIGTERM
  ```
- Final fresh `pnpm seek:2gb` -> exit 0, output:
  ```text
  $ jiti scripts/seek-2gb.ts
  RustFS did not answer ListBuckets; starting the compose service
   Network rustfs_default  Creating
   Network rustfs_default  Created
   Container rustfs-rustfs-1  Creating
   Container rustfs-rustfs-1  Created
   Container rustfs-rustfs-1  Starting
   Container rustfs-rustfs-1  Started
  RustFS is ready
  ttfbMs=33.76 clientBytes=4209577 upstreamBytes=7552814 fileBytes=2227667364 offset=1113833682 upstreamAborted=true
   Container rustfs-rustfs-1  Stopping
   Container rustfs-rustfs-1  Stopped
   Container rustfs-rustfs-1  Removing
   Container rustfs-rustfs-1  Removed
   Network rustfs_default  Removing
   Network rustfs_default  Removed
  ```
  All thresholds pass: TTFB <= 2,000 ms, upstream bytes <= 15,728,640, at least 4 MiB delivered to the client, and upstream abort observed.
- Final `docker ps --format '{{.Names}} {{.Status}}'` -> exit 0, no RustFS container; only unrelated `open-design`, `gemini-web2api`, and `3proxy` containers were listed.
- `git diff --check` -> exit 0, clean; `git diff -- src` -> exit 0, empty. The final `git status --short` -> exit 0 and showed only the declared Scope E paths plus the pre-existing coordinator-owned `docs/plans/s3-media-explorer/.handover.md` change (left untouched). `out/` and TypeScript build-info artifacts were removed after verification; the required large fixture remains ignored under `test/.tmp/media/`.
- Existing Scope A–D Done When evidence remains above: URL coverage and secret scans, 16 unit files/316 tests, 7 integration files/25 tests, IPC behavior, protected-source audit, and the exact CSP/meta behavior were included in the fresh unit/integration runs.

## Batch 8: FINAL FIX

### Decisions made
- Encoded upstream 416 responses keep their mapped proxy status/body but do not
  relay representation-specific Content-Range metadata.
- Encoded pass-through 206 responses use the existing fixed 502 response; cancel
  the upstream body before sending the fixed response. Encoded 200 behavior stays
  unchanged.

### Spec deviations
- none

### Tradeoffs accepted
- none

### Assumptions
- An identity Content-Encoding value is not encoded, consistent with
  `isEncodedContent` and existing pass-through header behavior.

### Follow-ups for human
- none

### G1: Do not relay encoded Content-Range on pass-through 416
- Root cause: the 416 error branch copied upstream Content-Range unconditionally.
- Tests were written before production changes: gzip-encoded 416 omits the header;
  identity 416 retains it.
- Behavioral RED: `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'does not relay encoded Content-Range|cancels the encoded upstream 206 body|gzip-encoded pass-through 416|identity pass-through 416'` -> 3 failed, 1 passed, 62 skipped (66 total). The gzip 416 assertion failed because it received `bytes */10` rather than `null`; the identity 416 test passed.

### G2: Reject encoded pass-through 206
- Root cause: encoded 206 responses entered the pass-through streaming path, relaying a partial status without a valid Content-Range.
- Updated the existing `does not relay encoded Content-Range or Content-Length` test to require fixed 502 / `Upstream error`; added an open-body test verifying upstream closure.
- Behavioral RED: same focused command -> 3 failed, 1 passed, 62 skipped (66 total). Both encoded 206 tests received status 206 instead of 502; the identity 416 test passed. No production code was changed before these behavioral failures.

### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'does not relay encoded Content-Range|cancels the encoded upstream 206 body|gzip-encoded pass-through 416|identity pass-through 416'` -> 3 failed, 1 passed, 62 skipped (66 total). Assertions showed the encoded 206 requests returning 206 instead of 502 and the gzip 416 relaying `bytes */10`; identity 416 passed.
  - During implementation, the first focused rerun had 1 failed and 3 passed: the revised fixed-502 test expected no Content-Length, but Node supplied the fixed body's valid length `14`. Updated the assertion to `14`.
  - GREEN: the same focused command -> 4 passed, 62 skipped (66 total). The open encoded-206 response was cancelled before the fixed 502 was returned (`upstreamEnded` was false when its close event fired).
- Fresh final verification from the repository root:
  - `pnpm typecheck` -> exit 0.
  - `pnpm test` -> exit 0; 16 files passed, 329 tests passed.
  - `pnpm test:integration` -> exit 0; 7 files passed, 25 tests passed; RustFS compose teardown completed.
  - `pnpm build` -> exit 0; main, preload, and renderer bundles built.
  - `pnpm seek:2gb` -> exit 0; `ttfbMs=24.56`, `clientBytes=4197730`,
    `upstreamBytes=6820654`, `fileBytes=2227667364`,
    `offset=1113833682`, `upstreamAborted=true`.
- Preload audit after build -> exit 0; `out/preload/index.cjs` requires
  `['electron']` only.
- `docker ps --filter 'name=rustfs' --format '{{.Names}} {{.Status}}'` -> exit
  0, no output; no RustFS container remained.
- `git diff --check` -> exit 0, clean. The final status shows only the three
  implementation/test/notes paths and the required journal response, all
  allowed paths. The touched TypeScript files contain no `any` annotations.


## Batch 6: FIX 1

### Overview
Addressed quality cycle 1 findings B1-B3 (blocking) and N1-N6 (non-blocking) across proxy streaming, URL IPC handling, and application lifecycle.

### Blocking findings

#### B1: Missing ContentLength handling in setS3Headers
- Root cause: `setS3Headers` defaulted missing `ContentLength` to `0`, setting `Content-Length: 0` which truncated chunked GET responses and reported 0 on HEAD.
- Failing tests added:
  - `delivers full body on S3 GET when ContentLength is missing`
  - `omits Content-Length on S3 HEAD when ContentLength is missing`
- Behavioral RED:
  - `pnpm exec vitest run --project unit test/unit/proxy.test.ts`
  - `FAIL test/unit/proxy.test.ts > delivers full body on S3 GET when ContentLength is missing and omits Content-Length` (expected null, received "0")
  - `FAIL test/unit/proxy.test.ts > sends no Content-Length on S3 HEAD when ContentLength is missing` (expected null, received "0")
- Fix: `setS3Headers` only sets `Content-Length` when `typeof contentLength === "number"`, omitting it otherwise so Node uses chunked transfer encoding on GET.
- GREEN: Both tests passed.

#### B2: Missing ContentLength validation in describeS3
- Root cause: `describeS3` defaulted missing `output.ContentLength` to `0` instead of rejecting with a coded failure.
- Failing test added:
  - `rejects describe when S3 ContentLength is missing`
- Behavioral RED:
  - `pnpm exec vitest run --project unit test/unit/proxy.test.ts`
  - `FAIL test/unit/proxy.test.ts > rejects describe with REQUEST_FAILED when S3 ContentLength is missing` (promise resolved `{ contentType: 'video/mp4', size: 0 }` instead of rejecting)
- Fix: `describeS3` throws `codedError("REQUEST_FAILED", "Request failed")` when `typeof output.ContentLength !== "number"`.
- GREEN: Test passed.

#### B3: Pass-through Accept-Encoding and Content-Encoding handling
- Root cause: Undici sends `Accept-Encoding: gzip, deflate` on requests without `Range` and transparently decodes gzip responses while the proxy relayed the upstream compressed `Content-Length`.
- Failing test and test updates added:
  - Updated existing pass-through allowlist test expectation to include `accept-encoding: identity`, asserting client `Accept-Encoding`, `Authorization`, `Cookie`, and custom headers are omitted.
  - Added test `receives uncompressed bytes when upstream gzips if allowed` with an upstream that gzips when allowed.
- Behavioral RED:
  - `pnpm exec vitest run --project unit test/unit/proxy.test.ts`
  - `FAIL test/unit/proxy.test.ts > receives uncompressed bytes when upstream gzips if allowed...` (expected "identity", received "gzip, deflate")
- Fix:
  - Added `"Accept-Encoding": "identity"` to `passThroughHeaders` and `describePassThrough`.
  - Updated `setPassThroughHeaders` to omit `Content-Length` when upstream sends `Content-Encoding`.
- GREEN: Both tests passed; uncompressed body matches exact payload and upstream received `identity`.

### Non-blocking findings

#### N1: Wrap index.ts proxy startup in try/catch
- Wrapped startup in `src/main/index.ts` within a `try/catch` block calling `dialog.showErrorBox("S3 Media Explorer", "The media proxy could not start.")` and `app.quit()`, with no upstream or error details displayed.

#### N2: Destroy upstreamBody on error in routeRequest
- Added `upstreamBody?.destroy()` in the outer `catch` block of `routeRequest` in `src/main/stream/proxy.ts`.

#### N3: Proxy start/stop race and cached rejection
- Updated `start()` in `src/main/stream/proxy.ts` to clear `starting = undefined` and `server = undefined` upon rejection.
- Updated `stop()` to await a pending `starting` promise before closing connections and shutting down the server.
- Added test: `leaves nothing listening when stopped during start`. Behavioral RED: `Error: Server was still listening after stop during start` (port connection accepted). GREEN: socket connection refused (`ECONNREFUSED`).
- Note: Start after a failed start against port 0 on loopback in Node without mocking or monkeypatching internal networking APIs is hard to provoke; per prompt instructions, the first case was tested and this condition documented.

#### N4: Upstream abort on client destroy during pass-through GET
- Added unit test in `test/unit/proxy.test.ts`: `aborts upstream on client destroy during pass-through`. Polled upstream request and socket close events with `waitFor` deadline. Test passed.

#### N5: proxy.ts code quality
- Merged type imports from `../connections/store` into `import type { ConnectionStore, ConnectionView } from "../connections/store"`.
- Replaced non-null assertion on `accept-ranges` with local const `acceptRanges`.
- Extracted shared `parsePassThroughSize(status, headers)` helper for status-to-size logic across `describePassThrough` and `passThroughHeadResult`.
- Renamed signal variable in `describePassThrough` from `controller` to `requestSignal`.
- Wrapped lines near 80 columns with tabs counting as 4 across all modified files.

#### N6: stream.ts simplification
- Changed `let connection` to `const connection`.
- Merged pass-through branches into single condition `value.kind === "presigned" || request.anonymous === true`.

### Final Verification Results
- `pnpm typecheck` -> exit 0 (`tsc -b tsconfig.node.json tsconfig.web.json`)
- `pnpm test` -> exit 0; 16 test files passed, 322 tests passed
- `pnpm test:integration` -> exit 0; 7 test files passed, 25 tests passed
- `pnpm build` -> exit 0
- Preload require check: `["electron"]` (only `electron` required in `out/preload/index.cjs`)
- `pnpm seek:2gb` -> exit 0:
  - `ttfbMs=24.33`
  - `clientBytes=4210478`
  - `upstreamBytes=6242041`
  - `fileBytes=2227667364`
  - `offset=1113833682`
  - `upstreamAborted=true`
- `docker ps` -> exit 0; no RustFS containers running
- `git status --short` -> only allowed paths modified:
  - `src/main/index.ts`
  - `src/main/ipc/stream.ts`
  - `src/main/stream/proxy.ts`
  - `test/unit/proxy.test.ts`
  - `docs/plans/s3-media-explorer/phase-05/notes.md`
  - `docs/plans/s3-media-explorer/phase-05/journal.md`
  (plus coordinator-owned `.handover.md` left untouched)

## Batch 7: FIX 2

### Overview
Addressed the final encoded pass-through response findings F1–F2 and the
catch-all startup dialog wording N1.

### Blocking findings

#### F1: Encoded pass-through responses cannot provide a trustworthy size
- Root cause: `parsePassThroughSize` interpreted `Content-Length` and
  `Content-Range` without checking `Content-Encoding`. Undici decodes the body,
  so those encoded representation sizes/offsets cannot be reported.
- Failing coverage: added an unconditional-gzip local upstream returning 200
  without Range and 206 with a compressed Content-Range for Range requests.
  The tests verify full GET body decoding, ranged GET header suppression, HEAD
  502, and a coded `REQUEST_FAILED` from `describe`. The upstream's
  `accept-encoding` assertion remains in place.
- Behavioral RED:
  - `pnpm exec vitest run --project unit test/unit/proxy.test.ts -t 'unconditionally gzipped|encoded Content-Range|encoded pass-through HEAD|metadata is encoded|identity-encoded responses'`
  - 4 failed, 1 passed, 58 skipped. Encoded range relayed
    `Content-Range: bytes 0-3/67`; encoded HEAD returned 200 instead of 502;
    `describe` resolved `{ contentType: 'text/plain', size: 67 }` instead of
    rejecting with `REQUEST_FAILED`; identity-encoded Content-Length was
    omitted instead of retained. These were behavioral assertion failures.
- Fix: a shared encoding predicate treats a present `Content-Encoding` as
  encoded unless its trimmed, lowercased value is `identity`. Encoded
  pass-through responses produce no size in `parsePassThroughSize`.
- GREEN: the same focused command -> 5 passed, 58 skipped.

#### F2: Encoded Content-Length and Content-Range must not be relayed
- Root cause: the response-header relay omitted Content-Length for any
  Content-Encoding but still forwarded encoded Content-Range; it also treated
  `identity` as encoded for Content-Length.
- Fix: `setPassThroughHeaders` relays neither Content-Length nor Content-Range
  for encoded responses. Identity encoding (case-insensitive and trimmed)
  preserves both headers.
- Behavioral RED and GREEN commands/results are recorded under F1; the ranged
  GET asserted both encoded headers absent, while the identity-encoded 206
  asserted Content-Length `2` and Content-Range `bytes 1-2/4` are retained.

### Non-blocking finding

#### N1: Catch-all startup dialog wording
- Changed the fixed dialog message to `S3 Media Explorer could not start.`;
  the title remains `S3 Media Explorer`. The catch block does not log the
  error, since its text may contain credentials.

### Final verification
- `pnpm typecheck` -> exit 0.
- `pnpm test` -> exit 0; 16 test files passed, 326 tests passed.
- `pnpm test:integration` -> exit 0; 7 test files passed, 25 tests passed.
- `pnpm build` -> exit 0; main, preload, and renderer bundles built.
- Preload require audit after build -> exit 0; output `["electron"]`;
  every require specifier in `out/preload/index.cjs` is `electron`.
- `pnpm seek:2gb` -> exit 0: `ttfbMs=19.39`, `clientBytes=4210478`,
  `upstreamBytes=8273710`, `fileBytes=2227667364`,
  `offset=1113833682`, `upstreamAborted=true`.
- `docker ps --filter 'name=rustfs' --format '{{.Names}} {{.Status}}'` -> exit
  0, no RustFS container remained after integration and seek checks.
- `git diff --check` -> clean. Final Git status verification is recorded in
  the response; generated build artifacts are ignored and no extra paths were
  introduced.
