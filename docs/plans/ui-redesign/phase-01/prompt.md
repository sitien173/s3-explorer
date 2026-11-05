# Phase 1: Toolchain, token bridge, and scanner with no visible change

## Goal & Outcome
- Plan Goal: the renderer of S3 Media Explorer runs on Tailwind CSS v4 and shadcn/ui with the Radix base, styled with the Trulioo Design System (TDS). Layout and flows stay unchanged.
- Phase Outcome: the new toolchain is installed, configured, and enforced by a rewritten styling scanner. The app looks and behaves exactly as at base.

## Context & Architecture
- Root: `/home/ngosi/projects/s3-explorer` | Branch: `main` | Base: `refs/plans/ui-redesign/phase-01/base`
- Prior State: no plan phase has run. Baseline: `pnpm typecheck` exit 0, `pnpm test` 23 files 565 tests, `pnpm build` exit 0, `pnpm test:integration` 7 files 25 tests, `xvfb-run -a pnpm e2e` 1 passed.
- Read first: `docs/plans/ui-redesign/DESIGN.md` sections "Toolchain", "Stylesheets", "Styling scanner", "Testing", and `docs/plans/ui-redesign/PLAN.md` "Phase 1".
- Code Context:
  - `src/renderer/src/main.tsx` imports `styles/tokens.css`, `styles/components.css`, `styles/app.css`.
  - `src/renderer/src/styles/components.css` holds 18 TDS components split by `/* tds component: <id> */` markers: button, icon-button, text-input, select, checkbox, field-label, field-caption, field-validation, dialog, data-table, breadcrumb, announcement, side-nav, nav-list, nav-item, spinner, progress-indicator, tag.
  - `electron.vite.config.ts` already aliases `@` to `src/renderer/src` and has a dev-only CSP meta rewrite plugin.
  - `src/main/window.ts` exports `CSP`; `src/renderer/index.html` carries the identical meta CSP. `test/unit/window.test.ts` asserts them.
  - `test/unit/renderer-tokens.test.ts` is the current styling scanner.
  - `vitest.config.ts` defines `unit` and `integration` projects.
  - The `tds` CLI is installed (`tds rules`, `tds component <id>`) if TDS reference is needed.

## Invariants & Boundaries
- Preserve: no TSX markup change except the `main.tsx` stylesheet import. `components.css` content moves byte for byte into `styles/tds/<id>.css`. In `CSP` and the meta CSP, only `style-src` changes to `'self' 'unsafe-inline'`; `script-src` stays `'self'`; every other directive is unchanged; `CSP` still equals the meta CSP. No IPC, preload, schema, or other main-process change.
- `globals.css` must not contain `.dark`, `@custom-variant dark`, shadcn `--radius`, or `calc(var(--radius)`.
- Out of Scope: adding any shadcn component under `components/ui` (Phase 2+), any visible UI change, the unreferenced `app-*` selector scanner rule (Phase 6). Never read or edit `~/.aws/*`, `.env*`, or any credential file.

## Files
Allowed production and test paths:
- `package.json`, `pnpm-lock.yaml` (modify: exact pins below)
- `electron.vite.config.ts` (modify: add `@tailwindcss/vite` to `renderer.plugins` for serve and build; keep dev CSP plugin in sync with the new `style-src` if needed)
- `tsconfig.web.json` (modify: `baseUrl` and `paths` `@/*` -> `src/renderer/src/*`; allow `.tsx` tests to typecheck if they are included anywhere)
- `vitest.config.ts` (modify: unit include `test/unit/**/*.test.{ts,tsx}`, setup file)
- `components.json` (create: shadcn 4.23.0 config: CLI default style, Radix base, `tsx: true`, `rsc: false`, css `src/renderer/src/styles/globals.css`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`, `iconLibrary: lucide`. Write by hand from `https://ui.shadcn.com/schema.json` if `shadcn init` cannot detect electron-vite.)
- `src/renderer/src/lib/utils.ts` (create: `cn()` using `clsx` and `tailwind-merge`)
- `src/renderer/src/styles/globals.css` (create)
- `src/renderer/src/styles/tds/<id>.css` (create: one per marker, 18 files)
- `src/renderer/src/styles/components.css` (delete)
- `src/renderer/src/main.tsx` (modify: import only `./styles/globals.css`)
- `src/renderer/index.html`, `src/main/window.ts` (modify: `style-src` only)
- `test/unit/renderer-tokens.test.ts`, `test/unit/window.test.ts` (modify)
- `test/unit/dom-setup.ts` (create)
- `e2e/app.spec.ts` (modify: computed-style assertions and screenshots)

Worker-owned phase records:
- `docs/plans/ui-redesign/phase-01/notes.md` (append `## Task <M>` blocks)
- `docs/plans/ui-redesign/phase-01/journal.md` (append `# EXTERNAL RESPONSE` under `## Implementation Response`)

Read-only / Forbidden:
- Do not edit `PLAN.md`, `DESIGN.md`, `.handover.md`, `prompt.md`, other phases, or secrets. No dependency beyond those listed plus what they strictly require.

## Tasks
- task-0: Before any change, run the e2e flow once at base and save screenshots of the main screen with a bucket open and of the Add connection dialog as `test-results/phase-01-before-main.png` and `test-results/phase-01-before-connection-dialog.png`. A temporary local script or temporary spec edit is acceptable; remove any temporary code afterwards.
- task-1: Pin and install with exact versions: `tailwindcss` 4.3.4, `@tailwindcss/vite` 4.3.4, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `lucide-react` 1.68.0; dev deps `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8. Add the Tailwind plugin, `@/*` paths, `components.json`, and `lib/utils.ts`. Confirm with `pnpm dlx shadcn@4.23.0 info`: it must report Tailwind v4, the Radix base, and the `@/components/ui` alias. Record its output in notes.
- task-2: Split `components.css` at its markers into `styles/tds/<id>.css` byte for byte. Write `globals.css` exactly per DESIGN.md "Stylesheets": `@layer theme, base, components, utilities;`, `@import "tailwindcss";`, `@import "./tokens.css";`, one `@import "./tds/<id>.css" layer(components);` per file in marker order, `@import "./app.css" layer(components);`, a `@theme` block clearing `--color-*`, `--radius-*`, `--shadow-*`, `--text-*`, `--font-*`, and a `@theme inline` bridge with `--font-sans: var(--font-family);` and these rows: background, card, popover -> `--surface-neutral-01`; foreground, card-foreground, popover-foreground, secondary-foreground, accent-foreground -> `--text-default`; primary -> `--interactive-default`; primary-foreground -> `--text-inverse`; secondary, muted -> `--surface-neutral-02`; muted-foreground -> `--text-description`; accent -> `--surface-hover`; destructive -> `--border-negative`; border -> `--border-subtle`; input -> `--border-strong`; ring -> `--border-focus`. Each row is written as `--color-<name>: var(<token>);`. Verify that concatenating `styles/tds/*.css` in marker order reproduces base `components.css` (`git show refs/plans/ui-redesign/phase-01/base:src/renderer/src/styles/components.css`) and record the exact command and result in notes.
- task-3: RED first. Rewrite `test/unit/renderer-tokens.test.ts` with fixtures for every scanner rule in DESIGN.md "Styling scanner" except the unreferenced `app-*` selector rule. Each forbidden pattern has a fixture that fails and each allowed pattern a fixture that passes. Rules: hex colors forbidden outside `tokens.css` and `styles/tds/**`; core tokens forbidden outside `tokens.css`, `styles/tds/**`, and the `@theme` blocks of `globals.css`; class strings checked in JSX `className` and in `cn()` and `cva()` arguments after stripping variant prefixes such as `hover:` and `data-[state=open]:`; outside `components/ui` each class is `tds-*`, `app-*`, or an allowlisted layout utility whose spacing and sizing values are a TDS token such as `gap-(--gap-md)`, a fraction, `full`, `auto`, or `0`; inside `components/ui` color utilities must name a bridged color, and font size, font family, radius, and shadow utilities must use a TDS token value; `dangerouslySetInnerHTML` stays forbidden. Keep every protection the current scanner has. Then make the real-file scan pass.
- task-4: Change `style-src` to `'self' 'unsafe-inline'` in `CSP` and in `index.html`; update `window.test.ts` so it asserts the new `style-src`, unchanged `script-src 'self'`, and equality of `CSP` and meta CSP. Add `test/unit/dom-setup.ts` with polyfills for `ResizeObserver`, `Element.prototype.scrollIntoView`, and pointer capture (`hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`), guarded so it is a no-op outside jsdom. Widen the unit include to `.test.{ts,tsx}` and register the setup file. Add a minimal DOM smoke test only if needed to prove the setup loads under `// @vitest-environment jsdom`. Add e2e computed-style assertions on the main window: `getComputedStyle(document.documentElement).getPropertyValue('--color-neutral-100')` equals its `tokens.css` value, `--radius-md` equals `0.375rem`, and body background color equals the resolved `--surface-neutral-01`. Save after screenshots as `test-results/phase-01-after-main.png` and `test-results/phase-01-after-connection-dialog.png`, compare with the before screenshots, and list every visible difference in notes. Fix any preflight regression in `globals.css` or `app.css` without changing TSX.

## Done When
- `pnpm dlx shadcn@4.23.0 info` reports Tailwind v4, the Radix base, and the `@/components/ui` alias.
- Concatenated `styles/tds/*.css` in marker order reproduces base `components.css` apart from the marker split.
- Scanner fixtures fail for each forbidden pattern and pass for each allowed pattern.
- e2e computed-style assertions pass. Before and after screenshots exist.
- Run from `/home/ngosi/projects/s3-explorer`:
  - `pnpm typecheck` (Baseline: exit 0)
  - `pnpm test` (Baseline: 23 files, 565 tests; counts may only grow)
  - `pnpm build` (Baseline: exit 0)
  - `pnpm test:integration` (Baseline: 7 files, 25 tests; requires Docker)
  - `xvfb-run -a pnpm e2e` (Baseline: 1 passed; requires Docker)

## Rules
Read and follow these bundled contracts:
- Contract: `/home/ngosi/projects/refract/plugin/shared/worker-contract.md`
- Response: `/home/ngosi/projects/refract/plugin/shared/erp.md`
- Notes: `/home/ngosi/projects/refract/plugin/shared/notes-template.md`
- Journal: `/home/ngosi/projects/refract/plugin/shared/journal-template.md`

Role boundary: You are the phase implementer, not Coordinator. Work directly in `/home/ngosi/projects/s3-explorer`. Do not run Git commits, resets, stashes, branch changes, or ref updates. Do not invoke Coordinator skills or submit nested jobs. Use `refract ask "<question>"` for unresolved spec questions, or return `NEXT: BLOCKED` if unavailable.

## Response Format
Append the complete `# EXTERNAL RESPONSE` block to `docs/plans/ui-redesign/phase-01/journal.md`, then return that block and the matching status line from `erp.md`.
