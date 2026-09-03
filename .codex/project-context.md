# PDP Guard current snapshot

**Baseline:** `main` after roadmap reconciliation (`7284a80`).

**Focus:** Store Audit v1. Catalog Discovery and PDP Inventory SaaS v1 are
complete; retain their bounds and tenant scope while adding an explicit,
manual inventory selection for Store Audit.

**Done:** deterministic audit/rule/evidence model; scenario primitive; SaaS
Frontend v1; Store persistence; bounded Store Catalog/PDP Inventory discovery;
Quick Audit runs/findings; protected artifacts; local session/bootstrap; CI and
benchmark foundation.

**Catalog boundary:** discovery is Store-scoped and bounded; preserve exact URL
deduplication, same-origin/SSRF checks, and inactive-on-missing semantics.

**Not done:** Store Audit, issue aggregation, monitoring, and hosted production
auth/database/storage/execution.

**Workflow:** Store → Catalog Discovery → PDP Inventory → Store Audit → Issues
→ Monitoring. Specific PDP URL → Run → Findings/Evidence is secondary Quick
Audit.

**Maintenance:** after a milestone, update this snapshot and the roadmap when
status changes. Update stable skill references only when boundaries or
engineering conventions change. PRD and roadmap override this snapshot.
