# Benchmark coverage for a new rule

Read `docs/benchmark.md`, `benchmark/runner.ts`, and the closest entries in `benchmark/manifest.json` before changing coverage.

- Positive: add a sourced `known-defect` with `expected.supported: true`, a minimal defective fixture, and a `fixedPath` fixture that becomes a paired negative evaluation.
- Negative: ensure at least one healthy fixture passes the new rule. Add a standalone `negative-control` only for a specifically labelled healthy expectation.
- Unsupported: use `expected.supported: false` plus `unsupportedReason`; no local fixture is required.
- Keep fixtures under `benchmark/fixtures`; the runner rejects paths outside it.
- Use manifest IDs matching `PDP-[A-Z]+-NNN`. Preserve source URL, capture date, business impact, evidence, and notes.
- Add the new public ID to `benchmarkRuleIds`. Update hard-coded benchmark expectations in `tests/benchmark.test.ts` only when the actual dataset changes.
- Never tune a detector merely to satisfy a synthetic fixture. The source must describe the exact defect and the fixture must isolate it.

Run `pnpm benchmark` and inspect per-rule TP/FN/FP/TN, the paired fixed classification, precision, recall, infrastructure errors, and positive coverage gaps.
