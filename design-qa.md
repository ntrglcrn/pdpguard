# Design QA: batch audit detail

- Source visual truth: `/var/folders/47/ssjbjr852fn91cgjbr7q85dw0000gq/T/codex-clipboard-e1004455-d728-4904-9197-425ab7c47a61.png`
- Desktop implementation: `/tmp/pdpguard-batch-table-actions.png` and `/tmp/pdpguard-batch-detail-desktop.png`
- Mobile implementation: `/tmp/pdpguard-batch-detail-mobile.png`
- Viewports: desktop 2048 × 1117 CSS px; mobile 390 × 844 CSS px; device scale factor 1
- Pixels: source 2530 × 1398; desktop capture 1966 × 1117; mobile capture 390 × 844
- State: five completed Viled PDP audits, table action, critical detail report
- Normalization: source was proportionally scaled to 1117 px high for the full-view comparison; focused table crops were independently scaled to 500 px high.

## Evidence

- Full-view comparison: `/tmp/pdpguard-design-comparison.png`
- Focused table comparison: `/tmp/pdpguard-table-focused-comparison.png`
- Typography, spacing, colors, borders, radii, status badges, and copy remain consistent with the source UI.
- The new `View detailed report` action is visually secondary to the PDP link but remains discoverable and keyboard focusable.
- The existing audit report preserves screenshot quality and the established evidence/recommendation layout.
- No horizontal page overflow was present at either viewport.
- Browser interaction confirmed that all five completed rows open their own seven-finding report.

## Iteration history

1. P2: the sticky header covered the report heading after automatic scrolling.
2. Fix: target the report section with an 80 px scroll margin and move keyboard focus into it.
3. Post-fix evidence: the report begins at y=80 on desktop and mobile; title, metadata, counts, findings, and screenshot remain visible and responsive.

No actionable P0, P1, or P2 findings remain. No focused asset comparison was needed because this change introduces no new imagery or icons.

final result: passed
