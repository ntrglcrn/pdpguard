# Hosted Runtime Foundation

The hosted target uses Postgres for all durable product data and job claiming.
SQLite remains the explicit local/test adapter only; it is never a production fallback.

## Schema mapping

| Local SQLite owner | Postgres table | Notes |
| --- | --- | --- |
| users, sessions | users, sessions | Existing local-session semantics retained. |
| workspaces, workspace_members | workspaces, workspace_members | Membership remains the tenant authority. |
| stores | stores | Composite workspace foreign keys prevent ownership drift. |
| audit_runs, findings | audit_runs, findings | Findings keep their existing JSON payload and stable rule IDs. |
| catalog_discoveries, catalog_items, catalog_categories, catalog_category_mappings | same names | Discovery state gains `queued` for worker execution. |
| store_audit_runs, store_audit_run_items | same names | Immutable bounded scope and child linkage are retained. |
| artifacts.contents | artifacts + private object storage | Postgres holds metadata and opaque `storage_key`; bytes never live in production DB. |
| process-local audit/discovery locks and worker token | audit_jobs | Claim, lease, fencing attempt and terminal state are durable. |

## Operation matrix

Production parity means each of the following web- or worker-reachable
operations has a Postgres implementation. The existing `WorkspaceService` is
the SQLite local/test adapter; `PostgresWorkspaceService` now covers the first
production clusters but is not selected until the remaining read/write parity
is complete.

| Operation | Caller | Transaction / ownership | Worker use | Status |
| --- | --- | --- | --- | --- |
| createUser, issueSession, authenticateSession, revokeSession | Auth/session routes | user/session ownership; expiry | no | ported |
| authenticateRequest | Artifact route | session → user | no | ported |
| createWorkspace, listWorkspaces, getWorkspaceMembership, addMember | Account/bootstrap | membership is tenant authority | no | ported |
| createStore, getStore, listStores | Store actions/pages | workspace member | no | ported |
| getStoreCatalog | Catalog/store pages | workspace member | no | ported |
| start/complete/failCatalogDiscovery | Discovery action/worker | job state + catalog mutation transaction | yes | ported |
| createAuditRun, cancelAuditRun, listAuditRuns, getAuditRun | Quick Audit action/pages | run + job must be atomic; workspace member | yes | ported |
| start/complete/failAuditRun | Current executor/worker | fenced terminal transaction | yes | ported |
| createStoreAuditRun | Store Audit/Monitoring action | immutable scope snapshot + parent job transaction | yes | ported |
| link item, item failure, refresh progress, complete/fail Store Audit | Store Audit worker | parent job fence; child run ownership | yes | ported |
| list/get Store Audit, monitoring targets/report/scope | Store/Monitoring pages/actions | workspace member; completed snapshots only | no | ported |
| findings read/write | Run and issue views / worker | run workspace ownership; fenced worker write | yes | ported |
| artifact metadata read/write/delete | Artifact route / worker | workspace member or fenced run capability; object key server-only | yes | ported |
| local SQLite constructor, close, direct test helpers | local dev/tests | local filesystem only | no | intentionally local-only |

The adapter implements all 35 production-facing operations plus external
identity lookup/create. No web or worker module may select its own adapter:
one app-service factory must select SQLite only outside production and Postgres
only in production.

## Migrations

`pnpm db:migrate` applies ordered SQL files under `migrations/`. It holds a
Postgres advisory lock, records a checksum in `schema_migrations`, and wraps
each migration in a transaction. `pnpm db:status` lists applied versions.
Neither web nor worker startup mutates the schema.

Current local SQLite data is disposable development data; no importer is
provided. A hosted environment starts from a clean migrated Postgres database.

## Runtime target

```text
web: authorize → create run/snapshot + job transaction → return queued
worker: claim lease → browser work → private artifact upload → fenced DB commit
```

One Store Audit job owns its existing bounded child PDP sequence. Monitoring
creates the same Store Audit job; it does not own a browser implementation.
Catalog Discovery is likewise a worker job. A lease may be claimed at most
twice; a second abandoned lease is terminal infrastructure failure.

## Deployment boundary

Deploy web and worker as separate services. The worker needs Chromium, database
and artifact write credentials; web needs no Chromium or worker credentials.
Use a non-root worker with resource limits and ephemeral filesystem. Host-level
egress blocking for private, link-local, reserved and metadata ranges is a
Private Pilot Deployment requirement; application URL validation is retained
but is not presented as a substitute for that network control.
