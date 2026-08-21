# PDP Guard benchmark

The executable benchmark complements `docs/calibration.md`: the calibration
matrix remains a live-discovery dataset, while the manifest stores
deterministic defective/fixed fixture pairs and negative controls.

Run it with:

```sh
pnpm benchmark
```

The report prints manifest cases, unique deterministic defect patterns,
covered rules, paired negative evaluations, infrastructure failures and
per-rule positive/negative/TP/FN/FP/TN counts. Precision and recall use only
deterministic fixtures. The 35 live calibration URLs never enter those
metrics.

## Adding a case

Add one entry to `benchmark/manifest.json` and the smallest defective/fixed HTML
pair needed under `benchmark/fixtures`. A supported defect must include a
public source that describes that exact behavior, capture date, expected
rule/status/severity, business impact and evidence path. Do not use an issue as
a thematic link and do not copy a storefront.

Use `kind: "negative-control"` only for a specifically labelled healthy
expectation. Use `expected.supported: false` with `unsupportedReason` when the
current rules cannot observe the reported defect. Never change a detector just
to make a fixture pass.

## Audited coverage

- 22 manifest cases: 14 supported positives, 2 standalone controls and 6
  unsupported cases.
- 5 unique observable defect patterns across 5 rules. Patterns are deduplicated
  by their failed-rule signature rather than by PDP URL.
- 16 deterministic negative evaluations: 14 paired fixes plus 2 standalone
  healthy controls.
- The eight public PDPs with absent Product JSON-LD are eight cases but one
  reused defect pattern.

Positive coverage gaps remain for page title, visible price and purchase CTA.
WooCommerce #14854 is now unsupported: it reports an intentionally hidden UI
price plus an erroneous structured `0.00`, not the missing visible price that
the old fixture claimed. WooCommerce #25969 now uses a free grouped-product
fixture and a complete paired version.

The deterministic dataset currently reports 100% aggregate precision and
recall. These metrics are not broadly representative: there are only 5 unique
positive defect patterns, only 5 of 8 rules have positive coverage, and the
product-price rule still has no verified positive source.

## Next 10 cases

Prioritize verified sources for:

1. Empty document title on a real PDP.
2. Missing direct purchase path on an in-stock product.
3. Unexplained disabled purchase CTA.
4. Fullscreen overlay blocking the CTA on mobile.
5. Variant gate that never enables Add to cart.
6. Product image rendered too small to identify the item.
7. A second independent HTTP 5xx PDP incident.
8. A second independent missing visible-price incident.
9. Malformed Product JSON-LD from a pinned storefront version.
10. A healthy interactive Add-to-cart negative control.

Do not add these until the source includes reproducible steps or a pinned
affected version.
