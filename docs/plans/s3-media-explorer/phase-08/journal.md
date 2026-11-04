# Phase 8 — Journal

## Route
- Sequence: implement (scope A, B, C) -> spec review -> quality review
- Implement Profile: implement
- Review Profile: review
- Reason: non-UI work (main, tests, packaging, docs); reviewer independent of implementer.
- Done When: PLAN.md Phase 8 Verification Checks all exit 0; D1 to D7 done with tests.

## Coordinator Decisions
- The phase includes the debt sweep owed by phases 2 to 7 (D1 to D7). Accepted debt stays: handle registry without expiry, preload `file as File` cast, browse.ts concurrency notes, `any` in tests, MKV audio probe.
- `--smoke` exits on the first window's did-finish-load, decided in main only, with no renderer path, so the renderer cannot trigger it.
- E2E stubs the native open dialog through `electronApp.evaluate` on the Electron dialog module, because handlers read `deps.dialog` at call time.
- D1 adds `Content-Security-Policy: sandbox` to non-PDF proxy responses, which completes the phase 5 content-safety carry-forward together with the window.ts subframe sandbox.

## Review Result
- Spec Status: PASS. Coordinator ran every scope check fresh: typecheck, 563 unit, 25 integration, build, xvfb-run -a pnpm e2e twice, isolated --smoke, pnpm dist, scripts/smoke-appimage.sh, dpkg-deb -I (Package s3-media-explorer, Depends libsecret-1-0), exactly one AppImage and one deb.
- Quality review 63ed8457: PASS_WITH_DEBT with 7 findings. Coordinator verified finding 1 (before-quit did not await async temp cleanup) and treated it as blocking against D7. FIX 1 (job fa5b9b02) fixed F1 to F7; 565 unit tests; mutation turning rmSync into an unawaited rm failed the new test, restored. Checkpoint ca4acea.
- Fix-delta re-review 530a12d9: PASS_WITH_DEBT, F1 to F7 fixed. Debt, accepted with no owner (test-only, low): a separate-destination download test duplicates coverage; the new sync-throw test overlaps an existing one; empty catch in cleanupOpenExternal at quit.
- Next: done. Phase 8 closed.

