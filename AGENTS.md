# PDP Guard agent instructions

## Fast orientation

- Read `.codex/project-context.md` and the matching `pdp-guard` skill reference
  before unfamiliar or cross-cutting work.
- `docs/prd/pdp-guard-v2.md` and `docs/roadmap.md` are the source of truth for
  product direction. Read them only when scope, priority, or milestone work
  depends on them.
- Keep this a single Next.js app: UI/routes in `src/app`, contracts in
  `src/domain`, audit code in `src/lib/audit`.

## Commands

- `pnpm dev` — local application
- `pnpm lint` — ESLint
- `pnpm typecheck` — strict TypeScript
- `pnpm test` — unit and local Playwright fixture tests
- `pnpm build` — production build

## Non-negotiable boundaries

- UI must never import or call Playwright directly.
- Keep audit rules deterministic and independent through the `AuditRule` contract.
- A new rule returns exactly one typed `Finding` with actionable evidence and recommendation.
- Do not weaken URL validation, redirect checks, request interception, browser timeouts, or safe error handling.
- Avoid speculative factories, registries, services, databases, queues, and adapters. Add them only when the implemented scope needs them.
- Never put screenshot bytes or absolute filesystem paths in `AuditResult`.

## Before finishing

Use `.codex/skills/pdp-guard/references/development.md` for proportional
verification. Milestone-level changes require the full gate; network, browser,
route, or storage changes also require review of SSRF, resource exhaustion,
path traversal, and error disclosure risks.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
