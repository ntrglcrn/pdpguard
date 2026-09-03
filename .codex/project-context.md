# PDP Guard current snapshot

**Baseline:** `main` after roadmap reconciliation (`7284a80`).

**Focus:** Hosted Foundation for customer access. Manual Monitoring v1 is
complete; retain its bounded, derived history and conservative comparison.

**Done:** deterministic audit/rule/evidence model; scenario primitive; SaaS
Frontend v1; Store persistence; bounded Store Catalog/PDP Inventory discovery
with deterministic category segmentation; scoped Store Audits;
Quick Audit runs/findings; Manual Monitoring with bounded scope history,
baselines, and confirmed-state semantics; protected artifacts; local
session/bootstrap; CI and benchmark foundation.

**Catalog boundary:** discovery is Store-scoped and bounded; preserve exact URL
deduplication, same-origin/SSRF checks, and inactive-on-missing semantics.

**Not done:** scheduled monitoring, and hosted production auth/database/storage/execution.

**Workflow:** Store → Catalog Discovery → PDP Inventory → Store Audit → Issues
→ Monitoring. Store Audit scopes are category, uncategorized, or all active
PDPs; they select up to five PDPs deterministically and snapshot criteria and
membership immutably. Lifecycle comparison is only available for identical,
complete snapshots. Specific PDP URL → Run → Findings/Evidence is secondary
Quick Audit.

**Maintenance:** after a milestone, update this snapshot and the roadmap when
status changes. Update stable skill references only when boundaries or
engineering conventions change. PRD and roadmap override this snapshot.
