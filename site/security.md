---
title: Security
nav_order: 4
---

# Security

The renderer runs in an Electron sandbox with `nodeIntegration: false` and `contextIsolation: true`. It does not receive AWS credentials or build direct S3 URLs. The main process signs S3 requests through a loopback streaming proxy at `127.0.0.1`. Secrets use Electron `safeStorage` backed by the operating system keychain when available. Headless tests use an isolated user data directory and the session-only basic password store. A Content Security Policy restricts media, image, frame, and connect sources to self and loopback proxy ports.

## Reporting a Vulnerability

Do not open a public issue for security problems. Follow the [security policy](https://github.com/sitien173/s3-explorer/blob/main/SECURITY.md) to report privately through GitHub Security Advisories.
