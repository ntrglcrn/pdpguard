# PDP calibration matrix

Last checked: 2026-08-13. Viewport: 390 × 844. These are manual labels
compared with the JSON result and screenshot from the local audit endpoint.
`P` means Passed, `W` Warning and `C` Critical. Expected and actual columns use
the order CTA / price / image / structured data.

|   # | Store         | PDP                                                                                                                                          | Scenario                                                 | Expected      | Actual        | Known limitation                                                                   |
| --: | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------- | ------------- | ---------------------------------------------------------------------------------- |
|   1 | KazakhYuvelir | [Invictus bracelet](https://kazakhyuvelir.kz/product/bracelet-invictus-m064456-0003)                                                         | First-session promo; size gate; many recommendation CTAs | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   2 | KazakhYuvelir | [Zere necklace](https://kazakhyuvelir.kz/product/necklace-zere-544010501293)                                                                 | Size gate after dismissible promo                        | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   3 | KazakhYuvelir | [Invictus pendant 429](https://kazakhyuvelir.kz/product/pendant-invictus-m064429-0004)                                                       | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   4 | KazakhYuvelir | [Invictus ring 447](https://kazakhyuvelir.kz/product/ring-invictus-m064447-0002)                                                             | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   5 | KazakhYuvelir | [Ring 160](https://kazakhyuvelir.kz/product/ring-644010500160)                                                                               | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   6 | KazakhYuvelir | [Earrings 180](https://kazakhyuvelir.kz/product/earrings-1144010500180)                                                                      | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   7 | KazakhYuvelir | [Turquoise ring 274](https://kazakhyuvelir.kz/product/ring-m066274-0002-biriuza)                                                             | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   8 | KazakhYuvelir | [Roza Baglanova ring 111](https://kazakhyuvelir.kz/product/ring-roza-baglanova-biriuza-m065111-0002-biriuza)                                 | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|   9 | KazakhYuvelir | [Pearl ring](https://kazakhyuvelir.kz/product/ring-roza-baglanova-zemcug-kult)                                                               | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  10 | KazakhYuvelir | [Invictus ring 448](https://kazakhyuvelir.kz/product/ring-invictus-m064448-0002)                                                             | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  11 | KazakhYuvelir | [Turquoise bracelet](https://kazakhyuvelir.kz/product/bracelet-roza-baglanova-biriuza)                                                       | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  12 | KazakhYuvelir | [Earring 1767](https://kazakhyuvelir.kz/product/earring-1144010501767)                                                                       | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  13 | KazakhYuvelir | [Turquoise necklace](https://kazakhyuvelir.kz/product/necklace-roza-baglanova-golubaia-biriuza-fianit-m065666-0002-golubaia-biriuza-fianit)  | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  14 | KazakhYuvelir | [Invictus bracelet 510](https://kazakhyuvelir.kz/product/bracelet-invictus-m064510-0004)                                                     | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  15 | KazakhYuvelir | [Invictus earrings 443](https://kazakhyuvelir.kz/product/earrings-invictus-m064443-0002)                                                     | Size gate and recommendations                            | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  16 | Allbirds      | [Men's Tree Runner Go](https://www.allbirds.com/products/mens-tree-runner-go)                                                                | Size gate behind mandatory fullscreen region selector    | C / P / P / P | C / P / P / P | Region selection is intentionally not automated.                                   |
|  17 | Allbirds      | [Men's Tree Runner](https://www.allbirds.com/products/mens-tree-runners)                                                                     | Purchase CTA behind mandatory fullscreen region selector | C / P / P / — | C / P / P / W | One non-critical warning remains; region selection is intentionally not automated. |
|  18 | Allbirds      | [Women's Tree Runner NZ](https://www.allbirds.com/products/womens-tree-runner-nz-mushroom)                                                   | Size gate behind mandatory fullscreen region selector    | C / P / P / P | C / P / P / P | Region selection is intentionally not automated.                                   |
|  19 | IKEA          | [SEKTION base cabinet](https://www.ikea.com/us/en/p/sektion-base-cabinet-p-out-storage-2-drawer-white-maximera-voxtorp-dark-gray-s79307035/) | Visible Add to bag plus hidden responsive duplicates     | P / P / P / P | P / P / P / P | One analytics subrequest was blocked by network policy.                            |
|  20 | IKEA          | [SEKTION high cabinet](https://www.ikea.com/us/en/p/sektion-maximera-hc-w-p-o-func-4drw-1dr-2shlv-white-havstorp-light-gray-s29559672/)      | Visible Add to bag plus hidden responsive duplicates     | P / P / P / P | P / P / P / P | One analytics subrequest was blocked by network policy.                            |
|  21 | Sephora       | [Givenchy Le Rouge](https://www.sephora.com/product/le-rouge-velvet-matte-lipstick-P517624?skuId=2882207)                                    | Anti-bot response instead of PDP                         | Excluded      | 2 C / 3 W     | Not counted in heuristic gate: scanner did not receive the PDP.                    |
|  22 | Sephora       | [MatteTrance lipstick](https://www.sephora.com/product/mattetrance-lipstick-P421813?skuId=2049344)                                           | Anti-bot response instead of PDP                         | Excluded      | 2 C / 3 W     | Not counted in heuristic gate: scanner did not receive the PDP.                    |

## Gate result

The 20 reachable, manually labelled PDPs produced zero false Critical findings.
The three Allbirds Critical findings are expected because a fullscreen region
gate blocks the purchase path and PDP Guard deliberately does not choose a
region. The two Sephora URLs are recorded but excluded because their anti-bot
response prevented PDP inspection.

Known false warnings: the Men's Tree Runner produced one non-critical warning
that was not reproduced as a purchase-flow failure. KazakhYuvelir consistently
lacks parseable Product/ProductGroup JSON-LD, so those warnings are expected.

## Coverage expansion — 2026-08-21

Before this expansion, 15 of the 20 reachable PDPs came from KazakhYuvelir.
The matrix named four storefronts but did not record a confirmed platform, and
it had no explicit live evidence for `page-availability`, `page-title` or
`broken-images`. Sold-out/restock and unavailable-variant states were also not
represented outside the region-gated Allbirds cases.

The three cases below add three storefronts and three confirmed platform
families. AETHER also adds an explicitly confirmed headless architecture.
Platform labels are based on the linked first-party case studies or direct
Magento asset markers; no platform is inferred from appearance alone.

Classification uses `TP` for a correctly reported defect, `TN` for a correct
pass, `FP` for an incorrect finding and `FN` for a missed defect. Live URLs are
manual calibration evidence only and are not benchmark or CI dependencies.

### AETHER Apparel — sold-out/restock state

- **URL:** [Mesa Jacket — Onyx Black](https://aetherapparel.com/products/mesa-jacket-onyx-black)
- **Storefront/platform:** headless Shopify with Next.js and Sanity, confirmed
  by the [Netlify case study](https://www.netlify.com/blog/aether-apparel-shopify-nextjs/)
- **Region/state:** United States, English; every displayed size routes to a
  restock waitlist
- **Checked:** 2026-08-21 at 390 × 844

| ruleId                    | Expected behavior                                       | Actual behavior | Classification | Evidence                                                    |
| ------------------------- | ------------------------------------------------------- | --------------- | -------------- | ----------------------------------------------------------- |
| `page-availability`       | Pass for a reachable PDP                                | Passed          | TN             | HTTP 200 and 3,988 visible text characters                  |
| `page-title`              | Pass for a product-specific title                       | Passed          | TN             | `Mesa Jacket - Onyx Black`                                  |
| `product-image`           | Pass for the visible primary product image              | Passed          | TN             | 390 × 507 rendered image with product-specific alt text     |
| `broken-images`           | Pass when visible images load                           | Passed          | TN             | No visible image had an empty source or zero natural width  |
| `product-price`           | Pass for the visible product price                      | Passed          | TN             | `$350.00`                                                   |
| `purchase-cta`            | Pass because the page exposes an explicit restock state | Passed          | TN             | `SELECT SIZE FOR RESTOCK WAITLIST`; sold-out state detected |
| `structured-product-data` | Pass for complete Product JSON-LD                       | Passed          | TN             | Name, image, offer price and availability were present      |

### Landyachtz — variant selection with unavailable setup

- **URL:** [The Clark](https://landyachtz.com/shop/all/skate/boards/all-skate-boards/the-clark/)
- **Storefront/platform:** WooCommerce, listed in the official
  [WooCommerce showcase](https://woocommerce.com/showcase/)
- **Region/state:** Canada, English; setup variant selector and an unavailable
  selected configuration
- **Checked:** 2026-08-21 at 390 × 844

| ruleId                    | Expected behavior                               | Actual behavior | Classification | Evidence                                                   |
| ------------------------- | ----------------------------------------------- | --------------- | -------------- | ---------------------------------------------------------- |
| `page-availability`       | Pass for a reachable PDP                        | Passed          | TN             | HTTP 200 and 4,820 visible text characters                 |
| `page-title`              | Pass for a product-specific title               | Passed          | TN             | `The Clark • Landyachtz`                                   |
| `product-image`           | Pass for the visible primary product image      | Passed          | TN             | 370 × 370 rendered image; 1,600 × 1,600 natural size       |
| `broken-images`           | Pass when visible images load                   | Passed          | TN             | No visible image had an empty source or zero natural width |
| `product-price`           | Pass for the visible product price              | Passed          | TN             | `$219.99`                                                  |
| `purchase-cta`            | Pass for an explicit unavailable selected setup | Passed          | TN             | Setup controls and `NOTIFY ME WHEN AVAILABLE` were visible |
| `structured-product-data` | Pass for complete Product JSON-LD               | Passed          | TN             | Name, image, offer price and availability were present     |

### Catbird — mandatory region gate and lazy image placeholders

- **URL:** [Petite Coupe Gold Dome Ring](https://www.catbirdnyc.com/petite-coupe-ring.html)
- **Storefront/platform:** Adobe Commerce / Magento; confirmed by the
  [Adobe customer story](https://business.adobe.com/customer-success-stories/catbird-case-study.html)
  and current `/static/version…/frontend/` asset paths in the PDP HTML
- **Region/state:** United States, English; mandatory country/currency gate
  overlays the PDP on first visit
- **Checked:** 2026-08-21 at 390 × 844

| ruleId                    | Expected behavior                                      | Actual behavior                                       | Classification | Evidence                                                                                      |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `page-availability`       | Pass for a reachable PDP                               | Passed                                                | TN             | HTTP 200 and 5,486 visible text characters                                                    |
| `page-title`              | Pass for a product-specific title                      | Passed                                                | TN             | `Petite Coupe Ring, Solid 14k Yellow Gold \| Catbird Jewelry`                                 |
| `product-image`           | Pass for the visible primary product image             | Passed                                                | TN             | 350 × 350 rendered image with product-specific alt text                                       |
| `broken-images`           | Pass because no broken image is visible to the shopper | Warning: two visible images reported with empty `src` | FP             | Product/gallery media render in the screenshot; empty lazy placeholders are counted as broken |
| `product-price`           | Pass for the visible product price                     | Passed                                                | TN             | `$448.00`                                                                                     |
| `purchase-cta`            | Fail while the mandatory region gate blocks purchase   | Critical                                              | TP             | `Add to Bag` was blocked at its center by the country selector                                |
| `structured-product-data` | Pass for complete Product JSON-LD                      | Passed                                                | TN             | Name, image, offer price and availability were present                                        |

**Resolution:** fixed locally on 2026-08-21. The named benchmark case
`broken-images/regression/empty-src-lazy-placeholder` preserves this failure
mode, while `broken-images/positive-control/visible-broken-image` confirms that
a real failed image request is still reported. The table retains the original
live observation; the external page was not added to CI.

## Expanded calibration result

The document now covers seven storefronts in total (six reachable and one
anti-bot-blocked) instead of four. It explicitly records Shopify, Adobe
Commerce / Magento and WooCommerce, plus a headless Shopify/Next.js
architecture. The new cases add sold-out/restock, unavailable selected variant,
mandatory region gate and lazy image placeholder states. Every existing
`ruleId` now has live evidence.

One false positive was confirmed and subsequently fixed: `broken-images` no
longer treats Catbird's empty lazy image placeholders as shopper-visible broken
images. No false negative was found. Local regression coverage now preserves
both the placeholder case and detection of a real broken image.
