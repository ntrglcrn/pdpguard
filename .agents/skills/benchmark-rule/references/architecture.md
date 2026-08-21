# Executable benchmark architecture

## Files and execution

- `benchmark/manifest.json` is version 1 data validated by Zod in `benchmark/runner.ts`.
- `benchmark/fixtures/*.html` are deterministic local documents.
- `benchmark/runner.ts` launches Chromium, uses each case viewport, loads fixture HTML with `page.setContent`, decodes images, runs `runAuditRules`, and optionally appends `runAddToCartInteraction` when `fixture.interaction` is true.
- `tests/benchmark.test.ts` loads and runs the benchmark, prints `formatBenchmarkReport`, and enforces dataset and regression gates.
- `pnpm benchmark` runs only that test with the verbose reporter. `pnpm test` also includes it through the global Vitest pattern.
- `docs/calibration.md` is a separate manually labelled live-discovery matrix; its URLs do not enter benchmark precision or recall.

## Manifest contract

- ID: unique `PDP-[A-Z]+-NNN`.
- Kind: `known-defect` or `negative-control`.
- Source: `github-issue` or `public-pdp`, URL, and ISO capture date.
- Fixed fields: platform, literal `pageType: "pdp"`, stability, viewport, business impact, evidence, and notes.
- Expected findings accept only IDs in `benchmarkRuleIds`, plus status and severity.
- Supported cases require `fixture`. Unsupported cases require `unsupportedReason`.
- Fixture paths must resolve beneath `benchmark/fixtures`; status overrides simulate main-response HTTP status.

## Classification

- A supported expected failure matching status and severity increments TP; a mismatch or missing rule increments FN.
- Any unexpected failed finding increments FP; other returned findings increment TN.
- Supported `known-defect` cases are rerun with `fixedPath` as synthetic `-FIXED` negative controls; their expected listed findings are converted to passed/info.
- Uncaught case execution errors become `infrastructure-error`.
- Unsupported cases are not executed and become `unsupported`.
- Overall classification prioritizes FN, then known-defect TP, then FP, otherwise TN.

Metrics aggregate per-rule TP/FN/FP/TN. Precision and recall use deterministic executions; unique defect patterns are deduplicated by sorted failed-rule signature.

## Case design

- A positive fixture isolates the sourced observable defect; its fixed fixture changes only what repairs it.
- A negative control records a specifically verified healthy expectation.
- An unsupported entry records a real limitation without inventing a fixture the detector cannot observe.
- Reuse a fixture only when it faithfully represents the same observable pattern.
