# Product context

## Problem

Ecommerce teams often discover broken product pages only after shoppers encounter them. Missing purchase controls, prices, images, variants, structured data, or mobile layout failures can make products difficult or impossible to buy.

## Customers

- Ecommerce agencies
- Shopify merchants
- Fashion and beauty stores
- Stores with complex sizes, shades, and variants
- Ecommerce teams with limited QA capacity

## Product value

PDP Guard translates technical checks into plain ecommerce findings: what failed, where it appeared, how severe it may be, the available evidence, and a practical next step. Claims about commercial impact remain cautious rather than treating revenue loss as proven.

## Current scope

Stage 1 audits one user-provided public PDP per run in a mobile browser. It checks page availability, title, product imagery, broken images, visible price, purchase CTA, and Product/ProductGroup JSON-LD, then returns a screenshot and report.

The current implementation has no accounts, persistence, catalog discovery, checkout interaction, third-party integrations, or AI.

## Product constraints

- Deterministic checks remain the default whenever ordinary code can identify a problem.
- Browser scanning is an untrusted network boundary and must retain SSRF controls and bounded execution.
- Findings must show evidence and avoid unsupported revenue claims.
- The audit engine remains separate from UI/HTTP so it can move to an isolated worker later.

## Future direction

The product may grow into catalog monitoring, interaction tests, release comparison, team workflows, Shopify and issue-tracker integrations, and carefully scoped AI assistance after the audit engine proves useful.
