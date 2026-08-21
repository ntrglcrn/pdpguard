# Rule system

## Locations

- `src/domain/audit.ts`: `AuditRuleContext`, `AuditRule`, and `Finding` contracts.
- `src/lib/audit/rules.ts`: seven default browser-backed rules, shared DOM snapshots, overlay dismissal, `auditRules`, and `runAuditRules`.
- `src/lib/audit/detection.ts`: pure price and purchase-label helpers.
- `src/lib/audit/json-ld.ts`: pure Product/ProductGroup JSON-LD parser.
- `src/lib/audit/add-to-cart.ts`: optional interaction check, invoked by the engine only when requested.
- `tests/detection.test.ts` and `tests/json-ld.test.ts`: pure helper tests.
- `tests/rules.browser.test.ts`: local Playwright DOM/rule tests.

## Choose a reference

- Simple page metadata: `pageTitleRule`.
- DOM collection plus a pure matcher: `productPriceRule` and `detection.ts`.
- Shared DOM snapshots: `productImageRule` / `brokenImagesRule`.
- Structured data: `structuredProductDataRule` and `json-ld.ts`.
- Viewport/actionability heuristics: `purchaseCtaRule`; copy its complexity only when the signal truly needs it.
- User-enabled interaction: `runAddToCartInteraction`; it is not a default `AuditRule` registry entry.

## Contract and naming

- Export a camel-case function ending in `Rule`, typed as `AuditRule`.
- Return exactly one `Finding` on every supported execution.
- Use one unique lowercase kebab-case public ID. Set both `id` and `ruleId` to it, matching existing rules.
- Passed findings use `status: "passed"`; existing rules normally use `severity: "info"` on pass and the defect severity on failure.
- Make `evidence` describe observed facts and `recommendation` an actionable fix. Avoid unsupported revenue claims.

## Registration

- Add ordinary deterministic rules to `auditRules` in `src/lib/audit/rules.ts`.
- `pageAvailabilityRule` must remain first: `runAuditRules` returns only it when availability fails, then runs `auditRules.slice(1)`.
- Add every emitted rule ID to `benchmarkRuleIds` in `benchmark/runner.ts`; its Zod enum and per-rule counters derive from this tuple.
- Interaction-only checks follow the explicit option path in `src/lib/audit/engine.ts`, not `auditRules`.

## Tests

- Put pure parser/matcher cases in the closest helper test.
- Put layout, visibility, browser API, or DOM behavior in `tests/rules.browser.test.ts` using `page.setContent` at the existing 390 × 844 viewport.
- Cover at least one defect and one healthy counterexample. Add an unsupported case when the requested condition cannot be observed reliably.
- Reuse an existing test file unless a genuinely separate subsystem is introduced.
