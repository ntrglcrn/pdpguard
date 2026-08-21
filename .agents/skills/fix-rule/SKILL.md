---
name: fix-rule
description: Diagnose and fix an existing PDP Guard detector or rule. Use for false positives, false negatives, rule regressions, broken findings, or requests to explain and correct unexpected detector behavior.
---

# Fix a rule

1. Read [references/diagnosis.md](references/diagnosis.md).
2. Reproduce the report with the smallest local test or existing benchmark fixture.
3. Classify it as false negative, false positive, or infrastructure issue before editing.
4. Trace every caller of the helper or rule and identify the shared root cause.
5. Make the smallest fix at that shared point; preserve rule IDs and unrelated behavior.
6. Add one regression test that fails before the fix and a counterexample when FP risk exists.
7. Run the focused test, `pnpm benchmark`, then `$verify-change`.

Do not broaden heuristics without evidence. Do not weaken browser safety or hide infrastructure failures as passed findings.
