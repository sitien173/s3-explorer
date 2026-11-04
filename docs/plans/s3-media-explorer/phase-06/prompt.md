# Phase 6: Renderer shell, connections, and browsing UI

## Goal & Outcome
- Plan Goal: Build a Linux Electron desktop app that browses, searches, manages, and streams S3 and S3-compatible objects through a `127.0.0.1` signing proxy, with a sandboxed React renderer styled with the Trulioo Design System (TDS). Full spec: `/home/ngosi/projects/s3-explorer/docs/plans/s3-media-explorer/PLAN.md` (Phase 6) and `DESIGN.md`.
- Phase Outcome: Through `window.api` alone, a user can add, edit, and delete a connection, see the session-only warning, sign in to an expired SSO profile, see and pin buckets, add a bucket by name when listing is denied, navigate prefixes with a breadcrumb, filter the loaded folder, run a cancellable bucket-wide search with progress, and scroll a 10,000-object folder smoothly in a virtualized table. Every style comes from TDS semantic tokens and TDS component CSS in a light theme.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/s3-media-explorer/phase-06/base`
- Prior State: Phases 1 to 5 are complete. At the base commit `pnpm typecheck`, `pnpm test` (329 unit tests), `pnpm test:integration` (25), and `pnpm build` exit 0. Every package you need is already in `package.json`: `react` 19.3.1, `react-dom` 19.3.1, `@tanstack/react-virtual` 3.14.25. Do not add or change dependencies.
- Code Context:
  - `src/renderer/src/App.tsx` is a placeholder and `src/renderer/src/main.tsx` mounts it in `React.StrictMode`. Existing renderer style is two-space and single quotes; new renderer files use the repository's main style instead: tabs, double quotes, one statement per line, braces on control flow, lines near 80 columns.
  - `src/shared/ipc.ts` exports the `Api` type (namespaces `connections`, `buckets`, `objects`, `search`, `ops`, `stream`, `transfers`), every request and response type, `Result<T> = { ok: true; data: T } | { ok: false; error: IpcError }`, and the error code enum (includes `SSO_LOGIN_REQUIRED`, `SSO_LOGIN_FAILED`, `ACCESS_DENIED`). Read it for the exact shapes: connection views carry `pinnedBuckets`, `extraBuckets`, `sessionOnly`, `hasSecret`; bucket list responses carry `listDenied`; object list responses carry `objects`, folders, and `nextToken`; search events are `onBatch`, `onProgress`, `onDone` with `truncated`. Renderer code may use `import type` from `src/shared/ipc.ts` only; it must not import runtime values from `src/shared` or anything from `src/main` or `src/preload`.
  - `src/preload/index.ts` exposes the frozen `window.api`. Do not edit preload, main, or shared code in this phase.
  - `tsconfig.web.json` includes `src/renderer/**/*.ts(x)`. Unit tests in `test/unit/**/*.test.ts` run in Node (no DOM environment).
- Environment facts established by the Coordinator:
  - The `tds` CLI is installed. `tds rules` prints the mandatory rules and the semantic token block. `tds search <term>` and `tds component <id>` work. Relevant component ids: `button`, `icon-button`, `text-input`, `textarea`, `select`, `checkbox`, `field-label`, `field-caption`, `field-validation`, `dialog`, `data-table`, `breadcrumb`, `announcement` (banner), `side-nav`, `nav-list`, `nav-item`, `spinner`, `progress-indicator`, `tag`, `counter-label`, `tooltip`, `section-header`. There is no TDS search-field or toast component: build the search field from `text-input` and `button`.
  - The official Inter 4.1 release is already downloaded and unpacked: copy `/tmp/inter-dl/x/web/InterVariable.woff2` (352,240 bytes) to `src/renderer/src/assets/fonts/InterVariable.woff2` and `/tmp/inter-dl/x/LICENSE.txt` (SIL OFL 1.1) to `src/renderer/src/assets/fonts/OFL.txt`. Do not fetch anything from the network.
  - The CSP is `style-src 'self'` and `script-src 'self'`. Stylesheets imported from TS through Vite are fine. React `style={{ ... }}` props are applied through the CSSOM and are allowed, so the virtualizer's sizing and transform styles work. Never inject `<style>` elements or set a `style` attribute string.
  - The `<meta http-equiv="Content-Security-Policy">` in `src/renderer/index.html` must stay byte-identical to the `CSP` constant in `src/main/window.ts`; `test/unit/window.test.ts` enforces this. Edit `index.html` only if needed and never that tag. `font-src` is not set, so `default-src 'self'` covers a bundled font.

## Invariants & Boundaries
- Preserve DESIGN invariants 1 and 5: the renderer never sees secrets or signed URLs, and the window stays sandboxed with the strict CSP. The renderer talks only to `window.api`.
- TDS rules from `tds rules` are binding: light theme only, semantic tokens only (no hex colors, no `--color-*`, no `--spacing-<n>`, no `--radius-xs|sm|md|lg` outside `tokens.css`), official `tds-*` classes only for components. App layout classes use the `app-` prefix. Do not invent component styles: component CSS in `components.css` is copied from `tds component <id>` output.
- Tobias is not bundled. Headings use the `--font-family-display` token with its fallback.
- No `dangerouslySetInnerHTML`. No viewer, preview, Open URL, toolbar, or file-operation UI (Phase 7). A click on an object row does nothing beyond selection in this phase.
- Out of scope: everything under `src/main`, `src/preload`, `src/shared`, `test/integration`, `package.json`, `pnpm-lock.yaml`, configs. Secret-bearing paths: do not read, print, or copy `~/.aws/credentials`, `~/.aws/sso/cache/**`, or any real key.

## Contracts

### Contract 1: TDS foundation
- `src/renderer/src/styles/tokens.css`: the full semantic token block printed by `tds rules`, plus the core tokens those semantic tokens reference, plus the typography, spacing, radius, and elevation tokens from `tds tokens all` that the app uses, plus `@font-face` for `Inter` from `../assets/fonts/InterVariable.woff2` with `font-display: swap`. This is the only file allowed to contain hex colors and core tokens.
- `src/renderer/src/styles/components.css`: CSS copied verbatim from `tds component <id>` for each component the app uses, one commented section per id (`/* tds component: <id> */`). Nothing else.
- `src/renderer/src/styles/app.css`: layout only (`app-` classes: shell grid, sidebar column, main pane, table viewport), using semantic tokens only. Body uses `--surface-neutral-02`, cards and panes `--surface-neutral-01`, text `--text-default`.
- Focus is visible on every interactive element using `--border-focus`.
- `test/unit/renderer-tokens.test.ts` scans `src/renderer/src/**/*.{css,tsx}` and fails on: a hex color outside `tokens.css`; `--color-*` or `--spacing-*` use outside `tokens.css`; a `className` value (string literal or template literal text) containing a class that starts with neither `tds-` nor `app-`; a CSS class selector in `app.css` that is not `app-`; any `dangerouslySetInnerHTML`. It must also fail when pointed at a small inline fixture that breaks each rule, so the scanner itself is tested.

### Contract 2: `src/renderer/src/api.ts`
- Declares `window.api: Api` with `import type { Api } from "../../shared/ipc"` and exports `const api = window.api`.
- Exports a small `unwrap<T>(result: Result<T>): T` that throws an `Error` carrying `code` and `profile` for `ok: false`, so components can branch on `SSO_LOGIN_REQUIRED` and `ACCESS_DENIED`. Error messages shown to the user are the IPC `message` only.

### Contract 3: Sidebar, connection dialog, SSO banner
- `Sidebar.tsx`: lists connections from `api.connections.list`; selecting one loads its buckets with `api.buckets.list`. Pinned buckets appear first under the connection, then the remaining buckets. Pin and unpin call `api.buckets.pin` and `api.buckets.unpin` and refresh. Add, edit, and delete connection actions; delete asks for confirmation in a TDS `dialog`.
- `ConnectionDialog.tsx`: TDS `dialog` with TDS form-field structure (`field-label`, `text-input` or `select`, `field-caption`, `field-validation`). Two kinds: profile (pick from `api.connections.listProfiles`, optional region and endpoint overrides) and manual (access key id, secret, optional session token, region, optional endpoint, path-style checkbox). Secret fields use `type="password"` and are never prefilled on edit; an empty secret on edit means unchanged. A "Test connection" button calls `api.connections.testConnection`. After save, if the returned view has `sessionOnly: true`, show an `announcement` warning that keys are kept for this session only because secure storage is unavailable. Field names and required fields follow the request schemas in `ipc.ts`.
- `SsoBanner.tsx`: when a call for a connection fails with `SSO_LOGIN_REQUIRED`, an `announcement` on that connection names the profile and offers "Sign in", which calls `api.connections.ssoLogin({ profile })`. On `SSO_LOGIN_FAILED` or a missing CLI it shows the command `aws sso login --profile <profile>` as text. Other connections keep working.
- Dialogs trap focus, restore focus to the opener on close, and close on Escape.

### Contract 4: Browsing pane
- `Breadcrumb.tsx`: TDS `breadcrumb` for `bucket / prefix segments`; each segment navigates to that prefix.
- Folder filter: a `text-input` that filters the loaded rows of the current folder by case-insensitive substring of the name, client-side only.
- `ObjectTable.tsx`: TDS `data-table` styling with `@tanstack/react-virtual` (`useVirtualizer`, fixed row height, overscan at most 10). Columns: name, size (human-readable), last modified. Folders first, then objects, in listing order. Clicking a folder navigates into it. The first page loads on navigation via `api.objects.list`; when the user scrolls within a few rows of the end and `nextToken` is set, the next page is requested once (no duplicate in-flight requests) and appended. A navigation discards stale responses from the previous prefix. The rendered DOM row count stays under 200 for any folder size.
- `SearchBar.tsx`: a search field and button that call `api.search.start({ ... })` for the current bucket and prefix; subscribes to `onBatch`, `onProgress`, `onDone` filtered by its job id; shows scanned and matched counts with a `spinner` or `progress-indicator` while running, and a Cancel button that calls `api.search.cancel`. Results replace the table rows while a search is active, with a clear action back to the folder listing. Shows a note when `truncated` is true. Unsubscribes all listeners on unmount and on a new search.
- `AddBucketDialog.tsx`: when `buckets.list` returns `listDenied: true`, the sidebar shows an "Add bucket by name" action that opens a TDS `dialog` calling `api.buckets.add`.
- Errors from any call show as an inline `announcement` with the IPC message; `ACCESS_DENIED` on a bucket shows a plain "Access denied" state in the pane.

## Files
Allowed production and test paths:
- `src/renderer/src/styles/tokens.css` (create)
- `src/renderer/src/styles/components.css` (create)
- `src/renderer/src/styles/app.css` (create)
- `src/renderer/src/assets/fonts/InterVariable.woff2` (create, copied)
- `src/renderer/src/assets/fonts/OFL.txt` (create, copied)
- `src/renderer/src/api.ts` (create)
- `src/renderer/src/components/Sidebar.tsx`, `ConnectionDialog.tsx`, `SsoBanner.tsx`, `AddBucketDialog.tsx`, `Breadcrumb.tsx`, `ObjectTable.tsx`, `SearchBar.tsx` (create)
- `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx` (modify)
- `src/renderer/index.html` (modify only if needed; never the CSP meta tag)
- `test/unit/renderer-tokens.test.ts` (create)
- A pure helper module `src/renderer/src/format.ts` (create, optional) with a unit test `test/unit/renderer-format.test.ts` for size formatting and filtering.

Worker-owned phase records:
- `docs/plans/s3-media-explorer/phase-06/notes.md` (append one `## Batch <N>: Scope <X>` block per scope)
- `docs/plans/s3-media-explorer/phase-06/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, this `prompt.md`, other phases, dependencies, configs, or anything outside the list above.

## Tasks and Scopes
The phase is dispatched as three scoped jobs in one session. Do only the scope you are told to do.
- Scope A (Contracts 1 and 2): run `tds rules`, the searches, `tds component` for each id you use, and `tds tokens all`, and record in notes the exact commands and which ids were copied. Write `renderer-tokens.test.ts` first and record its RED against a fixture. Create the styles, fonts, `api.ts`, and an `App.tsx` shell with the sidebar column and main pane (empty states only). `main.tsx` imports the three stylesheets.
- Scope B (Contract 3): sidebar, connection dialog, SSO banner, add-bucket dialog wiring.
- Scope C (Contract 4): breadcrumb, filter, virtualized table with paging, search bar, and final checks.

## Done When
- Every contract holds.
- `components.css` contains only CSS copied from `tds component` output, and notes list the ids.
- Run from `/home/ngosi/projects/s3-explorer`, each exits 0:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 329 tests pass; new tests add to that)
  - `pnpm build` (Baseline: exit 0)
- `grep -rn "dangerouslySetInnerHTML" src/renderer` prints nothing.
- The Coordinator runs the 10,000-object scrolling check against RustFS after Scope C; you do not need to.

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable. No `any` in production code. Use tabs, double quotes, one statement per line, braces on control flow, and lines near 80 columns.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/s3-media-explorer/phase-06/journal.md`, then return that block and the matching status line from `erp.md`. For a scope that is not the last, write `NEXT: CONTINUE_CONTEXT` and `Meets Spec? NO` and say in SUMMARY which scope is complete.
