# Roadmap

## Stage 2 — Catalog scanning

Sitemap discovery, batch PDP checks, background jobs, PostgreSQL history, result comparison, schedules, concurrency controls, retries, and cancellation.

Current slice: bounded XML sitemap and sitemap-index discovery is available as
a local preview. It follows validated redirects and child sitemaps, reads at
most 10 sitemap files / 5 MB, and returns at most 200 page URLs from origins
that supplied a validated sitemap. It does not start audits automatically.

Category discovery is also available as an initial Stage 2.2 preview. It opens
one public category in the protected mobile browser, scrolls the rendered page,
and returns at most 100 same-origin links matching common PDP path patterns.

Next: calibrate category discovery across real storefronts, then add a small
bounded batch audit. Background jobs and persistence wait until synchronous
batches prove useful and their resource limits are understood.

## Stage 3 — Ecommerce interaction testing

Variant selection, availability behavior, add-to-cart, cart drawer state, PDP/cart price consistency, and platform-specific adapters.

## Stage 4 — Visual regression

Mobile and desktop baselines, screenshot comparison, dynamic-region suppression, review/approval, and duplicate issue grouping.

## Stage 5 — SaaS platform

Authentication, organizations, roles, multiple stores, plans, usage limits, billing, object storage, isolated audit workers, and notifications.

## Stage 6 — Integrations

Shopify app, Jira, Slack, webhooks, exports, agency dashboards, and white-label reporting.

## Stage 7 — AI assistance

Visual issue classification, business-readable explanations, similar-finding grouping, remediation suggestions, and catalog impact estimation. AI will not replace deterministic checks where ordinary code is reliable.
