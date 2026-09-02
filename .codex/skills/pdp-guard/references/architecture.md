# PDP Guard architecture map

| Capability                 | Primary owner                                                | Critical invariant                                               |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Audit contracts/findings   | `src/domain/audit.ts`                                        | One deterministic rule returns one typed, actionable Finding.    |
| SaaS contracts             | `src/domain/saas.ts`                                         | Workspace → Store → Audit Run → Finding/Artifact ownership.      |
| Browser audit/rules        | `src/lib/audit/`                                             | UI never calls Playwright; stable rule IDs and bounded evidence. |
| Scenario primitive         | `src/domain/scenario.ts`, `src/lib/audit/scenario-engine.ts` | Validated and bounded; not a customer workflow yet.              |
| URL/browser safety         | `src/lib/url-safety.ts`, `src/lib/audit/engine.ts`           | Preserve URL validation, redirects, interception, and limits.    |
| Persistence/auth/artifacts | `src/lib/workspace-service.ts`                               | Derive tenant ownership; an artifact ID is never authorization.  |
| Quick Audit orchestration  | `src/lib/audit-execution.ts`, `src/lib/app-service.ts`       | One local slot; run state flows through `WorkspaceService`.      |
| UI/API                     | `src/app/`, `src/components/`                                | Server adapters call services; use `docs/design-system.md`.      |
| Tests/gate                 | `tests/`, `tests/benchmark/`, `.github/workflows/ci.yml`     | Benchmark protects rule behavior; CI is the full gate.           |

Inspect the owner before adding an engine, service, or persistence path. Do not
build a second audit/scenario/catalog implementation, bypass `WorkspaceService`,
expose public artifact paths, weaken SSRF controls, or replace existing
findings/evidence or stable rule IDs without a migration.

Catalog Discovery has no complete module in the current tree. Verify any
claimed primitive and the roadmap before designing against it.
