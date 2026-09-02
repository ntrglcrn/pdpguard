# PDP Guard

PDP Guard is a local SaaS foundation for deterministic, evidence-first ecommerce
quality checks. The regular workflow is Store → Catalog Discovery → PDP
Inventory → Store Audit → Issues → Monitoring. Stores, persisted single-PDP
Quick Audits, findings, and authorized artifacts exist today; Catalog Discovery
is next. Quick Audit is a targeted diagnostic flow, not the regular workflow.

## Supported environment

- Node.js 24.x (required by the native SQLite persistence foundation)
- pnpm 10.28.0
- Playwright 1.62.1 with its matching Chromium build

## Setup

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), bootstrap the local
workspace, add a public Store, then run a same-origin Quick Audit.

## Verification

The official clean-checkout gate is `.github/workflows/ci.yml` on
`ubuntu-latest`. It installs the pinned pnpm version, Node.js 24 and Chromium
system dependencies, then runs:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm benchmark
pnpm build
```

`pnpm typecheck` removes generated `.next` artifacts before regenerating Next.js
route types, so verification does not depend on developer-local build output.

## Architecture

- `src/app` contains the workspace UI, server actions, and HTTP routes.
- `src/domain` contains audit, scenario, and SaaS contracts.
- `src/lib/audit` contains the Playwright runner, independent rules, and
  scenario primitive.
- `src/lib/workspace-service.ts` owns SQLite persistence, sessions/RBAC, and
  protected artifact authorization.
- `src/lib/url-safety.ts` owns SSRF validation.

After `domcontentloaded`, the browser runner waits up to 15 seconds for a
bounded auditable state: observable content or a generic PDP signal must remain
structurally stable for 750 ms. If that state is not reached, the normal PDP
rules are skipped and the result contains one incomplete `page-availability`
finding instead of warnings derived from a loader.

The local foundation persists SQLite data under `.runtime`; screenshot bytes are
protected run artifacts and require ownership checks to read.

## MVP limitations

- One same-origin Quick Audit and one in-process audit at a time; there is no
  queue or isolated worker.
- Full-page captures are rejected above 20,000 CSS pixels to bound memory use.
- Catalog Discovery/PDP Inventory, Store Audit, Issues, Monitoring, hosted
  identity/workers/storage, visual regression, AI pass/fail, billing, and
  integrations are not implemented.
- Rules use deliberately explainable heuristics and can produce false positives or negatives on unusual storefronts.
- Network requests are checked against local/private/reserved address ranges before navigation and at request time. This materially reduces SSRF risk, but a hostile environment with DNS rebinding or compromised DNS requires infrastructure-level egress controls before internet deployment.
- Local bootstrap sessions and SQLite owner/member RBAC are foundations only.
  Do not expose this local product publicly without the controls in
  `docs/hosted-security-boundary.md`.
