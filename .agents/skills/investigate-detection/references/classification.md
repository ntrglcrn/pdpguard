# Classification and evidence

## Labels

- True positive: a supported observable defect exists and the rule fails with the intended severity.
- False positive: the page is healthy for the rule's contract but the rule fails.
- False negative: a supported observable defect exists but the rule passes, is absent, or reports a mismatched failure severity.
- True negative: the observable condition is healthy and the rule passes.
- Unsupported: the reported product problem is outside the rule's current observable contract, such as cart persistence after navigation or consumer-specific schema placement.
- Infrastructure error: browser, network guard, timeout, fixture, storage, or execution failure prevents a trustworthy detector result.

An HTTP error or access challenge can itself be a valid `page-availability` finding. Because availability failures intentionally stop later rules, do not label missing downstream findings as FN when no PDP was observable.

## Evidence order

1. Confirm the requested URL, validated/final URL, main response status, redirect count, and whether the page is an access challenge.
2. Use the audit screenshot and returned evidence; never expose screenshot bytes or absolute storage paths in `AuditResult`.
3. Inspect only the DOM signal the rule claims: title, visible text, image geometry/load state, CTA actionability, Product JSON-LD, or add-to-cart confirmation.
4. Compare with the closest browser test, benchmark fixture, and `docs/calibration.md` entry.
5. Repeat a live observation when lazy loading or transient browser state is plausible. Do not call one inconsistent run a detector regression.

For fixes, convert the minimal reproducer into a local regression test. Add benchmark data only when the source and deterministic fixture meet `docs/benchmark.md` requirements.
