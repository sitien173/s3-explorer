# S3 Media Explorer Design

**Status:** Confirmed 2026-11-03
**Consultation:** Gate 1 consult job `aeb89c35-8511-4cae-91cd-56eb325f79f9` recommended Electron with a main-process loopback signing proxy; adopted. Unverified claims are listed under Risks.

## Purpose

A Linux desktop app that browses, searches, manages, and streams objects in Amazon S3 and S3-compatible storage. It plays video, audio, images, and documents in place with seeking, without downloading whole files.

## Users and Success Criteria

Users: individuals and teams with AWS profiles, including SSO, or with manual access keys for AWS or S3-compatible endpoints.

Success criteria:

1. Seeking within a 2 GB MP4 starts playback within 2 s on a normal connection. Only the requested byte ranges are fetched.
2. A prefix with 10,000 objects stays responsive through paginated loading and a virtualized list.
3. Secrets are never written to disk in plaintext and never reach the renderer.
4. `s3://` URIs, S3 HTTPS URLs, and presigned links play.
5. The app builds as both AppImage and .deb.

## Constraints, Invariants, and Non-Goals

Constraints:

- The UI is web-based and follows the Trulioo Design System: light theme only, semantic tokens, and `tds-*` classes. Inter is bundled locally. Tobias is not bundled, so headings use the token fallback.
- Credentials come from `~/.aws` profiles through the SDK chain, including `sso-session` profiles and profile-level `endpoint_url`, and from manual keys stored with Electron `safeStorage`.
- Each connection can set a custom endpoint and a path-style toggle for MinIO, R2, or Wasabi.
- Formats are limited to what the webview plays natively:
  - Video: MP4/H.264, WebM, and MKV where supported.
  - Audio: MP3, AAC, FLAC, Ogg, Opus, WAV.
  - Images: JPEG, PNG, GIF, WebP, AVIF, SVG.
  - Documents: PDF, text, Markdown, JSON, code.
  - Anything else opens with the system app.
- Packaging: AppImage and .deb through electron-builder.

Invariants:

1. App-held AWS secrets, session tokens, and app-generated signed URLs never cross IPC to the renderer.
2. The stream proxy binds only to `127.0.0.1` and returns 403 for any request with a missing token, an unknown handle, or a method other than GET or HEAD.
3. A source object is never deleted before its copy is confirmed.
4. No secret is persisted unless `safeStorage` reports a real backend. A `basic_text` backend or unavailable encryption means session-only.
5. Renderer settings are fixed: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP. Navigation and `window.open` are blocked except through the system browser.

Non-goals for v1:

- Sync or offline mirroring.
- Bucket create or delete.
- Bucket policy, ACL, and lifecycle editing.
- Versioning UI.
- Transcoding.
- Office document preview.
- Unsigned non-S3 URLs.
- A dark theme.
- Multipart upload resume across restarts.
- In-app SSO device flow.
- Renaming objects larger than 5 GB.
- Rollback of a partial folder rename.

## Chosen Approach

Electron with the AWS SDK for JavaScript v3 in the main process, a sandboxed React and Vite renderer, and a main-process `127.0.0.1` HTTP signing proxy that serves all object bytes.

Rejected alternatives:

- Electron with presigned URLs in the renderer. This puts bearer URLs in the renderer, breaks when SSO or STS credentials expire mid-playback, and requires CORS on every bucket.
- Tauri 2 with a Rust proxy. WebKitGTK media depends on system GStreamer, which is absent on the target host and brittle to bundle into an AppImage.
- Native GTK4 with GStreamer. This conflicts with the web design system mandate.

## Architecture and Data Flow

### Processes and modules

Main process, Node and TypeScript:

- `connections`: non-secret config is stored as JSON under `app.getPath('userData')`. Manual secrets are stored through `safeStorage`.
- `credentials`: profile connections use `fromIni({ profile })`, which covers SSO. Manual connections use static keys decrypted at use time.
- `s3`: an `S3Client` cache keyed by connection and region. It applies the endpoint and `forcePathStyle` and uses SDK region redirect handling.
- `stream-proxy`: an `http.Server` on `127.0.0.1:0` with a 256-bit token generated per launch. The route is `GET|HEAD /o/<handle>?t=<token>`. A handle maps either to `{ connectionId, bucket, key }` or to a validated presigned URL. The proxy forwards `Range` to `GetObject`, or to `fetch` for presigned URLs. It returns 200 or 206 with `Content-Range`, `Accept-Ranges`, and CORS headers, and aborts the upstream request through an `AbortController` when the client socket closes.
- `transfers`: uploads use `@aws-sdk/lib-storage` multipart. Downloads stream to a temporary file that is renamed on completion. A queue reports progress and supports cancel.
- `url-resolver`: parses `s3://` URIs, virtual-hosted URLs, path-style URLs, and presigned URLs into a handle.
- `ipc`: typed handlers validated with zod.

Preload: `contextBridge` exposes a narrow typed `api`.

Renderer:

- React, TypeScript, and Vite.
- CSP `media-src`, `connect-src`, and `frame-src` are limited to the proxy origin and the app origin.
- `@tanstack/react-virtual` renders long listings.
- Layout:
  - Sidebar: connections, pinned buckets, Open URL.
  - Main pane: breadcrumb, filter, search, object table, and a toolbar with upload, new folder, download, rename, and delete.
  - Viewer panel for media and documents.
  - Transfers drawer.

Tooling: pnpm, electron-vite, electron-builder, Vitest, Playwright `_electron`, and RustFS in Docker. Exact versions are pinned against current docs during planning.

### Flows

1. **Connection setup.** The user chooses one of two kinds:
   - A profile. Profiles are discovered by parsing `~/.aws/config` and `~/.aws/credentials`. Profile `region` and `endpoint_url` are used unless overridden.
   - Manual keys, with region, an optional endpoint, and a path-style toggle. The secret goes `safeStorage.encryptString` → `connections.json`. If the backend is unavailable or `basic_text`, the keys are session-only and a warning is shown.
2. **SSO.** An SSO token error returns `{ code: 'SSO_LOGIN_REQUIRED', profile }`. Sign in spawns `aws sso login --profile <p>`. If the CLI is missing, the app shows the command to run.
3. **Browse.** `api.list({ conn, bucket, prefix, token })` calls `ListObjectsV2` with delimiter `/` and 1,000 keys per page. It returns folders, objects, and the next token. The renderer appends pages on scroll. Buckets come from `ListBuckets` plus pinned and manually added names.
4. **Stream or preview.** `api.open({ conn, bucket, key })` returns `{ url, contentType, size }`, where `url` is a proxy URL. The renderer uses:
   - `<video>`, `<audio>`, or `<img>` for media.
   - An `<iframe>` with Chromium's PDF viewer for PDF.
   - `fetch` of the first 2 MB for text.
5. **URL playback.** The Open URL dialog sends the URL to `url-resolver`:
   - `s3://`, virtual-hosted, and path-style URLs become `{ bucket, key, region }`. The user picks the signing connection. The default is the connection that lists or pins the bucket. "Anonymous" is also offered.
   - Unsigned HTTPS hosts must be `*.amazonaws.com` or a configured connection endpoint.
   - Presigned URLs, identified by `X-Amz-Signature` or by `Signature` with `Expires`, pass through for any http or https host. The proxy adds no credentials.
6. **Search.** `api.search({ conn, bucket, prefix, query })` returns a job ID. Main pages `ListObjectsV2` with no delimiter, matches key substrings case-insensitively, and emits batches and progress over IPC. Search can be cancelled. Display caps at 10,000 matches.
7. **Transfers and file operations.**
   - Upload: file picker or drag and drop, then `lib-storage` `Upload` with progress and abort.
   - Download: save dialog, then a `GetObject` stream to a temporary file that is renamed on completion.
   - Delete: `DeleteObjects` in batches of 1,000. Folder delete lists the prefix first and shows the count in a confirmation.
   - New folder: put a zero-byte `<prefix>/` object.
   - Rename or move: `CopyObject`, then `DeleteObject`, per key. A folder rename iterates every key under the prefix with progress and stops on the first failure. Objects larger than 5 GB are rejected with "too large to rename".

## Errors and Edge Cases

| Condition | Behaviour |
|---|---|
| Expired SSO token | A banner on the affected connection offers Sign in. Other connections keep working. |
| `AccessDenied` on `ListBuckets` | Offer "Add bucket by name". |
| `AccessDenied` on a prefix or object | Show an inline error. The rest of the listing still renders. |
| Proxy upstream error before headers are sent | Map S3 status codes 403, 404, 416, and 5xx to the same HTTP status. |
| Proxy upstream error mid-stream | Destroy the socket. The viewer shows "Playback interrupted" with Retry, which resumes at `currentTime`. |
| `MediaError` code 4 or unsupported type | Show "Format not supported" with Open with system app, which downloads to a temp file and calls `shell.openPath`. |
| MKV that plays video with no audio track | Show a non-blocking notice that offers Open with system app. |
| Folder rename or delete partial failure | Stop and report completed and remaining keys. No rollback. |
| Upload cancelled or failed | Abort the multipart upload. |
| Download cancelled or failed | Remove the temp file. |
| Network loss during listing | The SDK retries first. After that, show a Retry button. |
| `safeStorage` unavailable | Manual keys are session-only, with a warning. |
| `[default]` profile with `endpoint_url` | The endpoint applies to that profile's S3 client only. It never reaches clients used by credential providers. |
| Invalid or unsupported URL | Show an inline error in the Open URL dialog. |

## Migration

n/a. This is a greenfield repository.

## Testing

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | URL resolver: all forms, presign detection, rejections. Range parsing. Profile and config parsing fixtures, including `[default]` with `endpoint_url` beside `sso-session` profiles. IPC schemas. Search matcher. |
| Integration | Vitest + RustFS in Docker | Proxy: 200, 206, 416, token rejection, upstream abort on client close, bytes fetched for a mid-file seek below 15 MB. Listing pagination. Search cancel. Upload, download, delete, and rename for objects and folders, including stop on partial failure. Presigned pass-through. |
| Media fixtures | ffmpeg | Faststart and tail-`moov` MP4, WebM, MKV with Opus, MP3, FLAC, a multi-page PDF. The 2 GB seek check is an opt-in script and is not part of default CI. |
| Security | Vitest | Scan IPC responses for secret-shaped strings. Assert `webPreferences`. Assert the CSP is present. |
| End-to-end | Playwright `_electron` + RustFS | Add connection, browse, play and seek, open a URL, upload, rename, delete. |
| Packaging | electron-builder | Build AppImage and .deb. Launch smoke test of the AppImage. |

Manual checklist: real AWS SSO sign-in and real AWS region redirects.

Amendment 2026-11-03: integration tests use RustFS `rustfs/rustfs:1.0.4` instead of MinIO, because MinIO stopped publishing Docker images and `minio/minio:latest` no longer resolves. MinIO remains a supported user endpoint.

## Risks and Open Questions

Risks:

1. MP4 files with `moov` at the end need a prompt upstream abort when Chromium jumps to the tail. Without it, seeking stalls. Mitigation: abort wiring plus the tail-`moov` fixture test.
2. MKV files with AC3, EAC3, or DTS audio play silently in Chromium. Mitigation: the no-audio notice and Open with system app.
3. `safeStorage` falls back to `basic_text` on desktops without a secret service. Mitigation: invariant 4.
4. Unbounded bucket-wide search on very large buckets costs time and requests. Mitigation: progress, cancel, and the display cap.
5. H.264 and AAC decoders shipped in Electron carry patent-licensing obligations for commercial distribution. The target is personal or team use; confirm this before any public distribution.

Unverified consultation claims, to be checked during planning:

- That AWS SDK JS v3 honors profile-level `endpoint_url` from `3.395.0`.
- That Electron issue `#38749` describes seeking problems with `protocol.handle`. This does not affect the chosen design.
- That `[default]` `endpoint_url` can redirect SSO calls. In the user's config the SSO profiles set no `endpoint_url`, so this is covered by test only.

Open questions: none.
