# Detector diagnosis

## Trace the real path

- Default rules: `runAuditRules` → availability gate → `auditRules.slice(1)` in `src/lib/audit/rules.ts`.
- Pure helpers: `src/lib/audit/detection.ts` and `src/lib/audit/json-ld.ts`; search all callers before changing them.
- Optional interaction: `src/lib/audit/engine.ts` calls `runAddToCartInteraction` only when `AuditOptions.testAddToCart` is true.
- Benchmark: `benchmark/runner.ts` loads local fixtures, runs default rules, optionally appends interaction, then classifies results.

## Classification

- False negative: a supported, observable defect passed, was absent, or returned the wrong failure severity expected by the benchmark.
- False positive: a healthy or fixed case failed unexpectedly.
- Infrastructure issue: browser launch, fixture loading, rule execution, or other machinery failed before a trustworthy classification.

An availability failure intentionally stops downstream PDP rules. Do not treat their absence as separate false negatives when the PDP was not observable.

## Regression placement

- Pure text/parser defect: closest pure Vitest file.
- DOM, geometry, visibility, overlay, or browser behavior: `tests/rules.browser.test.ts` with `page.setContent`.
- Real sourced defect that affects measured coverage: minimal defective/fixed fixtures plus a manifest case.

After the focused test, compare benchmark `byRule` counts and every existing case classification. Preserve public `id`/`ruleId` values.
