# PDP Guard agent instructions

## Project shape

- Keep this a single Next.js application.
- UI and routes live in `src/app`; audit contracts in `src/domain`; audit code and rules in `src/lib/audit`.
- URL safety and screenshot storage remain separate trust-boundary modules.

## Architecture rules

- UI must never import or call Playwright directly.
- Keep audit rules deterministic and independent through the `AuditRule` contract.
- Do not weaken URL validation, redirect checks, request interception, browser timeouts, or safe error handling.
- Avoid speculative factories, registries, services, databases, queues, and adapters. Add them only when the implemented scope needs them.
- Never put screenshot bytes or absolute filesystem paths in `AuditResult`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
