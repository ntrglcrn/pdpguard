---
name: add-rule
description: Add a new deterministic PDP Guard audit rule with tests and benchmark coverage. Use whenever implementing a new product-page quality check or detector.
---

# Add a rule

1. Read `references/rule-system.md` before editing.
2. Define the observable defect and the supported boundary. Do not add a rule for speculative conditions.
3. Choose the simplest existing rule with the same signal source as the reference.
4. Implement one deterministic `AuditRule` returning one typed `Finding` with actionable evidence and recommendation.
5. Prefer extending existing utilities before creating new helpers.
6. Ensure the rule is deterministic and produces stable results for identical inputs.
7. Add the rule to the correct execution path and keep its public kebab-case rule ID stable.
8. Add the smallest test proving both positive and negative behavior. Prefer unit tests unless browser coverage is required.
9. Read `references/benchmark-coverage.md`, then add benchmark coverage or explicitly document the case as unsupported.
10. Run `$verify-change`.

Do not weaken URL or network safety.

Do not introduce abstractions for a single rule.

Keep interactive checks out of the default deterministic registry unless interaction is explicitly required.
