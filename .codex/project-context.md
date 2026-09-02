# PDP Guard current snapshot

**Baseline:** `main` after roadmap reconciliation (`7284a80`).

**Focus:** Catalog Discovery and PDP Inventory SaaS v1. Its immediate dependency
is bounded, Store-scoped discovery and persisted inventory; do not begin Store
Audit, Issues, or Monitoring first.

**Done:** deterministic audit/rule/evidence model; scenario primitive; SaaS
Frontend v1; Store persistence; Quick Audit runs/findings; protected artifacts;
local session/bootstrap; CI and benchmark foundation.

**Verify before reuse:** no complete Catalog Discovery workflow is assumed.
Confirm any claimed discovery primitive against the current tree and roadmap.

**Not done:** Store Catalog/PDP Inventory workflow, Store Audit, issue
aggregation, monitoring, and hosted production auth/database/storage/execution.

**Workflow:** Store → Catalog Discovery → PDP Inventory → Store Audit → Issues
→ Monitoring. Specific PDP URL → Run → Findings/Evidence is secondary Quick
Audit.

**Maintenance:** after a milestone, update this snapshot and the roadmap when
status changes. Update stable skill references only when boundaries or
engineering conventions change. PRD and roadmap override this snapshot.
