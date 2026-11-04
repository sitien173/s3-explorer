# Phase 5: Stream proxy and URL resolver

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with TDS. Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/DESIGN.md` (read-only; flows 4 and 5, invariants 1 and 2, the Errors table, and risk 1).
- Phase Outcome: Through zod-validated typed IPC the renderer API can call `api.stream.open({ connectionId, bucket, key })` and `api.stream.openUrl({ url, connectionId?, anonymous? })`. Each returns `{ url, contentType, size }`, where `url` is `http://127.0.0.1:<port>/o/<handle>?t=<token>` on a main-process signing proxy. The proxy serves object bytes with correct 200, 206, and 416 semantics, aborts upstream work when the client disconnects, never buffers a body whole, and never sends credentials to a pass-through host. The CSP lets the renderer load media, images, and frames from the proxy and nowhere else on the network. The opt-in `pnpm seek:2gb` check shows that a seek to 50% of a 2 GiB MP4 starts within 2,000 ms and pulls at most 15 MiB from storage. No UI.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-05/base`
- Prior State: Phases 1 to 4 are complete. Baseline at the base commit: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build` all exit 0, with 133 unit tests and 21 integration tests passing. Every package you need is in `package.json` already (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, and `@aws-sdk/s3-request-presigner` at 3.1161.0, `zod` 4.6.7). The only dependency change allowed is contract 10.
  - `src/shared/channels.ts` holds the zod-free `channels` and `events` constants and imports nothing.
  - `src/shared/ipc.ts` holds `schemas`, strict `responseSchemas`, `errorSchema`, `envelopeSchema`, event payload schemas, inferred types, `RequestByChannel`, `ResponseByChannel`, `AnyChannel`, `Result`, and the `Api` type (namespaces `connections`, `buckets`, `objects`, `search`, `ops`, `transfers`). Request schemas name the connection field `connectionId`. Copy how existing schemas constrain `bucket` and `key` instead of inventing new limits.
  - `src/main/ipc/register.ts` exports `register(ipcMain, deps)` where `deps` is `IpcDeps & { maxSearchMatches?, dialog?, maxActiveTransfers? }`. It validates each request, passes `{ sender }` to the handler, validates the response against a strict schema, and wraps it in `{ ok, data | error }`. A thrown error whose string `code` is in `errorCodes` keeps that code. `INVALID_REQUEST` keeps the handler's own message. `REQUEST_FAILED` keeps the message with `AKIA` and `ASIA` key ids replaced by `[redacted]`. `ACCESS_DENIED` is always `"Access denied"`. `CONFLICT` and `TOO_LARGE` have fixed messages. Every other code is `"Request failed"`. This means an `INVALID_REQUEST` message you write reaches the renderer verbatim, so it must never echo user input.
  - `src/main/ipc/browse.ts` exports `mapS3Error(error, connection?)`, which returns `{ code, message, profile? }`. Its module-private `throwMappedError` rethrows `Object.assign(new Error(mapped.message), mapped)`. `browseHandlers` is the reference for connection lookup (`deps.store.get`, then a coded `NOT_FOUND` "Connection not found").
  - `src/main/ipc/ops.ts` is the reference for an optional injected dependency: `requireDialog` throws a coded `REQUEST_FAILED` "Dialog unavailable" when `deps.dialog` is missing. Mirror that for `deps.stream`.
  - `src/main/ipc/connections.ts` exports `IpcDeps` (`store`, `clients: Pick<S3ClientFactory, "get" | "invalidate">`, `configFilepath?`, `credentialsFilepath?`, `login?`). Do not edit it. `src/main/connections/**` is also off limits. `store.get(id)` and `store.list()` return `ConnectionView` (`id`, `name`, `kind`, `profile?`, `region?`, `endpoint?`, `forcePathStyle`, `pinnedBuckets`, `extraBuckets`, `sessionOnly`, `hasSecret`).
  - `src/main/s3/client.ts` exports `S3ClientFactory.get(connection)`, which returns a cached `S3Client` with `followRegionRedirects: true`.
  - `src/main/window.ts` exports `CSP`, `buildCsp({ dev })`, `buildWindowOptions`, `createWindow`, and `toExternalHttpsUrl`. `test/unit/window.test.ts` requires the `<meta http-equiv="Content-Security-Policy">` in `src/renderer/index.html` to be byte-identical to `CSP`, and requires `buildCsp({ dev: false })` to equal `CSP`.
  - `src/main/index.ts` creates the store, vault, and factory in `app.whenReady()`, calls `register(ipcMain, { store, clients, dialog })`, and calls `createWindow()` twice (startup and `activate`).
  - `src/preload/index.ts` builds a frozen `api` of type `Api` with only `import type` from `ipc.ts` and values from `channels.ts`. The built `out/preload/index.cjs` may `require` only `electron`.
  - `test/integration/helpers.ts` exports `createFakeCipher`, `createIntegrationSender`, `setupHarness` (real store, vault, factory, a manual RustFS connection, a raw `s3Client`, and the registered `handlers` map), `createTestBucket`, `emptyAndDeleteBucket`, and `seedObjects`. `test/unit/secret-scan.ts` exports `assertNoSecrets(value)`, a case-insensitive scan for `akia`, `asia`, `aws_secret`, `secretaccesskey`, `sessiontoken`, and `x-amz-signature` in strings and object keys.
  - Vitest has two projects, `unit` and `integration`. `pnpm test:integration` runs `test/integration/global-setup.ts`, which starts RustFS (`docker compose -f test/rustfs/compose.yaml up -d`, endpoint `http://127.0.0.1:19000`, keys `rustfsadmin`/`rustfsadmin`, region `us-east-1`, path-style) and stops it with `down -v` afterwards. RustFS is not running when this phase starts. Its `/data` is a `tmpfs`, so stored objects live in RAM. The host has about 10 GB of available memory, enough for one 2 GiB object.
  - `tsconfig.node.json` includes `src/main`, `src/preload`, `src/shared`, `test`, and two config files. It does not include `scripts/`.
- Tooling facts established by a Coordinator probe:
  - Node is 24.18.0, so global `fetch`, `Readable.fromWeb`, and `crypto.timingSafeEqual` are available. `ffmpeg` and `ffprobe` 8.0.1 are installed with `libx264`, `libvpx-vp9`, `aac`, `libopus`, `libmp3lame`, and `flac` encoders.
  - There is no `tsx`. `jiti` 2.7.0 is already in `pnpm-lock.yaml` as a transitive dependency, and `pnpm exec jiti <file>.ts` runs a TypeScript file whose imports have no extension.
  - 121 GB of disk is free.
- Facts you must verify yourself before relying on them, and record the result of each in `notes.md`:
  1. Node `fetch` with `redirect: "manual"` returns the 3xx response with a readable `Location` header.
  2. In Node the SDK's `GetObject` `Body` is a `Readable`, and destroying it closes the upstream socket.
  3. `req.on("close")` on `http.IncomingMessage` does NOT mean the client disconnected in modern Node, because it fires when the request is fully read. Use `res.on("close")` and test it with a real client destroy.
  4. What RustFS returns for `GetObject` with `Range` that is valid, open-ended, a suffix, and past the end (error name and `$metadata.httpStatusCode`), and for `bytes=-0`.
  5. What RustFS returns for `HEAD` on a presigned `GET` URL. AWS rejects it because the method is part of the signature. The pass-through HEAD design below does not depend on the answer.
- Earlier verified facts that still hold: RustFS rejects object keys containing `//`; `HeadObject` on a missing key throws an error named `NotFound`; `GetObject` on a missing key throws `NoSuchKey`.
- Code Context: read the installed packages under `node_modules/.pnpm` for anything not listed above, for example `GetObjectCommandOutput.ContentRange`, `getSignedUrl`, and how `undici` exposes response bodies.

## Invariants & Boundaries
- Invariant 1: no AWS secret, session token, access key id, or signed or presigned URL reaches the renderer, in any IPC response, IPC error message, event, proxy response header, or proxy response body. The proxy URL `http://127.0.0.1:<port>/o/<handle>?t=<token>` is allowed because it holds only the local token. Proxy error bodies are fixed strings and never carry upstream text.
- Invariant 2: the proxy binds only `127.0.0.1` and returns 403 for a missing or wrong token, an unknown handle, and any method other than GET or HEAD.
- The server listens on `127.0.0.1` port `0`. Never use `localhost`, `0.0.0.0`, or `::`.
- The token is 256 bits from `crypto.randomBytes(32)` rendered as 64 lowercase hex characters, generated once per proxy instance, and compared with `crypto.timingSafeEqual`. Buffers of different lengths are a mismatch, checked before the call.
- Handles are random 128-bit values from `crypto.randomBytes(16)` rendered as 32 lowercase hex characters.
- S3 requests go only through `clients.get(connection)`. Pass-through requests use global `fetch` with no credentials.
- Response bodies are streamed with `stream.pipeline` and backpressure. No code path may collect a whole body into memory.
- No new production code uses `any`. No new dependency except `jiti` as in contract 10. Do not touch `src/main/ipc/connections.ts`, `src/main/connections/**`, `src/main/ipc/browse.ts`, `src/main/ipc/ops.ts`, `src/main/s3/**`, or the Phase 4 tests, except where a contract below names the file.
- `src/main/stream/**` and `src/main/url/**` must not import `electron`. They are used by the seek script under plain Node.
- The built preload requires nothing except `electron`.

## Contracts
These are binding. Where this text and `PLAN.md` differ, this text wins; each difference is a logged Coordinator decision.

### Contract 1: URL resolver, `src/main/url/resolve.ts`
Pure, no I/O.
```ts
export type ResolvedUrl =
	| { kind: "presigned"; url: string }
	| { kind: "object"; bucket: string; key: string; region?: string; url: string };
export type ResolveResult =
	| { ok: true; value: ResolvedUrl }
	| { ok: false; reason: "invalid" | "unsupported" };
export function resolveUrl(input: string, options: { endpointHosts: readonly string[] }): ResolveResult;
export function endpointHostOf(endpoint: string | undefined): string | undefined;
```
Rules, applied in this order:
1. Trim the input. Empty or longer than 8192 characters gives `invalid`. `new URL` failure gives `invalid`. A URL with a username or password gives `invalid`.
2. Scheme `s3:`: `bucket` is the parsed hostname, `key` is the percent-decoded pathname without its leading `/`. An empty bucket or key gives `invalid`. Query and fragment are ignored. `url` is the canonical HTTPS URL: `https://<bucket>.s3.amazonaws.com/<key>` when the bucket has no dots, otherwise `https://s3.amazonaws.com/<bucket>/<key>`, with each key segment encoded by `encodeURIComponent` and joined by `/`. `region` is undefined.
3. A scheme other than `http:`, `https:`, and `s3:` gives `unsupported`.
4. Presign detection on any `http:` or `https:` host, before any host rule: a query parameter named `X-Amz-Signature`, or both `Signature` and `Expires`, with names compared case-insensitively. The result is `{ kind: "presigned", url: <trimmed input, byte for byte> }`.
5. Unsigned AWS hosts, `https:` only, default port only. The hostname must match one of these forms, with lowercase comparison and `<region>` matching `[a-z]{2}(-[a-z]+)+-[0-9]+`:
   - Path-style hosts: `s3.amazonaws.com`, `s3.<region>.amazonaws.com`, `s3-<region>.amazonaws.com`, `s3.dualstack.<region>.amazonaws.com`, `s3-fips.<region>.amazonaws.com`, and `s3-fips.dualstack.<region>.amazonaws.com`. `bucket` is the first path segment and `key` is the remaining decoded segments joined by `/`. Either one empty gives `invalid`.
   - Virtual-hosted hosts: any path-style host preceded by `<bucket>.`, where the bucket may contain dots, so match the S3 suffix from the right. `key` is the decoded pathname without the leading `/`. An empty key gives `invalid`.
   - `region` comes from the host when it has one.
   - Every other `*.amazonaws.com` host (other services, `s3-accelerate`, `s3-website`, `s3-external-1`, access points, object lambda), a non-default port, `http:`, and `.amazonaws.com.cn` give `unsupported`. Lookalikes such as `evil-amazonaws.com`, `amazonaws.com.evil.com`, and `s3.amazonaws.com.evil.com` give `unsupported`.
6. Unsigned configured-endpoint hosts, `http:` or `https:`. `options.endpointHosts` holds values from `endpointHostOf`, which is `new URL(endpoint).host.toLowerCase()` (hostname plus port when the port is not the scheme default), or `undefined` for a missing or unparsable endpoint. If `URL.host` equals an entry, the URL is path-style as above. Otherwise, if `URL.host` ends with `.<entry>`, it is virtual-hosted with the prefix labels as the bucket.
7. Anything else gives `unsupported`.
8. For `http:` and `https:` objects, `url` is the input with query and fragment removed. Percent-decoding uses `decodeURIComponent` per path segment, and malformed encoding gives `invalid`. A `+` in a path stays `+`.

`resolve.test.ts` must contain a table that covers: every accepted form above (including dotted buckets, nested keys, encoded keys, and each region host form), every `invalid` case, every `unsupported` case (unsigned non-S3 host, `http:` on amazonaws.com, `ftp:`, `file:`, `javascript:`, the lookalike hosts, other AWS services, a bare `Signature` without `Expires`, an endpoint host that is not configured), presign detection on S3 and non-S3 hosts with mixed-case parameter names, userinfo rejection, and `endpointHostOf` for a default port, a custom port, a missing value, and garbage.

### Contract 2: Range parsing, `src/main/stream/range.ts`
```ts
export type RangeSpec =
	| { kind: "bytes"; start: number; end?: number }
	| { kind: "suffix"; length: number };
export function parseRange(header: string | undefined): RangeSpec | null;
export function formatRange(spec: RangeSpec): string;
```
`parseRange` returns `null`, which means the request is served as a plain 200, for: an absent header, a unit other than `bytes` (unit compared case-insensitively), any comma (multi-range), `a > b`, an empty spec (`bytes=`, `bytes=-`), non-digit characters, whitespace inside the spec, a negative number, and any number that is not a safe integer. It returns `{ kind: "bytes", start, end }` for `bytes=a-b` with `a <= b`, `{ kind: "bytes", start }` for `bytes=a-`, and `{ kind: "suffix", length }` for `bytes=-n`, including `bytes=-0`. A zero-length suffix is valid and unsatisfiable, so it is forwarded and the upstream answers 416. `formatRange` returns `bytes=a-b`, `bytes=a-`, or `bytes=-n`. `range.test.ts` covers every case above, the boundaries 0 and `Number.MAX_SAFE_INTEGER`, a value one above it, surrounding whitespace on the whole header, and an uppercase `Bytes=` unit.

### Contract 3: Handles, `src/main/stream/handles.ts`
```ts
export type HandleTarget =
	| { kind: "s3"; connectionId: string; bucket: string; key: string }
	| { kind: "passthrough"; url: string };
export class HandleRegistry {
	create(target: HandleTarget): string;
	get(handle: string): HandleTarget | undefined;
	get size(): number;
	clear(): void;
}
```
`create` returns 32 lowercase hex characters. Creating an identical target again returns the existing handle, so repeated opens do not grow the registry. `get` returns `undefined` for anything that is not 32 lowercase hex characters and for unknown handles. Use `Map`, never a plain object. The registry has no expiry. `handles.test.ts` covers format, 1,000 distinct handles, dedupe, `get` of unknown, malformed, empty, `__proto__`, and uppercase input, and `clear`.

### Contract 4: Proxy, `src/main/stream/proxy.ts`
```ts
export type StreamProxyOptions = {
	registry: HandleRegistry;
	store: Pick<ConnectionStore, "get">;
	clients: Pick<S3ClientFactory, "get">;
	appOrigin: string;
};
export type StreamProxy = {
	start(): Promise<{ origin: string }>;
	stop(): Promise<void>;
	urlFor(handle: string): string;
	describe(handle: string, signal?: AbortSignal): Promise<{ contentType: string; size: number }>;
};
export function createStreamProxy(options: StreamProxyOptions): StreamProxy;
```
- `start` listens on `127.0.0.1` port `0` and resolves `origin` as `http://127.0.0.1:<port>`. A second call returns the same origin. `stop` calls `closeAllConnections()` then closes the server, resolves when closed, and resolves immediately when never started. `urlFor` returns `${origin}/o/${handle}?t=${token}` and throws when not started.
- Routing. Every request that is not `GET` or `HEAD` on `/o/<32 hex>` with query `t` equal to the token and a known handle gets the same 403 response with body `Forbidden`. The response must not reveal which check failed, and it carries the common headers below. This includes `OPTIONS`, so the renderer must keep its requests CORS-simple (a single `Range: bytes=...` header is safelisted).
- Common headers on every response: `Access-Control-Allow-Origin: <appOrigin>`, `Vary: Origin`, `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type`, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`. `appOrigin` is `"null"` when the renderer loads from `file://`, otherwise the dev server origin.
- S3 targets. A missing connection gives 404 `Not found`. `HEAD` sends `HeadObjectCommand` with `abortSignal` and answers 200 with `Content-Type` (default `application/octet-stream`), `Content-Length`, and `Accept-Ranges: bytes`, with no body. `GET` sends `GetObjectCommand` with `{ Bucket, Key }`, plus `Range: formatRange(spec)` when `parseRange` returns a spec, plus `abortSignal`. When a range was sent and the output has `ContentRange`, answer 206 with that `Content-Range`. Otherwise answer 200. Always send `Content-Type`, `Content-Length` from the output, and `Accept-Ranges: bytes`. A `Range` header on `HEAD` is ignored. The `Body` is piped to the response with `pipeline`. A body that is not a `Readable` gives 502.
- S3 errors before headers are sent. Status is `$metadata.httpStatusCode` when it is 403, 404, 416, or 500 to 599. Otherwise it is 403 when `mapS3Error(error, connection).code` is `ACCESS_DENIED` or `SSO_LOGIN_REQUIRED`, 404 when it is `NOT_FOUND`, and 502 for everything else. For 416, send a `HeadObjectCommand` and put `Content-Range: bytes */<size>` on the response when it succeeds, and omit the header when it fails. Bodies are the fixed strings `Forbidden`, `Not found`, `Range not satisfiable`, and `Upstream error`. No upstream message text is ever sent.
- Pass-through targets (presigned URLs and anonymous unsigned URLs). Use `fetch(url, { method: "GET", headers, redirect: "manual", signal })`. `headers` contains only `Range` (the normalized `formatRange` output, only when `parseRange` returns a spec), `If-Range` (the client's value, when present), and `Accept` (the client's value, when present). Never forward `Authorization`, `Cookie`, or any other client header. Follow at most 3 redirects for status 301, 302, 303, 307, and 308 with a `Location` header, resolved with `new URL(location, currentUrl)`. A redirect target whose protocol is not `http:` or `https:`, a fourth redirect, and a redirect without `Location` all give 502. Cancel each discarded body. The method stays GET and the same three headers go to every hop.
- Pass-through responses. Upstream 200 and 206 are relayed with that status, plus `Content-Type` (default `application/octet-stream`), `Content-Length`, and `Content-Range` when upstream sent them, and `Accept-Ranges` only when upstream sent it. Upstream 416 gives 416 with upstream `Content-Range` when present. Upstream 401 and 403 give 403, 404 gives 404, 500 to 599 give the same status, and everything else gives 502, with the same fixed bodies. Never relay `Set-Cookie`, `Location`, `Content-Disposition`, or any header not named here.
- Pass-through HEAD. A presigned URL is valid only for the method it was signed for, so a `HEAD` from the client is served by an upstream `GET` with `Range: bytes=0-0`, whose body is cancelled at once. Answer 200 with no body. `Content-Length` is the total from upstream `Content-Range` (`bytes 0-0/<total>`) on a 206, the upstream `Content-Length` on a 200, and `n` from `bytes */<n>` on a 416. When no total can be found, answer 502.
- Abort. Each request owns an `AbortController` whose signal goes to the SDK or to `fetch`. On `res.on("close")`, when `!res.writableFinished`, abort the controller and destroy the upstream body. An error after headers are sent calls `res.destroy()` and writes nothing.
- `describe(handle, signal)` runs the same upstream HEAD logic as the HEAD route and returns `{ contentType, size }`. It throws a coded error (`Object.assign(new Error(message), { code })`) and never uses upstream text: for S3 targets a missing connection gives `NOT_FOUND` "Connection not found" and SDK errors go through `mapS3Error(error, connection)`; for pass-through targets 401 and 403 give `ACCESS_DENIED` "Access denied", 404 and 410 give `NOT_FOUND` "Not found", and anything else, including a missing size, gives `REQUEST_FAILED` "Request failed". An unknown handle gives `NOT_FOUND` "Not found".

### Contract 5: IPC, `src/shared/channels.ts`, `src/shared/ipc.ts`, `src/main/ipc/stream.ts`, `src/main/ipc/register.ts`
- Channels: `streamOpen: "stream:open"` and `streamOpenUrl: "stream:openUrl"`. Both are request and response channels. `Api` gets a `stream: { open, openUrl }` namespace. This is a Coordinator decision that differs from the plan's flat `api.open` wording, to match the existing namespaces.
- Request `streamOpen`: `{ connectionId, bucket, key }`, strict, constrained like the matching fields of existing schemas.
- Request `streamOpenUrl`: `{ url: string min 1 max 8192, connectionId?: string min 1, anonymous?: boolean }`, strict, and rejected when `connectionId` is set and `anonymous` is `true`.
- Both responses: `{ url: string min 1, contentType: string, size: number int nonnegative }`, strict.
- `streamHandlers(deps)` takes `IpcDeps & { stream?: { registry: HandleRegistry; proxy: Pick<StreamProxy, "urlFor" | "describe"> } }`. A missing `stream` throws a coded `REQUEST_FAILED` "Stream proxy unavailable". `register`'s `deps` type gains the same `stream?` field and passes it through.
- `streamOpen`: `store.get(connectionId)` or a coded `NOT_FOUND` "Connection not found"; create an `s3` handle; `proxy.describe(handle)`; return `{ url: proxy.urlFor(handle), contentType, size }`.
- `streamOpenUrl`: compute `endpointHosts` from `store.list()` with `endpointHostOf`, then `resolveUrl`. A `reason` of `invalid` gives a coded `INVALID_REQUEST` "Invalid URL" and `unsupported` gives "Unsupported URL". Neither message may include any part of the input. A `presigned` result creates a `passthrough` handle and ignores `connectionId` and `anonymous`. An `object` result with `anonymous: true` creates a `passthrough` handle from `value.url`. Otherwise the connection is `connectionId` (a coded `NOT_FOUND` "Connection not found" when missing), or by default the first connection in `store.list()` order whose `pinnedBuckets` or `extraBuckets` contains the bucket; when there is none, a coded `INVALID_REQUEST` "Choose a connection or anonymous access". That creates an `s3` handle. Then `describe` and return as above.
- The unit and integration tests assert `assertNoSecrets` on every response and every error, including the case where the input is a presigned URL containing `X-Amz-Signature` and an access key id, and assert that no part of that input appears in any response or error.

### Contract 6: CSP, `src/main/window.ts`, `src/renderer/index.html`, `test/unit/window.test.ts`
- `CSP` gains the source `http://127.0.0.1:*` in `img-src`, `media-src`, and `connect-src`, and a new `frame-src 'self' http://127.0.0.1:*` placed after `connect-src`. All other directives are unchanged. The meta tag in `index.html` is updated to the same string.
- `buildCsp({ dev, proxyOrigin? })`: when `proxyOrigin` is given, every `http://127.0.0.1:*` is replaced by that exact origin. The dev replacements keep working. With no `proxyOrigin`, `buildCsp({ dev: false })` still equals `CSP`.
- `createWindow(options: { proxyOrigin?: string } = {})` passes `proxyOrigin` to `buildCsp` in the response header hook. Both the static meta policy and the header policy are enforced, so the effective policy is the exact proxy origin.
- `window.test.ts` gains tests for the new sources, for `frame-src`, for the substitution (the header contains the exact origin and no `127.0.0.1:*`), for dev with a proxy origin, and keeps `unsafe-eval` and `unsafe-inline` absent from production.

### Contract 7: Wiring, `src/main/index.ts`, `src/preload/index.ts`
- In `app.whenReady()` create a `HandleRegistry`, then `createStreamProxy({ registry, store, clients, appOrigin })` with `appOrigin` equal to `new URL(process.env.ELECTRON_RENDERER_URL).origin` when that variable is set and `"null"` otherwise. Await `proxy.start()`, call `register(ipcMain, { store, clients, dialog, stream: { registry, proxy } })`, and pass `{ proxyOrigin: origin }` to both `createWindow` calls. Call `proxy.stop()` from `app.on("before-quit")`.
- The preload adds `stream: Api["stream"]` with `open` and `openUrl` using `ipcRenderer.invoke`, and the frozen `api` includes it. Only `import type` from `ipc.ts`.

### Contract 8: Media fixtures, `test/fixtures/make-media.sh`
Executable bash with `set -euo pipefail`. Usage: `test/fixtures/make-media.sh [--large] [outdir]`. The default `outdir` is `test/.tmp/media` under the repository root, which the script derives from its own path. It skips files that already exist and are non-empty. It writes:
- `faststart.mp4`: 10 s, H.264 and AAC, `-movflags +faststart`.
- `tailmoov.mp4`: the same content with the `moov` atom at the end. The script checks both files with a byte scan or `ffprobe -v trace` that `moov` precedes `mdat` in the first and follows it in the second, and fails otherwise.
- `video.webm` (VP9 and Opus), `video.mkv` (H.264 and Opus), `audio.mp3`, and `audio.flac`, each about 10 s from lavfi sources.
- `doc.pdf`: three pages, written by the script itself as a minimal hand-written PDF with a valid xref table computed from real byte offsets, with no extra tool. The script verifies the `%PDF-` header, the `%%EOF` trailer, and that each xref offset points at its `N 0 obj`.
- With `--large`: `large.mp4`, H.264 and AAC, faststart, at least 2,147,483,648 bytes, built from lavfi sources at a constant high bitrate, validated with `ffprobe`, and the script fails when the size is below that.
Keep each small file under 5 MB.

### Contract 9: Tests
Write each failing test first and show a behavioral RED before the implementation, not an import error. Never use a fixed sleep to wait for an asynchronous result: await an event, or poll with a deadline.
- `test/unit/range.test.ts`, `test/unit/resolve.test.ts`, `test/unit/handles.test.ts`: as in contracts 1 to 3.
- `test/unit/proxy.test.ts`: the real server on port 0, a scripted stub S3 client that records commands and the `abortSignal`, and a local `http.createServer` upstream for pass-through. Cover: 403 for a missing token, a wrong token of equal length, a wrong token of a different length, an unknown handle, a malformed handle, a wrong path, and each of `POST`, `PUT`, `DELETE`, `OPTIONS`, with identical bodies and the common headers on each; the 200 full, 206, and HEAD paths with exact headers; the 416 path with and without a successful size lookup; the error status table including an upstream error whose message contains `AKIAFIXTUREFIXTURE00` and a URL, with the response body asserted free of both; abort on a real client destroy (the stub's signal becomes aborted and the stub body is destroyed, polled with a deadline); a mid-stream upstream error destroying the socket; backpressure with a lazily produced 100 MiB stub body, where the client reads 1 MiB and destroys and the bytes pulled from the stub stay under 16 MiB; pass-through header allowlist, asserted on what the local upstream received (`authorization`, `cookie`, and an extra custom header sent by the client never arrive, while `range`, `if-range`, and `accept` do); redirects with 1, 2, and 3 hops succeeding, a fourth hop giving 502, `Location: ftp://x/y` and `Location: file:///etc/passwd` giving 502, and a relative `Location`; pass-through HEAD served by `GET` with `Range: bytes=0-0`, for a 206, a 200, and a `bytes */0` 416; the pass-through status table; `describe` for both target kinds including the coded errors; `urlFor` format `^http://127\.0\.0\.1:\d+/o/[0-9a-f]{32}\?t=[0-9a-f]{64}$`; `start` twice and `stop` twice; and a black-box bind check that connecting to `127.0.0.2:<port>` is refused.
- `test/unit/ipc-stream.test.ts`: through the real `register` and a fake `ipcMain`, with a real registry and a fake `proxy`. Cover each channel's success and its errors (the `NOT_FOUND` cases, `INVALID_REQUEST` "Invalid URL" and "Unsupported URL", the default connection choice by pinned and by extra bucket, the neither-connection-nor-anonymous error, a missing `stream` dep, the strict request schema rejecting extra keys and the `connectionId` plus `anonymous` combination), the registry targets created for presigned, anonymous, and signed requests, and `assertNoSecrets` on every response and error, using a manual connection created with the fake key `AKIAFIXTUREFIXTURE00` through the real store and fixture names free of the forbidden substrings.
- `test/integration/proxy.test.ts`: through a real store, vault, `S3ClientFactory`, and `register`, a real proxy, and RustFS, with one uniquely named bucket for the file, an explicit `beforeAll` hook timeout of at least 180 s, and cleanup in `afterAll`. The `beforeAll` runs `test/fixtures/make-media.sh` through `execFileSync` and fails with a clear message when `ffmpeg` is missing. Cover: `faststart.mp4` and `tailmoov.mp4` uploaded and fetched through the proxy with `bytes=0-1023` (206, bytes equal to the file's first 1024 bytes), `bytes=-1024` (206, the last 1024 bytes, `Content-Range` total equal to the file size), an open-ended range, and a full GET whose SHA-256 equals the file's; HEAD; 416 for `bytes=<size>-` with `Content-Range: bytes */<size>`; 403 for a missing token, a wrong token, an unknown handle, and `POST` against the real server; a 200 MiB random object where a client requests `Range: bytes=100000000-`, reads 4 MiB, and destroys, asserting that the bytes pulled from upstream are under 15 MiB through a counting wrapper passed as the `clients` override and that its `abortSignal` becomes aborted; presigned pass-through built with `getSignedUrl` from `@aws-sdk/s3-request-presigner`, opened through `api.stream.openUrl`, then fetched with a `Range` header, expecting 206 and the right bytes, with a HEAD through the proxy returning the object size; `openUrl` with the RustFS path-style URL and the connection id (works), the same URL with `anonymous: true` (the private bucket gives `ACCESS_DENIED`), and the same URL with no connection and no anonymous flag when the bucket is pinned on the connection (works); and `assertNoSecrets` on every IPC response.

### Contract 10: Seek check, `scripts/seek-2gb.ts`, `package.json`, `tsconfig.node.json`, `pnpm-lock.yaml`
- `package.json` gains the script `"seek:2gb": "jiti scripts/seek-2gb.ts"` and the exact-pinned devDependency `"jiti": "2.7.0"`. Update `pnpm-lock.yaml` with `pnpm add -D -E jiti@2.7.0 --offline` or the nearest offline equivalent, and record the command. If an offline install cannot satisfy it, return `NEXT: BLOCKED` with the output. `tsconfig.node.json` `include` gains `"scripts/**/*.ts"` so the script is type-checked.
- The script runs under `jiti` with plain Node and imports `src/main/stream/**` without electron. It: creates `test/.tmp/media/large.mp4` through `make-media.sh --large` when missing; checks for RustFS with a `ListBucketsCommand` and, when it does not answer, starts it with `docker compose -f test/rustfs/compose.yaml up -d`, waits up to 60 s, and stops it with `down -v` on exit only when it started it; creates a uniquely named bucket and uploads the file with `lib-storage`; builds a `HandleRegistry` and a proxy whose `store` stub returns a manual `ConnectionView` and whose `clients` stub returns the raw RustFS `S3Client` wrapped with a counting tap on the `GetObject` body and the `abortSignal`; requests `Range: bytes=<floor(size/2)>-` with `node:http`; measures time to the first body byte; reads 4 MiB; destroys the request; waits, with a deadline, for the upstream abort; prints `ttfbMs`, `clientBytes`, `upstreamBytes`, `fileBytes`, and `offset`; and exits non-zero when `ttfbMs` is above 2000, `upstreamBytes` is above 15 MiB (15,728,640), or the upstream was not aborted. In this contract "15 MB" means 15 MiB. It always cleans up the object, the bucket, the proxy, the S3 client, and RustFS when it started it, including on failure.

## Files
Allowed paths. A "Plan deviation" is a path the plan did not list; each is logged.
- Create: `src/main/url/resolve.ts`, `src/main/stream/range.ts`, `src/main/stream/handles.ts`, `src/main/stream/proxy.ts`, `src/main/ipc/stream.ts`, `scripts/seek-2gb.ts`, `test/fixtures/make-media.sh`
- Create tests: `test/unit/range.test.ts`, `test/unit/resolve.test.ts`, `test/unit/handles.test.ts` (Plan deviation), `test/unit/proxy.test.ts` (Plan deviation), `test/unit/ipc-stream.test.ts` (Plan deviation), `test/integration/proxy.test.ts`
- Modify: `src/shared/channels.ts` (Plan deviation), `src/shared/ipc.ts`, `src/main/ipc/register.ts`, `src/main/index.ts`, `src/main/window.ts`, `src/renderer/index.html` (Plan deviation), `src/preload/index.ts`, `test/unit/window.test.ts`, `package.json`, `pnpm-lock.yaml` (Plan deviation), `tsconfig.node.json` (Plan deviation)

Worker-owned phase records:
- `docs/plans/s3-media-explorer/phase-05/notes.md` (append `## Task <M>` blocks and `## Batch <N>` sections)
- `docs/plans/s3-media-explorer/phase-05/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only and forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or any path in Invariants & Boundaries. Do not run `git commit`, `git reset`, `git stash`, branch changes, or ref writes. Do not leave `*.tsbuildinfo`, `out/`, `test/.tmp/`, or stray temp files in the Git status. `test/.tmp/` is ignored by git.

## Tasks and Scopes
The Coordinator dispatches this phase as scoped jobs in one session, because earlier phases stopped early when given everything at once. When a job names a scope, do only that scope, then stop. Do not trust earlier notes; check files on disk with `wc -l` and by reading them.
- Scope A, pure modules: contracts 1 to 3 and their three unit tests.
- Scope B, proxy: contract 4 and `proxy.test.ts`.
- Scope C, IPC and app wiring: contracts 5, 6, and 7, `ipc-stream.test.ts`, and the `window.test.ts` changes.
- Scope D, fixtures and integration: contract 8 and the integration half of contract 9.
- Scope E, seek check and closeout: contract 10, then every Verification Check, the preload `require` check, and the headless launch.
Each scope ends with `pnpm typecheck` and `pnpm test` exiting 0, with exact counts in `notes.md`.

## Done When
- Every Verification Check below exits 0 from `/home/ngosi/projects/s3-explorer`.
- The unit tests cover every URL form in DESIGN.md flow 5, including rejection of unsigned non-S3 hosts and lookalike hosts.
- The integration tests prove 200, 206, 416, token and method 403s, upstream abort on client destroy, a mid-file seek on a 200 MiB object under 15 MiB, and presigned pass-through.
- `pnpm seek:2gb` prints its measurements and exits 0.
- `api.stream.open` and `api.stream.openUrl` responses and errors pass the secret scan, and the proxy URL contains only the local token.
- No new production code uses `any`. The protected paths are unchanged. The built preload requires nothing except `electron`.
- Run from `/home/ngosi/projects/s3-explorer` (Baseline at the base: the first four exit 0 with 133 unit and 21 integration tests):
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm build`
  - `pnpm seek:2gb`
- After `pnpm build`, confirm every `require` specifier in `out/preload/index.cjs` is `electron`, and confirm that `timeout 10 xvfb-run -a pnpm exec electron .` runs without new error output beyond the unrelated Wayland and Vulkan ozone message. Record the commands and results in `notes.md`.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable. Match the surrounding code style: tabs, one statement per line, braces on control flow, lines wrapped near 80 columns.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/s3-media-explorer/phase-05/journal.md`, then return that block and the matching status line from `erp.md`. For a scope that is not the last, write `NEXT: CONTINUE_CONTEXT` and `Meets Spec? NO` and say in SUMMARY which scope is complete.
