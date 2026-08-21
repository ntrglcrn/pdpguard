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

Stage 1 audits one user-provided public PDP per run in a mobile browser. It checks page availability, title, canonical URL, robots indexing directives, product imagery, broken images, visible price, purchase CTA, and Product/ProductGroup JSON-LD, then returns a screenshot and report.

The `robots-indexing` check follows [Google Search's documented HTML behavior](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag): it combines applicable `robots` and `googlebot` meta directives with the final HTML response's `X-Robots-Tag` values, treats `none` as `noindex, nofollow`, and applies the more restrictive directive when documented rules conflict. It does not inspect `robots.txt`, Search Console, crawl budget, actual index status, or the reason a store declares `noindex`.

The `structured-product-data` check validates the minimum offer structure relevant to a purchasable PDP. Under [Google merchant listing requirements](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing), a supported `Offer` needs an active `price` and a `priceCurrency` at the same level, or the same pair inside `priceSpecification`; `availability` is recommended, so its absence remains a passing informational result. [Product snippet](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) `AggregateOffer` is handled separately through required `lowPrice` and `priceCurrency`, and is not treated as a variant collection. [ProductGroup variants](https://developers.google.com/search/docs/appearance/structured-data/product-variants) are evaluated through their nested `Product` offers. `OfferShippingDetails` is shipping metadata, not an offer to sell the product.

Known limitations: the check reads JSON-LD only, does not resolve cross-block `@id` references, validate ISO currency membership, compare structured and visible prices, verify inventory, interact with variants, or predict Google eligibility. When several applicable offers exist, one complete price/currency pair is sufficient; incomplete sibling offers do not create a warning without evidence that they represent the selected PDP state.

The current implementation has no accounts, persistence, catalog discovery, checkout interaction, third-party integrations, or AI.

## Product constraints

- Deterministic checks remain the default whenever ordinary code can identify a problem.
- Browser scanning is an untrusted network boundary and must retain SSRF controls and bounded execution.
- Findings must show evidence and avoid unsupported revenue claims.
- The audit engine remains separate from UI/HTTP so it can move to an isolated worker later.

## Future direction

The product may grow into catalog monitoring, interaction tests, release comparison, team workflows, Shopify and issue-tracker integrations, and carefully scoped AI assistance after the audit engine proves useful.
