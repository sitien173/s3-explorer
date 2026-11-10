---
title: Development
nav_order: 5
---

# Development
{: .no_toc }

1. TOC
{:toc}

## Stack

The application uses the following stack:

- **Desktop runtime:** Electron 45.2.1 and electron-vite 6.0.0.
- **Frontend framework:** React 19.3.1 and TypeScript 6.0.3.
- **Styling:** Tailwind CSS 4.3.4 with CSS-first tokens defined in `src/renderer/src/styles/globals.css`.
- **UI primitives:** Base UI 1.9.0 with package `@base-ui/react`.
- **Forms and validation:** React Hook Form 7.91.0 with Zod 4.6.7 and `@hookform/resolvers` 7.0.3.
- **Data fetching:** TanStack Query 5.107.1 with package `@tanstack/react-query`.
- **Client state:** Zustand 5.1.0 with `persist` middleware.
- **Linter and formatter:** Biome 2.6.6 with package `@biomejs/biome`.

## Scripts

All scripts match `package.json`:

- `pnpm dev`: Start the Electron application in development mode.
- `pnpm build`: Build main, preload, and renderer bundles via electron-vite.
- `pnpm dist`: Build bundles and package Linux AppImage and Debian distributions via electron-builder.
- `pnpm typecheck`: Run TypeScript checks across node and web projects via `tsc -b tsconfig.node.json tsconfig.web.json`.
- `pnpm lint`: Run the Biome linter across the project via `biome check .`.
- `pnpm format`: Format files using Biome via `biome format --write .`.
- `pnpm test`: Run unit tests with Vitest via `vitest run --project unit`. On loaded machines, passing `--maxWorkers=2` is recommended.
- `pnpm test:integration`: Run integration tests against RustFS via `vitest run --project integration`. On loaded machines, passing `--maxWorkers=2` is recommended.
- `pnpm e2e`: Run Playwright end-to-end tests against RustFS via `playwright test`.
- `pnpm seek:2gb`: Execute the large file stream seeking benchmark via `jiti scripts/seek-2gb.ts`.

## Testing

Integration tests and end-to-end tests share RustFS on port 19000. Run them sequentially, not at the same time. Run the Electron end-to-end test headless with `xvfb-run -a pnpm e2e`.

The CI workflow runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every push to `main` and every pull request.

## Release

To publish a release, set `version` in `package.json`, commit, then push a matching tag such as `git tag v0.1.0 && git push origin v0.1.0`. The Release workflow runs the checks, builds both packages, smoke-tests the AppImage, and attaches them to a GitHub release.

## Documentation Site

This site is built with Jekyll and the Just the Docs theme from the `site/` folder. The Pages workflow deploys it on every push to `main` that changes `site/`.
