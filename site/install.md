---
title: Install & Run
nav_order: 2
---

# Install & Run

## Download

Prebuilt AppImage and Debian packages are attached to each [GitHub release](https://github.com/sitien173/s3-explorer/releases).

## Prerequisites

- Node.js and pnpm.
- Docker for RustFS-backed integration and end-to-end tests.
- ffmpeg to generate media test fixtures.
- `xvfb-run` for headless Electron end-to-end and packaging smoke tests on Linux.

## Run From Source

Install dependencies with `pnpm install`, then start the development app with
`pnpm dev`. Add an AWS profile or S3-compatible connection in the app.

## Package

`pnpm dist` creates Linux AppImage and Debian packages in `dist/`. After
building, `bash scripts/smoke-appimage.sh` launches the AppImage in an isolated
headless profile.
