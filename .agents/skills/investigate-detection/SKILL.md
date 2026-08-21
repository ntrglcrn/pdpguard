---
name: investigate-detection
description: Investigate unexpected PDP Guard behavior on a real product page. Use when a detector result must be explained or classified as true positive, false positive, false negative, true negative, unsupported, or infrastructure error.
---

# Investigate a detection

1. Read [references/classification.md](references/classification.md).
2. Record URL, rule ID, observed finding/evidence, expected behavior, viewport, and whether interaction was enabled.
3. Reproduce through the protected audit path; do not bypass URL validation or request interception for convenience.
4. Confirm the final URL, HTTP/access state, screenshot, relevant DOM/JSON-LD, and finding evidence.
5. Classify the outcome and explain the exact observable signal.
6. If it is FN or FP, invoke `$fix-rule`. If coverage is missing, invoke `$benchmark-rule`. Do not edit code for TP, TN, unsupported, or transient infrastructure failures.

Keep live observations separate from deterministic benchmark claims until a minimal sourced fixture exists.
