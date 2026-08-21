# Review checklist

## Architecture and trust boundaries

- Keep one Next.js application: UI/routes in `src/app`, contracts in `src/domain`, audit implementation in `src/lib/audit`.
- UI must not import or call Playwright directly.
- Keep URL safety, browser request interception, and screenshot storage separate. Reject weakening SSRF, redirect, timeout, resource, path, or safe-error protections.
- Keep screenshot bytes and absolute filesystem paths out of `AuditResult`.

## Rules

- Each `AuditRule` is deterministic, independent, and returns one typed `Finding` with factual evidence and an actionable recommendation.
- Preserve public lowercase kebab-case `id`/`ruleId`; changing one breaks benchmark/schema consumers.
- Keep `pageAvailabilityRule` first and its short-circuit behavior intact.
- Confirm registry parity between emitted rule IDs and `benchmarkRuleIds`.
- Challenge unexplained thresholds, unbounded DOM scans, excessive waits, duplicated normalization/selectors, and a complex heuristic where an existing helper or browser primitive suffices.

## Regression evidence

- Pure helpers have focused Vitest cases; DOM/layout behavior has local Playwright tests.
- Rule fixes have a before-failing regression and a healthy counterexample where FP risk exists.
- Supported benchmark defects retain defective/fixed pairs; existing cases do not gain FN, FP, or infrastructure errors.
- Benchmark test totals and explicit rule lists match manifest changes rather than being loosened.

## Scope

- Reject speculative factories, registries, services, databases, queues, adapters, or dependencies.
- Flag unrelated production changes and documentation that contradicts actual behavior.
