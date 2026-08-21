# PDP Guard v2.0 — Product Requirements Document

**Status:** Draft
**Date:** 21 August 2026
**Evidence base:** [Jira ecommerce analysis](../jira-ecommerce-analysis.md)
**Product principle:** Observable defect → deterministic check → reproducible evidence → finding.

**Canonical path:** `docs/prd/pdp-guard-v2.md`

## 1. Executive summary

PDP Guard v2.0 expands the current single-URL PDP audit into a deterministic
ecommerce quality system for PDP, PLP, search, cart and checkout surfaces.

Version 2.0 is not a general-purpose test builder and not an AI interface
reviewer. It adds a bounded scenario engine and a small set of evidence-backed
checks for defects repeatedly observed in Jira:

- navigation changes the URL but not the page content;
- price, discount, currency or product identity diverges across UI states;
- variant selection and Add to Cart produce the wrong state;
- filters and overlays are visible but unusable;
- storefront content disagrees with an owned API response;
- cart and checkout totals or available payment methods are inconsistent.

Every new v2 capability below is justified by one or more concrete Jira issues.
Capabilities without Jira evidence are excluded or deferred.

## 2. Background

### 2.1 Current product

PDP Guard v1 audits one public product URL in a mobile Chromium viewport and
returns deterministic findings plus a screenshot. Current stable checks are:

- `page-availability`;
- `page-title`;
- `canonical-url`;
- `robots-indexing`;
- `product-image`;
- `product-image-alt-text`;
- `broken-images`;
- `product-price`;
- `variant-label-integrity`;
- `share-url-integrity`;
- `purchase-cta`;
- `structured-product-data`.

The existing URL audit does not authenticate, scan catalogues, compare
storefront state with API data or expose persisted audit history as a product
surface. A bounded scenario engine now supports validated browser actions and
assertions for local fixtures, but customer scenario configuration and hosted
execution remain future work.

### 2.2 Evidence from Jira

The research reviewed 59 `web` bugs and expanded the search across issues
containing PDP, catalogue, search, cart, checkout, Add to Cart and price terms.
Fifty-four ecommerce-relevant issues were read in detail.

The strongest recurring defect classes were:

1. client-side navigation and stale content;
2. price/currency/discount inconsistency;
3. broken variant and purchase state;
4. PLP/search filter failures;
5. inaccessible overlays and sticky UI;
6. storefront/API inconsistency;
7. cart/checkout calculation and eligibility failures.

## 3. Product vision

PDP Guard should tell an ecommerce team, before customers do, that an
observable purchase journey is broken — and provide enough deterministic
evidence for an engineer to reproduce the defect.

The product should evolve from “audit this PDP” to “verify these bounded,
business-critical storefront scenarios” while preserving explainable rules,
low false-positive rates and safe browser execution.

## 4. Goals

### G1. Detect high-impact PDP regressions beyond initial page load

Support navigation, variant, modal and Add-to-Cart interactions proven useful
by [VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458),
[VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706),
[VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901) and
[VKZ-4914](https://viled.atlassian.net/browse/VKZ-4914).

### G2. Extend deterministic coverage to discovery surfaces

Verify PLP and search price, filter and product-navigation behaviour demonstrated
by [VKZ-7924](https://viled.atlassian.net/browse/VKZ-7924),
[VKZ-10593](https://viled.atlassian.net/browse/VKZ-10593),
[VKZ-10789](https://viled.atlassian.net/browse/VKZ-10789) and
[VKZ-10566](https://viled.atlassian.net/browse/VKZ-10566).

### G3. Verify cross-state commercial consistency

Compare price, currency, selected product and totals only when the compared
states represent the same SKU and price type. Evidence:
[VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144),
[VKZ-3589](https://viled.atlassian.net/browse/VKZ-3589),
[VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571) and
[VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050).

### G4. Produce reproducible, bounded evidence for every failure

Every finding must identify the scenario step, observed values, final URL,
viewport and relevant DOM/network evidence. This is required to diagnose
state-transition bugs such as
[VKZ-10410](https://viled.atlassian.net/browse/VKZ-10410) and
[VKZ-4788](https://viled.atlassian.net/browse/VKZ-4788).

### G5. Preserve the current browser security boundary

New navigation, API and authenticated capabilities must retain URL validation,
redirect validation, request interception, timeouts, bounded evidence and safe
error disclosure.

## 5. Non-goals

The following are not v2.0 requirements:

- AI deciding whether a design is attractive, premium or correctly spaced;
- generic visual regression without an approved baseline;
- automatic interpretation of arbitrary business rules;
- crawling the public web or discovering unbounded URLs;
- destructive production actions, payment submission or order placement;
- mobile-app testing;
- a drag-and-drop universal test framework;
- automatic Jira issue creation;
- replacing accessibility, performance or end-to-end test suites.

The exclusion of generic visual judgement is supported by Jira cases with
insufficient objective expected state:
[VKZ-11417](https://viled.atlassian.net/browse/VKZ-11417),
[VKZ-10520](https://viled.atlassian.net/browse/VKZ-10520),
[VKZ-11119](https://viled.atlassian.net/browse/VKZ-11119) and
[VKZ-10503](https://viled.atlassian.net/browse/VKZ-10503).

## 6. Target users

### Ecommerce QA engineer

Needs repeatable checks for purchase-critical storefront scenarios without
maintaining a full Playwright suite for every merchant.

### Ecommerce engineer

Needs a finding with exact state, URL and evidence that can be reproduced
locally.

### Ecommerce manager or agency

Needs a concise view of whether critical product discovery and purchase paths
work, without unsupported revenue claims.

### Platform administrator

Needs strict control over allowed origins, credentials, API contracts,
concurrency, retention and destructive actions.

## 7. Product principles

1. **Deterministic by default.** AI may explain or group confirmed findings;
   it may not decide whether a rule passed.
2. **One rule, one finding.** A failure must identify one actionable problem.
3. **Explicit expected state.** Product-specific behaviour is configured; it is
   not inferred from visual appearance.
4. **Equivalent-state comparison.** Price and identity comparisons require the
   same SKU, currency and price semantics.
5. **Bounded execution.** Steps, requests, time, redirects, screenshots and
   evidence are limited.
6. **Safe by default.** Scenarios must not submit payments, place orders or
   navigate outside approved origins.
7. **Benchmark before release.** Every shipped rule has positive, negative and
   regression fixtures.

## 8. Scope and release tiers

### v2.0 General Availability

- all v1 single-PDP checks;
- strengthened visible-price validation;
- variant-label integrity;
- bounded anonymous interaction scenarios;
- PDP link/share navigation checks;
- stale product-content detection after navigation;
- keyboard-dismiss and interactive-element reachability checks;
- PLP/search scenarios for filters, product navigation and price presentation;
- locale/currency scenarios that do not require authentication;
- scenario-level findings and bounded evidence.

### v2.0 Controlled Beta

- controlled Add-to-Cart checks;
- authenticated cart/checkout scenarios;
- customer-owned API-to-browser correlation;
- scheduled execution and historical comparison, if the hosted worker and
  persistence security gates are complete.

### Deferred beyond v2.0

- arbitrary visual baselines;
- checkout payment submission;
- order creation in production;
- mobile apps;
- AI-generated pass/fail decisions;
- unbounded catalogue crawling.

## 9. Functional requirements

### FR-1. Preserve all v1 PDP rules

The v2 engine must run all existing stable rules without changing their public
rule IDs or semantics unless a versioned migration and benchmark evidence are
provided.

**Jira justification:**
[VKZ-4190](https://viled.atlassian.net/browse/VKZ-4190) validates the existing
`purchase-cta` check; [VKZ-8540](https://viled.atlassian.net/browse/VKZ-8540)
validates visible-price coverage.

**Acceptance criteria:**

- Existing benchmark positive and negative controls continue to pass.
- Existing `AuditResult` consumers can render v1 findings unchanged.
- A scenario failure never suppresses already-completed v1 findings.

### FR-2. Strengthened visible-price validation

The product must detect when the primary PDP purchase area has no valid price,
contains a zero price in a normally purchasable state or exposes placeholder
text such as `undefined`.

**Jira justification:**
[VKZ-8540](https://viled.atlassian.net/browse/VKZ-8540),
[VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144) and
[VKZ-4951](https://viled.atlassian.net/browse/VKZ-4951).

**Requirements:**

- Reuse the current primary price/PDP anchoring logic.
- Do not treat crossed-out old price, installment amount or delivery price as
  the primary product price.
- A zero price fails only when the product is not explicitly free and is not in
  an unavailable state covered by a documented merchant contract.
- Evidence includes the matched text and nearest purchase-area context.

**Acceptance criteria:**

- `undefined`, `NaN` or an absent formatted price fails.
- A valid non-zero price passes.
- “Free” or zero-priced products require explicit scenario configuration and
  do not fail when configured.

### FR-3. Variant-label integrity

The product must detect duplicate visible labels inside one variant group.

**Jira justification:**
[VKZ-3832](https://viled.atlassian.net/browse/VKZ-3832).

**Requirements:**

- Compare normalized labels only within the same variant selector.
- Ignore hidden templates and disabled duplicate DOM copies.
- Do not enforce size ordering in GA; size-system ordering is merchant-specific,
  as shown by [VKZ-5366](https://viled.atlassian.net/browse/VKZ-5366).
- Evidence identifies the group and repeated labels.

**Acceptance criteria:**

- Two visible selectable options with the same normalized label fail.
- Duplicate text across different variant groups does not fail.
- Hidden responsive clones do not fail.

### FR-4. Bounded deterministic scenario engine

The engine must execute a small declarative sequence of supported browser
actions and assertions.

**Jira justification:**
[VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458),
[VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706),
[VKZ-9803](https://viled.atlassian.net/browse/VKZ-9803),
[VKZ-5364](https://viled.atlassian.net/browse/VKZ-5364) and
[VKZ-6082](https://viled.atlassian.net/browse/VKZ-6082).

**Supported actions:**

- navigate to an approved URL;
- click a uniquely resolved element;
- select a uniquely resolved option;
- fill a non-sensitive field;
- press a keyboard key;
- scroll an element or page;
- go back;
- wait for bounded structural readiness.

**Supported assertions:**

- URL equals or matches an explicit pattern;
- expected visible text/landmark exists;
- error boundary text is absent;
- element becomes visible, hidden, enabled, selected or reachable;
- main-content fingerprint changes after navigation;
- normalized value equals a captured value from an earlier step;
- a bounded matching request occurred with expected method/status/query.

**Restrictions:**

- Maximum 12 steps per scenario in GA.
- No arbitrary JavaScript supplied by a customer.
- No unrestricted CSS/XPath evaluation outside validated locator fields.
- No file uploads, downloads, payment submission or order confirmation.
- Every navigation and request remains subject to URL safety checks.

**Acceptance criteria:**

- A failed step returns one scenario finding with step number and evidence.
- Timeout and selector ambiguity fail safely without exposing raw internals.
- Browser context closes on pass, fail, timeout or cancellation.

### FR-5. PDP navigation and share-link validation

The product must verify that a PDP navigation action opens a usable target and
that a generated share link is a valid approved URL.

**Jira justification:**
[VKZ-9803](https://viled.atlassian.net/browse/VKZ-9803),
[VKZ-3601](https://viled.atlassian.net/browse/VKZ-3601),
[VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458) and
[VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706).

**Requirements:**

- Reject placeholder path segments such as `undefined`, `null` or unresolved
  bracketed identifiers.
- After a click, compare final URL and main-content fingerprint.
- Detect a visible configured error boundary even when HTTP status is 200.
- Support history-back assertions for
  [VKZ-10821](https://viled.atlassian.net/browse/VKZ-10821) and
  [VKZ-11210](https://viled.atlassian.net/browse/VKZ-11210).

**Acceptance criteria:**

- URL change with unchanged source content fails when target content is
  explicitly expected.
- A direct target load passing does not hide a failed client-side transition.
- Evidence contains source URL, clicked locator, final URL and target-state
  assertion.

### FR-6. Product identity after in-app navigation

The product must detect stale PDP content after navigating between products.

**Jira justification:**
[VKZ-4690](https://viled.atlassian.net/browse/VKZ-4690) and
[VKZ-4226](https://viled.atlassian.net/browse/VKZ-4226).

**Requirements:**

- A scenario captures an explicit product identifier before and after the
  action: SKU, product ID, canonical URL, configured DOM value or owned API ID.
- The expected target identifier must be supplied or deterministically derived
  from the clicked link URL.
- Image URL alone is not sufficient product identity.

**Acceptance criteria:**

- New target URL with previous product identifier fails.
- Correct target identifier passes even if layout is unchanged.

### FR-7. Variant and Add-to-Cart consistency

The beta product must verify that selected variant identity and price persist
into the Add-to-Cart confirmation state.

**Jira justification:**
[VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901) and
[VKZ-4914](https://viled.atlassian.net/browse/VKZ-4914).

**Requirements:**

- Capture selected variant, SKU, normalized primary price and currency before
  Add to Cart.
- Click only a configured non-destructive Add-to-Cart control.
- Compare the same fields in the cart confirmation popup or cart response.
- Do not proceed to checkout automatically.
- The test account/cart cleanup strategy must be defined before hosted release.

**Acceptance criteria:**

- Different variant/SKU or equivalent price after Add to Cart fails.
- Tax, delivery and installment values are excluded from primary-price parity.
- Re-running the scenario must not create unbounded cart quantity.

### FR-8. PLP and search audit surface

The product must support explicitly supplied PLP and search URLs with
surface-specific scenarios.

**Jira justification:**
[VKZ-7924](https://viled.atlassian.net/browse/VKZ-7924),
[VKZ-10593](https://viled.atlassian.net/browse/VKZ-10593),
[VKZ-10789](https://viled.atlassian.net/browse/VKZ-10789),
[VKZ-10566](https://viled.atlassian.net/browse/VKZ-10566),
[VKZ-10410](https://viled.atlassian.net/browse/VKZ-10410) and
[VKZ-9090](https://viled.atlassian.net/browse/VKZ-9090).

**Requirements:**

- Accept only bounded user-supplied URLs; v2.0 does not crawl the catalogue.
- Identify configured product-card containers.
- Support filter apply/reset scenarios and before/after state capture.
- Support expected query/context assertions such as `gender=women`.
- Detect placeholder price/currency text in filters and cards.
- Discount parity requires an owned API field contract or explicit DOM
  old/current-price semantics.

**Acceptance criteria:**

- Resetting filters clears selected state and expected URL/query state.
- A configured filter action that sends no expected request and changes no
  result state fails.
- A discounted product with an explicit `oldPrice > price` contract fails when
  old price is absent from its corresponding card.

### FR-9. Locale and currency scenarios

The product must run configured PDP/PLP scenarios across a bounded set of
locale/currency combinations.

**Jira justification:**
[VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144),
[VKZ-3589](https://viled.atlassian.net/browse/VKZ-3589),
[VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571),
[VKZ-10637](https://viled.atlassian.net/browse/VKZ-10637) and
[VKZ-3321](https://viled.atlassian.net/browse/VKZ-3321).

**Requirements:**

- Maximum three locale/currency combinations per scenario in GA.
- Locale/currency is set through an explicit URL, header or configured UI
  action; PDP Guard must not guess the merchant mechanism.
- Check that configured content changes and that primary price remains valid.
- Cross-currency numerical conversion is out of scope unless the customer
  supplies an owned expected value or rate contract.

**Acceptance criteria:**

- A locale switch that leaves a zero/undefined price fails.
- A configured translated field that remains absent fails.
- The finding identifies locale, currency and state transition.

### FR-10. Interactive reachability and keyboard dismissal

The product must verify that configured controls remain reachable and modal
dialogs support their declared keyboard dismissal behaviour.

**Jira justification:**
[VKZ-10509](https://viled.atlassian.net/browse/VKZ-10509),
[VKZ-10668](https://viled.atlassian.net/browse/VKZ-10668),
[VKZ-11416](https://viled.atlassian.net/browse/VKZ-11416) and
[VKZ-6082](https://viled.atlassian.net/browse/VKZ-6082).

**Requirements:**

- Use bounding boxes, computed overflow, scroll range and `elementFromPoint`.
- A descendant passes if it can be brought into view through a valid scroll
  container and is not occluded at its actionable point.
- Sticky-header behaviour is asserted only when the scenario declares the
  expected landmark.
- Escape dismissal is asserted only for a configured modal/dialog.

**Acceptance criteria:**

- A filter option that cannot be scrolled into view fails with box/overflow
  evidence.
- An intentionally auto-hiding header does not fail without an expectation.
- An open configured modal still visible after Escape fails.

### FR-11. Customer-owned API-to-browser correlation

The beta product must support comparing a bounded, explicitly configured API
response with storefront DOM state.

**Jira justification:**
[VKZ-10664](https://viled.atlassian.net/browse/VKZ-10664),
[VKZ-10640](https://viled.atlassian.net/browse/VKZ-10640),
[VKZ-10637](https://viled.atlassian.net/browse/VKZ-10637),
[VKZ-7082](https://viled.atlassian.net/browse/VKZ-7082) and
[VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571).

**Requirements:**

- Only customer-approved origins and response fields may be inspected.
- JSON extraction uses a bounded declarative path; no customer JavaScript.
- Secrets never appear in findings, screenshots or client-visible logs.
- Raw response bodies are not persisted as audit evidence.
- A comparison maps one API value to one explicit DOM target and semantic type.

**Acceptance criteria:**

- `isVisible=true` plus an absent configured storefront section fails.
- A configured media/product identifier mismatch fails.
- Unavailable or malformed API data produces an incomplete scenario, not a
  false storefront defect.

### FR-12. Controlled cart and checkout scenarios

The beta product must verify cart and checkout state without submitting a
payment or placing an order.

**Jira justification:**
[VKZ-7417](https://viled.atlassian.net/browse/VKZ-7417),
[VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050),
[VKZ-4788](https://viled.atlassian.net/browse/VKZ-4788),
[VKZ-11118](https://viled.atlassian.net/browse/VKZ-11118) and
[VKZ-10436](https://viled.atlassian.net/browse/VKZ-10436).

**Requirements:**

- Use an isolated customer-provided test account and test product state.
- Stop before final order confirmation or any payment-provider transition.
- Support item subtotal, discount, delivery fee and displayed total assertions.
- Support enabled/disabled payment-method assertions using explicit expected
  eligibility inputs.
- Support cart navigation and variant-change actions.
- Clean or restore cart state after the scenario where the storefront permits
  a safe deterministic cleanup.

**Acceptance criteria:**

- Switching delivery from paid courier to free pickup recalculates the total.
- Payment eligibility can compare the configured discounted total rather than
  an unrelated old price.
- A cleanup failure is reported separately and does not erase the test result.
- No scenario can reach an order-submit or payment-submit action.

### FR-13. Scenario findings and evidence

Every scenario produces one finding per asserted problem, consistent with the
existing `Finding` contract.

**Jira justification:** state-transition defects such as
[VKZ-10410](https://viled.atlassian.net/browse/VKZ-10410),
[VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901) and
[VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050) require before/after
evidence to be actionable.

**Required evidence fields:**

- scenario and rule ID;
- failed step and assertion;
- source and final URL, sanitized;
- viewport and locale/currency context;
- expected and observed bounded values;
- relevant request method, host, path, status and allowed query keys;
- screenshot reference, never bytes or absolute filesystem paths.

**Acceptance criteria:**

- Secrets, cookies, authorization headers and raw bodies never enter a finding.
- Evidence strings and counts are bounded.
- A user can reproduce the failure from the report without inspecting internal
  worker logs.

## 10. User experience

### 10.1 Configure

The user selects a surface (`PDP`, `PLP`, `search`, `cart`, `checkout`) and
provides an approved start URL. For a scenario, the user chooses from supported
actions/assertions and supplies explicit locators and expected values.

The UI must show whether a capability is:

- available for anonymous execution;
- beta and requires a test session;
- blocked because an origin or destructive action is not allowed.

### 10.2 Run

The run displays status, current scenario and elapsed time. It must not stream
raw browser logs, credentials or response bodies.

### 10.3 Review

The report groups findings by surface and scenario. Each failure shows:

1. what was expected;
2. what was observed;
3. the exact scenario step;
4. bounded evidence and screenshot;
5. a practical recommendation.

AI may generate a plain-language explanation or group duplicate findings only
after deterministic status is final.

## 11. Domain and data requirements

The existing `Finding` remains the atomic result. v2 requires versioned
scenario context around findings, not a replacement for the rule contract.

Minimum new concepts:

- **Surface:** PDP, PLP, search, cart or checkout.
- **Scenario:** versioned ordered steps plus limits and approved origins.
- **Scenario run:** execution status and sanitized environment metadata.
- **Captured value:** bounded typed value used for a later assertion.
- **API contract:** approved origin and explicitly allowed JSON paths.
- **Session reference:** encrypted secret reference; never raw credentials in
  scenario or result.

The exact storage schema is an implementation decision. Do not introduce
plugin/factory layers before a second implementation requires them.

## 12. Non-functional requirements

### Reliability

- Deterministic result for the same controlled fixture and scenario version.
- Each shipped rule has positive, negative and regression benchmark cases.
- Scenario retries are off by default; infrastructure retry must not duplicate
  user actions.
- Readiness is bounded and must distinguish incomplete execution from a
  confirmed defect.

### Performance and resource bounds

- Anonymous GA scenario: maximum 12 steps and 90 seconds.
- Initial navigation retains the current navigation timeout unless explicitly
  revised through benchmark evidence.
- Limit request count, response bytes, captured values, console errors and
  screenshots per run.
- Close browser/context in `finally` on all terminal paths.

### Accessibility

- Scenario configuration and reports are keyboard accessible.
- Failure state is not communicated by colour alone.
- Keyboard/modal rules use DOM/ARIA and observed interaction, not screenshot
  interpretation.

### Compatibility

- Current rule IDs and `Finding` semantics remain stable.
- Scenario and rule versions are recorded for historical comparison.
- Existing v1 URL audit remains a valid v2 run mode.

## 13. Security and privacy requirements

### Browser boundary

- Preserve HTTP(S)-only URL parsing, credential rejection, DNS/private/reserved
  address blocking, redirect revalidation and request interception.
- Revalidate every scenario navigation and API origin.
- Block service workers and uncontrolled persistent browser state unless a
  reviewed capability explicitly requires otherwise.
- Hosted browser execution must run in isolated workers before beta auth/API
  features are enabled.

### Authenticated sessions

- Credentials are stored only through a dedicated encrypted secret mechanism.
- Findings, screenshots and logs must not contain passwords, tokens, cookies or
  personal address data.
- Session access is workspace-scoped and audited.
- Each run uses a fresh browser context populated from an approved session
  reference.

### Destructive-action prevention

- Order submission, payment initiation, refund, account deletion and arbitrary
  form submission are prohibited actions.
- The scenario engine uses an allowlist of action types and configurable blocked
  labels/routes.
- Add-to-Cart is permitted only for configured test data and bounded quantity.

### API correlation

- API origins are explicit and customer-owned.
- Redirects and every request remain inside the approved origin policy.
- Persist only selected, bounded values — never raw bodies.

### Data retention

- Retention applies to scenario definitions, runs, findings, screenshots and
  secret references separately.
- Deletion must remove owned artifacts without exposing filesystem paths.

## 14. Prioritization

| Priority | Capability                            | Jira evidence                   | Release  |
| -------- | ------------------------------------- | ------------------------------- | -------- |
| P0       | Preserve v1 PDP rules                 | VKZ-4190, VKZ-8540              | GA       |
| P0       | Bounded scenario engine               | VKZ-11458, VKZ-10706, VKZ-9803  | GA       |
| P0       | PDP navigation/content assertion      | VKZ-11458, VKZ-10706            | GA       |
| P0       | Strengthened invalid-price detection  | VKZ-8540, VKZ-4144              | GA       |
| P1       | Variant-label integrity               | VKZ-3832                        | GA       |
| P1       | Product identity after navigation     | VKZ-4690, VKZ-4226              | GA       |
| P1       | PLP/search filter and price scenarios | VKZ-7924, VKZ-10593, VKZ-10789  | GA       |
| P1       | Reachability and Escape dismissal     | VKZ-10509, VKZ-10668, VKZ-6082  | GA       |
| P1       | Locale/currency scenarios             | VKZ-4144, VKZ-3589, VKZ-8571    | GA       |
| P1       | Variant/Add-to-Cart parity            | VKZ-9901, VKZ-4914              | Beta     |
| P1       | Controlled checkout totals            | VKZ-5050, VKZ-4788              | Beta     |
| P2       | API-to-browser correlation            | VKZ-10664, VKZ-10640, VKZ-10637 | Beta     |
| Later    | Generic visual baseline               | VKZ-11417, VKZ-10520, VKZ-11119 | Deferred |

## 15. Success metrics

### Product quality

- Every GA rule has positive, negative and regression benchmark cases.
- False-positive rate below 5% on the approved calibration corpus.
- At least 90% of failed scenario findings contain sufficient evidence to
  reproduce without internal worker logs.
- Zero pass/fail decisions generated solely by AI.

### Coverage

- v2 can deterministically represent the reproduction steps of at least 70% of
  the A/B Jira examples in the evidence report.
- GA covers PDP navigation, PLP/search filter state and anonymous locale flows.
- Beta covers the documented Add-to-Cart and checkout examples without order
  submission.

### Reliability and safety

- At least 99% of completed controlled-fixture runs close their browser context
  and return a terminal status within the configured deadline.
- Zero stored secrets in findings, screenshots metadata or client-visible logs.
- Zero scenario executions reaching prohibited payment/order actions.

These are release targets, not claims about production performance before
measurement.

## 16. Rollout plan

### Phase 1 — Rule hardening

- Strengthen visible-price detection.
- Add variant-label duplicate fixtures/rule.
- Add placeholder/share-link validation.
- Extend benchmark coverage without changing existing rule semantics.

**Exit gate:** rule benchmarks pass and false positives are reviewed on a small
real-world PDP corpus.

### Phase 2 — Anonymous scenario engine

- Implement validated action/assertion schema.
- Add navigation, content fingerprint, modal Escape and reachability scenarios.
- Add scenario findings and evidence.

**Exit gate:** all actions remain bounded, URL-safe and reproducible on local
fixtures; security review covers SSRF, resource exhaustion and error disclosure.

### Phase 3 — PLP/search and locale

- Add explicit PLP/search surface configuration.
- Add filter apply/reset, result state and price presentation assertions.
- Add bounded locale/currency matrix.

**Exit gate:** benchmark includes the Jira-backed failure patterns and approved
negative controls for legitimate unchanged states.

### Phase 4 — Controlled beta

- Add isolated test sessions.
- Add variant/Add-to-Cart consistency.
- Add cart/checkout totals and payment eligibility without submission.
- Add customer-owned API correlation.

**Exit gate:** isolated hosted workers, secret storage, authorization, cleanup,
retention and prohibited-action controls are complete.

## 17. Release acceptance criteria

PDP Guard v2.0 GA is ready when:

1. all v1 checks and public rule IDs remain compatible;
2. anonymous scenario actions/assertions are validated and bounded;
3. navigation regressions represented by VKZ-11458 and VKZ-10706 are detected
   by committed fixtures;
4. invalid-price cases represented by VKZ-8540 and VKZ-4144 are covered without
   treating legitimate free/unavailable states as defects;
5. duplicate variant labels represented by VKZ-3832 are detected with negative
   controls for separate groups and hidden clones;
6. modal/reachability cases represented by VKZ-6082 and VKZ-10509 are covered;
7. PLP/search scenarios cover filter reset and discount presentation patterns
   from VKZ-10789 and VKZ-7924;
8. every failed scenario produces sanitized, bounded, reproducible evidence;
9. lint, typecheck, unit/browser tests, benchmark and production build pass;
10. SSRF, redirect, path traversal, resource exhaustion and error disclosure
    reviews have no unresolved release blockers.

Beta capabilities are not a prerequisite for GA and must remain disabled until
their security exit gate passes.

## 18. Risks and mitigations

| Risk                                                       | Impact                    | Mitigation                                                                         |
| ---------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Merchant-specific selectors make scenarios brittle         | False failures            | Explicit versioned selectors, uniqueness validation and fixture calibration        |
| Price comparisons mix different semantics                  | False critical findings   | Compare same SKU/currency/price type only                                          |
| Dynamic content creates noisy fingerprints                 | False navigation failures | Fingerprint configured stable landmarks, not full HTML                             |
| Auth sessions leak customer data                           | Security/privacy incident | Encrypted references, fresh contexts, redaction and workspace authorization        |
| Scenario actions change production data                    | Customer harm             | Allowlisted actions, prohibited routes/labels, test data and no submit actions     |
| API correlation becomes an arbitrary integration framework | Complexity/security cost  | One declarative JSON extraction model and approved origins only                    |
| Visual checks become subjective                            | Loss of trust             | Require explicit semantic assertion or approved baseline; otherwise D/out of scope |
| Expanded surfaces cause unbounded crawl/load               | Resource exhaustion       | Supplied URL lists, strict per-run limits and no automatic crawling                |

## 19. Dependencies

- Existing deterministic `AuditRule` and `Finding` contracts.
- Executable benchmark and browser fixtures.
- URL-safety and screenshot-storage trust boundaries.
- Isolated hosted workers before authenticated/API beta.
- Workspace authorization, durable run state and protected artifact storage for
  hosted execution.

## 20. Open product decisions

These decisions require customer or implementation evidence before beta; they
must not be guessed:

1. Which merchant-defined selectors/attributes identify SKU, price type and
   variant groups reliably?
2. Which test products and accounts are safe for repeated Add-to-Cart runs?
3. What cart cleanup operation is deterministic and non-destructive per store?
4. Which API origins and JSON fields are customer-owned and approved?
5. Which locale/currency combinations are commercially required per store?
6. Which headers or controls are expected to be sticky rather than auto-hide?
7. What retention period is required for authenticated screenshots and run
   evidence?

None of these open decisions blocks the anonymous GA scope.

## 21. Jira traceability matrix

| Capability                                       | Jira issues                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing purchase CTA audit                      | [VKZ-4190](https://viled.atlassian.net/browse/VKZ-4190)                                                                                                                                                                                                                                                                                                      |
| Invalid/zero/placeholder price                   | [VKZ-8540](https://viled.atlassian.net/browse/VKZ-8540), [VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144), [VKZ-4951](https://viled.atlassian.net/browse/VKZ-4951)                                                                                                                                                                                    |
| Duplicate variant labels                         | [VKZ-3832](https://viled.atlassian.net/browse/VKZ-3832)                                                                                                                                                                                                                                                                                                      |
| PDP/share URL validation                         | [VKZ-9803](https://viled.atlassian.net/browse/VKZ-9803), [VKZ-3601](https://viled.atlassian.net/browse/VKZ-3601)                                                                                                                                                                                                                                             |
| Client navigation/content transition             | [VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458), [VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706), [VKZ-10821](https://viled.atlassian.net/browse/VKZ-10821), [VKZ-11210](https://viled.atlassian.net/browse/VKZ-11210)                                                                                                                   |
| Product identity after recommendation navigation | [VKZ-4690](https://viled.atlassian.net/browse/VKZ-4690), [VKZ-4226](https://viled.atlassian.net/browse/VKZ-4226)                                                                                                                                                                                                                                             |
| Variant/Add-to-Cart parity                       | [VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901), [VKZ-4914](https://viled.atlassian.net/browse/VKZ-4914)                                                                                                                                                                                                                                             |
| PLP/search filters and pricing                   | [VKZ-7924](https://viled.atlassian.net/browse/VKZ-7924), [VKZ-10593](https://viled.atlassian.net/browse/VKZ-10593), [VKZ-10789](https://viled.atlassian.net/browse/VKZ-10789), [VKZ-10566](https://viled.atlassian.net/browse/VKZ-10566), [VKZ-10410](https://viled.atlassian.net/browse/VKZ-10410), [VKZ-9090](https://viled.atlassian.net/browse/VKZ-9090) |
| Locale/currency state                            | [VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144), [VKZ-3589](https://viled.atlassian.net/browse/VKZ-3589), [VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571), [VKZ-10637](https://viled.atlassian.net/browse/VKZ-10637), [VKZ-3321](https://viled.atlassian.net/browse/VKZ-3321)                                                                |
| Reachability/sticky/keyboard behaviour           | [VKZ-10509](https://viled.atlassian.net/browse/VKZ-10509), [VKZ-10668](https://viled.atlassian.net/browse/VKZ-10668), [VKZ-11416](https://viled.atlassian.net/browse/VKZ-11416), [VKZ-6082](https://viled.atlassian.net/browse/VKZ-6082)                                                                                                                     |
| API-to-storefront parity                         | [VKZ-10664](https://viled.atlassian.net/browse/VKZ-10664), [VKZ-10640](https://viled.atlassian.net/browse/VKZ-10640), [VKZ-10637](https://viled.atlassian.net/browse/VKZ-10637), [VKZ-7082](https://viled.atlassian.net/browse/VKZ-7082), [VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571)                                                            |
| Cart/checkout consistency                        | [VKZ-7417](https://viled.atlassian.net/browse/VKZ-7417), [VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050), [VKZ-4788](https://viled.atlassian.net/browse/VKZ-4788), [VKZ-11118](https://viled.atlassian.net/browse/VKZ-11118), [VKZ-10436](https://viled.atlassian.net/browse/VKZ-10436)                                                              |
| Human-only/deferred visual judgement             | [VKZ-11417](https://viled.atlassian.net/browse/VKZ-11417), [VKZ-10520](https://viled.atlassian.net/browse/VKZ-10520), [VKZ-11119](https://viled.atlassian.net/browse/VKZ-11119), [VKZ-10503](https://viled.atlassian.net/browse/VKZ-10503)                                                                                                                   |
