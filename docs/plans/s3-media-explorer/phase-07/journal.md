# Phase 7 — Journal

## Route
- Sequence: implement (scope A, scope B) -> spec review -> manual dev run -> quality review
- Implement Profile: google
- Review Profile: review
- Reason: UI and IPC work across renderer, preload, shared, and main; reviewer stays independent of the implementer.
- Done When: pnpm typecheck, pnpm test, pnpm build exit 0; manual dev run against RustFS with Phase 5 fixtures shows every fixture format plays or previews, seeking works on both MP4 variants, and an unsupported file offers Open with system app.

## Coordinator Decisions
- Open with system app takes the proxy URL plus a file name. Main checks the origin against the running proxy, streams to a mkdtemp directory under the OS temp path, and calls shell.openPath. One path serves bucket objects and Open URL playback, and no S3 URL reaches the renderer.
- Proxy content safety carry-forward: iframe only for an exact application/pdf content type; SVG only through img; HTML and other text as escaped text.
- Allowed extra files beyond PLAN.md: src/shared/channels.ts, src/main/ipc/stream.ts, src/renderer/src/api.ts, src/renderer/src/components/ObjectTable.tsx (selection and refresh hooks), test/unit/openExternal.test.ts, renderer helper tests, and existing tests that enumerate channels.

## Coordinator Verification
- Scope A (job 22845f1b, commit efe9c6e) and scope B (job c9d43a1b, commit c781001) verified on disk: only allowed files changed; typecheck, test (467), and build exit 0; the only iframe is in PdfView behind isPdfContentType; no dangerouslySetInnerHTML.
- Deviation accepted: a single click on a folder row now selects it (needed for folder rename and delete); a double-click, Enter, or a second click opens it.
- Manual dev run 1 (RustFS 1.0.4, probe /tmp/p7/probe.mjs outside the repo, fixtures from test/fixtures/make-media.sh plus png, jpg, webp, svg-with-script, md, json, ts, html-with-script, random .xyz):
  - PASS: mp3 and flac play; faststart.mp4 and tailmoov.mp4 seek to 5.0 s of 10 s and play; webm and mkv play (mkv has audio); png, jpg, webp, svg load through img; code.ts, data.json, readme.md, page.html show as escaped text with no injected elements and the page title unchanged; blob.xyz shows the unsupported card with Open with system app; Open URL with s3://p7check/media/img.png preselected the RustFS connection and showed the image. Every media src is a 127.0.0.1 proxy URL.
  - FAIL: doc.pdf iframe stays blank. Root cause: window.ts onHeadersReceived injects the app CSP (frame-ancestors 'none', object-src 'none') into the proxy subframe response, and will-frame-navigate cancels every subframe navigation. Relaxing will-frame-navigate alone in a temporary patch of out/main gave chrome-error://chromewebdata/, which confirms the header cause. out/ was restored.
- Scope expansion approved: FIX-PDF on profile implement may edit src/main/window.ts and test/unit/window.test.ts.
- FIX-PDF 1 (job d98ba7cb, profile implement, commit a03410f): adds allowFrameNavigation and responseCspFor; proxy subframe allowed; proxy PDF passes through without app CSP; other proxied subframes get "sandbox; default-src 'none'". The Coordinator verified it: typecheck, test (485) and build exit 0. The worker reformatted all of test/unit/window.test.ts, which is noise but no tests were lost. PDF still blank.
- Further root cause, from navigation and header logging in temporary out/ patches (restored): Chromium's built-in PDF viewer extension chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/ (index.html subFrame, scripts, css) receives the session-wide app CSP, whose frame-ancestors 'none' blocks it, and its internal subframe navigation to chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/<uuid> is denied by allowFrameNavigation. With both exempted for that exact extension origin only, doc.pdf renders 3 pages with the viewer toolbar (screenshot /tmp/p7/pdf3.png).

## FIX-PDF 2 (job 66da3c9b)
Exempted chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai from app CSP and subframe nav denial. Node URL origin is "null" for chrome-extension, so protocol+host fallback used. Coordinator verified: typecheck 0, 494 tests, build 0, pdf3 probe renders 3 pages.

## Close
Quality review 10b6bded FAIL, FIX 1 6db2a2a1, re-review 60482d17 FAIL, FIX 2 ccf73812, final test fix 519d7221. All verified by the Coordinator. Checkpoint 817b525. Phase CLOSED.
