# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a Vulnerability

Do not open a public issue for security problems.

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/sitien173/s3-explorer/security/advisories/new).

Include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the affected version or commit.

You will get an acknowledgement within 7 days. Please allow time for a fix before you disclose the issue publicly.

## Scope

Examples of issues in scope:

- exposure of AWS credentials or signed URLs to the renderer process,
- bypass of the Electron sandbox, context isolation, or Content Security Policy,
- unauthorized access through the loopback streaming proxy.
