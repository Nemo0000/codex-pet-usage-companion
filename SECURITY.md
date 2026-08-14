# Security policy

## Supported versions

Security fixes are provided for the latest published version.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability that could expose local
account data or authentication material. Contact the maintainer privately and
include reproduction steps without attaching tokens, cookies, account dumps,
or a full `.codex` directory.

## Data boundaries

Codex Usage Companion communicates with a locally spawned `codex app-server`
process over standard input/output. The app does not scrape ChatGPT, read
browser cookies, or upload usage data. Raw protocol payloads and authentication
tokens must never be written to application logs.
