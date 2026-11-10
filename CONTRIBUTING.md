# Contributing

Thank you for your interest in S3 Media Explorer.

## Setup

1. Install Node.js 24 and pnpm 11.
2. Run `pnpm install`.
3. Run `pnpm dev` to start the app.

Integration and end-to-end tests also need Docker, ffmpeg, and `xvfb-run`. See the [README](README.md#prerequisites).

## Before You Open a Pull Request

Run the same checks as CI:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

If your change touches S3 behavior, also run `pnpm test:integration`. If it touches the UI flow, also run `xvfb-run -a pnpm e2e`. Run them one after the other, because both use RustFS on port 19000.

## Guidelines

- Keep each pull request focused on one change.
- Add or update tests for any behavior change.
- Format code with `pnpm format`.
- Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) style, for example `fix(renderer): keep focus in dialog`.
- Never commit real credentials. Use the RustFS defaults or fake fixture keys in tests.

## Reporting Bugs

Open an issue at https://github.com/sitien173/s3-explorer/issues with steps to reproduce, the expected result, and the actual result. Report security issues through [SECURITY.md](SECURITY.md), not public issues.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
