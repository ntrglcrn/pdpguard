# PDP Guard benchmark

The executable benchmark complements `docs/calibration.md`: the calibration
matrix keeps live negative controls, while the manifest stores deterministic
fixtures for known defects.

Run it with:

```sh
pnpm benchmark
```

The report prints case totals, supported positive and negative cases,
detected/missed defects, false positives, infrastructure failures, per-rule
TP/FN/FP/TN counts, precision and recall. The command fails when the manifest
is invalid, a rule ID is unknown, a fixture cannot run, or an expected defect
is missed. Live/unsupported cases are reported but excluded from precision and
recall.

## Adding a case

Add one entry to `benchmark/manifest.json` and the smallest HTML needed under
`benchmark/fixtures`. A supported known defect must include a public source,
capture date, local fixture, expected rule/status/severity, business impact and
evidence path. Do not copy a storefront; reproduce only the relevant markup,
style or script.

Use `kind: "negative-control"` only for a specifically labelled healthy
expectation. Use `expected.supported: false` with `unsupportedReason` when the
current rules cannot observe the reported defect. Never change a detector just
to make a fixture pass.

## Current coverage

The first positive set covers page availability, visible price, primary and
broken images, Product JSON-LD, and the opt-in add-to-cart interaction. Empty
titles and broken purchase CTA layout remain gaps because no sufficiently
verified source was added. Field-level Google schema compatibility, UI/schema
price comparison, variation state, and cart persistence are explicitly marked
unsupported.

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
