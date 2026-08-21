---
name: benchmark-rule
description: Add, change, or assess PDP Guard benchmark coverage for detection rules. Use for benchmark cases, manifest entries, deterministic fixtures, negative controls, unsupported examples, or precision/recall coverage work.
---

# Maintain benchmark coverage

1. Read [references/architecture.md](references/architecture.md) and `docs/benchmark.md`.
2. Decide whether the evidence is a supported known defect, labelled negative control, or unsupported case.
3. Add the smallest manifest and fixture change that represents the source exactly.
4. Keep defective/fixed fixtures paired for supported defects and avoid copying storefront markup.
5. Run `pnpm benchmark`; inspect classifications, per-rule counts, coverage gaps, precision/recall, and infrastructure errors.
6. Update `tests/benchmark.test.ts` dataset totals only when the manifest facts changed.
7. Run `$verify-change`.

Never change production detection logic only to make a fixture pass.
