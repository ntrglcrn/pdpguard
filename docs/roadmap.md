# PDP Guard roadmap

PDP Guard is an evidence-first, deterministic PDP quality product. Its primary
workflow is moving from a useful local SaaS foundation to:

```text
Add Store → Catalog Discovery → PDP Inventory → Store Audit → Issues → Monitoring
```

Manual same-origin PDP entry remains supported as **Quick Audit**: a diagnostic,
reproduction, and specific-page verification tool. It is not the intended
regular workflow for a store.

## Evidence-based current state

`main` at `6dc27cb7c4fa86f8bc57f7730f0924023e3bc3ec` has the local SaaS
frontend v1. A local bootstrap creates a local session and workspace; users can
add a public Store, run one same-origin PDP audit, and view persisted runs,
findings, and authorized screenshots. SQLite stores the ownership chain
Workspace → Store → Audit Run → Finding / Artifact. The deterministic audit and
bounded scenario engines, stable PDP rules, benchmark, and CI are present.

This is not yet a store-quality workflow:

- **Catalog Discovery:** not implemented. There is no discovery mechanism,
  Store relationship, persisted catalog, URL deduplication, product identity,
  refresh, SaaS UI, or audit orchestration for it.
- **PDP Inventory:** not implemented. A run records a target URL, but there is
  no discovered-PDP domain model or audit history attached to a product/page.
- **Store Audit:** not implemented. Despite its internal function name,
  `executeStoreAudit` persists one synchronous manual PDP Quick Audit; it cannot
  select or audit an inventory.
- **Issues:** not implemented. Findings are correctly one rule/problem on one
  run, but there is no cross-PDP aggregation or lifecycle state.
- **Monitoring:** not implemented. There is no catalog refresh, comparison,
  schedule, notification, or integration.

The scenario engine is implemented and browser-fixture tested, but is not wired
to the SaaS runner, persistence, or UI. It is an engine primitive, not a
configured customer workflow.

Hosted controls are foundations, not release readiness: sessions and owner/member
RBAC exist in SQLite, but identity is local bootstrap only; browser execution is
in the web process with a process-local single-audit flag; artifacts are SQLite
BLOBs; and there are no isolated workers, durable jobs, object storage, or
production deployment safeguards. See
[hosted security boundary](./hosted-security-boundary.md) for the required
boundary.

## Product principles and scope

- Deterministic checks, stable rule IDs, explicit expected state,
  equivalent-state comparison, bounded execution, safe URL/browser handling,
  and evidence-first findings remain non-negotiable.
- One rule remains one problem. Store-level Issues group repeated instances;
  they do not replace or blur individual Finding evidence.
- PDP is the first specialization. PLP/search follow the store workflow;
  cart/checkout stays controlled and later. No generic AI pass/fail, visual
  judgement, arbitrary scripts, payment submission, or unbounded public-web
  crawl.

## Dependency roadmap

### 1. Catalog Discovery and PDP Inventory v1

**Goal:** a registered Store can discover a bounded set of candidate PDP URLs
and retain a reviewable, refreshable PDP inventory in the SaaS UI.

**Why now:** manual URLs cannot supply a regular store workflow, and no current
primitive does this.

**Scope:** start with deterministic, bounded mechanisms appropriate to the
store origin; preserve URL, redirect, byte, count, depth, and decompression
limits; record source and discovery outcome. Persist a Store-owned page record
with a conservatively normalized URL, optional observed canonical/product
identity, first/last seen, eligibility/status, and audit references. Use the
exact normalized URL as the v1 deduplication key; do not silently merge
variants, locales, query URLs, canonicals, or optional product IDs.

**Out of scope:** arbitrary web crawling, PIM/catalog management,
merchant-specific variant modeling, scheduled refresh, and audit execution.

**Done:** a user can add a Store, run discovery or a manual refresh, and see a
persisted bounded inventory with safe failures; duplicate and off-origin URLs
do not become candidates. Disappeared pages become explicit inactive/missing
observations, not deleted history.

**Dependency/gate:** current local product only.

### 2. Store Audit v1

**Goal:** run the existing PDP audit over an explicit subset of a Store
inventory and present the resulting per-PDP evidence.

**Why now:** this is the first complete primary workflow; it turns existing
single-PDP execution into a Store capability without inventing scheduling.

**Scope:** manual Store Audit of a user-selected bounded inventory sample;
retain Quick Audit for a specific PDP. Record the Store Audit and link its child
PDP runs to inventory entries.

**Out of scope:** automatic scheduling, full-catalog-by-default execution,
cross-run issue lifecycle, and alerts.

**Done:** a user can discover a Store catalog, choose the bounded Store Audit
mode, run it, and navigate from results to the existing Findings and Evidence.

**Dependency/gate:** PDP Inventory. Local execution limits remain visible; this
is not a hosted-pilot claim.

### 3. Issue aggregation and store quality report

**Goal:** summarize repeated equivalent rule failures without losing the
underlying Findings.

**Why now:** aggregation becomes meaningful only after Store Audit produces
multiple PDP results.

**Scope:** an Issue represents Store + stable Rule + comparable failure
signature, affected PDPs, and representative existing evidence. Keep individual
evidence immutable and navigable. Persist an audit/rule-set version and the
selected inventory snapshot/mode before later comparison work.

**Out of scope:** AI triage, cross-store grouping, tickets, notifications, and
arbitrary similarity matching.

**Done:** one repeated deterministic problem is shown once with its affected
PDP count and evidence, while distinct rule failures remain distinct.

**Dependency/gate:** Store Audit v1. Lifecycle states (`new`, `unchanged`,
`resolved`, `regressed`) wait for comparable complete audits in Monitoring.

### 4. Monitoring v1

**Goal:** make the manual Store Audit comparable over time.

**Scope:** manual catalog refresh and comparison of compatible, complete Store
Audit snapshots. Only this stage may assign `new`, `unchanged`, `resolved`, or
`regressed`; a sampled-out or failed PDP is never resolved.

**Done:** the user can compare compatible completed snapshots and see bounded,
trustworthy store quality change without hiding partial coverage.

**Dependency/gate:** Inventory for refresh; Issue aggregation plus the stored
rule-set/version and selected scope for comparison.

### 5. Hosted Foundation for customer access

**Goal:** meet the Private Pilot release gate before customers directly use a
hosted product.

**Scope:** external production identity/authentication, durable tenant data and
private artifacts, isolated browser workers with connection-time egress
protection, durable job lifecycle/cancellation/limits, retention/deletion, and
sanitized operational errors.

**Out of scope:** enterprise SSO, multi-region, and custom tenant policy.

**Dependency/gate:** required for Private Pilot Ready and for scheduled work;
not required to validate the preceding local product milestones.

### 6. Scheduled Monitoring

Run bounded catalog refresh and Store Audits on the hosted lifecycle. This
follows Hosted Foundation and the manual comparison semantics; it does not add
notifications.

### 7. Alerts and integrations

Add one validated notification channel only after scheduled state transitions
are trustworthy. Ticketing and broader integrations remain later work.

### Later surfaces

PLP/search scenarios follow once the PDP store workflow is useful. Controlled
variant/Add-to-Cart, API correlation, cart, and checkout remain gated by the
existing safety requirements. They do not displace PDP Inventory or Store
Audit.

## Current focus

**Catalog Discovery and PDP Inventory v1:** bounded Store-scoped discovery plus
a persisted PDP inventory. It is the first missing capability in the primary
workflow.

## Release gates

### Current local product

Usable by a developer/founder on loopback: local bootstrap, SQLite persistence,
same-origin Quick Audit, and persisted report/evidence are present. The real
limits are one in-process audit, local storage, and no external identity.

### Private Pilot Ready

Before a real ecommerce customer receives access, require external production
identity/authentication, durable tenant database and authorized artifact storage,
isolated browser workers with connection-time egress protection, durable job
lifecycle/cancellation/limits, retention/deletion, and sanitized operational
errors. Catalog/Store Audit must also be bounded and tenant-scoped. Enterprise
SSO, multi-region, and custom policies are not pilot blockers.

### Public SaaS Ready

Before independent workspace onboarding, prove the Private Pilot controls at
operational scale and add reliable workspace provisioning, production abuse and
capacity controls, backup/recovery and observability, documented support and
incident procedures, and any schedule/notification safeguards that are exposed
publicly. Do not call a local UI or a single-process runner public SaaS.

## Deferred

Generic visual baselines, AI-generated pass/fail, arbitrary public-web crawl,
mobile apps, payment/order submission, enterprise SSO/custom policies,
multi-region, and customer-managed workers/storage stay deferred unless
validated customer demand changes the decision.
