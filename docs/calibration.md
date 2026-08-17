# PDP calibration matrix

Last checked: 2026-08-17. Viewport: 390 × 844. These are manual labels
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
|  21 | Sephora       | [Givenchy Le Rouge](https://www.sephora.com/product/le-rouge-velvet-matte-lipstick-P517624?skuId=2882207)                                    | HTTP 403 anti-bot response instead of PDP                | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  22 | Sephora       | [MatteTrance lipstick](https://www.sephora.com/product/mattetrance-lipstick-P421813?skuId=2049344)                                           | HTTP 403 anti-bot response instead of PDP                | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  23 | Glossier      | [Boy Brow](https://www.glossier.com/products/boy-brow?variant=43886803222773)                                                                | Direct CTA with an upsell JavaScript hook                | P / P / P / P | P / P / P / P | The scanner is localized to KZT by the storefront.                                 |
|  24 | Glossier      | [Balm Dotcom](https://www.glossier.com/products/balm-dotcom?variant=47223342792949)                                                          | Direct CTA with an upsell JavaScript hook                | P / P / P / P | P / P / P / P | The scanner is localized to KZT by the storefront.                                 |
|  25 | ColourPop     | [I Love It liquid blush](https://colourpop.com/products/i-love-it-liquid-blush?variant=41974383771730)                                       | Direct CTA partly covered by a small edge banner         | P / P / P / P | P / P / P / P | Edge banners remain informational rather than blocking.                            |
|  26 | ColourPop     | [Translucent setting powder](https://colourpop.com/products/translucent?variant=1831016759321)                                               | Direct CTA partly covered by a small edge banner         | P / P / P / P | P / P / P / P | Edge banners remain informational rather than blocking.                            |
|  27 | ASOS          | [Elongated shoulder bag](https://www.asos.com/us/asos-design/asos-design-elongated-shoulder-bag-in-mushroom/prd/210176554)                   | HTTP 403 anti-bot response instead of PDP                | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  28 | ASOS          | [Nike Field General](https://www.asos.com/us/nike/nike-field-general-sneakers-in-white/prd/206955314)                                        | HTTP 403 anti-bot response instead of PDP                | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  29 | adidas        | [Web Boost](https://www.adidas.com/us/web-boost-shoes/HQ4155.html)                                                                           | HTTP 403 response instead of PDP                         | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  30 | adidas        | [ZX 8000](https://www.adidas.com/us/zx-8000-shoes/IG2716.html)                                                                               | HTTP 403 response instead of PDP                         | 1 C           | 1 C           | Stops after page availability; PDP rules are not run.                              |
|  31 | Viled         | [Brunello Cucinelli linen shirt](https://viled.kz/en/item/400178)                                                                            | Direct CTA with app and cookie banners                   | P / P / P / P | P / P / P / P | The banners do not block the primary purchase path.                                |
|  32 | Viled         | [Brunello Cucinelli cotton shorts](https://viled.kz/en/item/400214)                                                                          | Direct CTA with lazy-loaded product images               | P / P / P / P | P / P / P / P | One earlier run missed the image; repeat loaded it at 310 × 310px.                 |
|  33 | Viled         | [Graff Classic necklace](https://viled.kz/item/396335)                                                                                       | Offline-only item with “Оставить заявку” inquiry CTA     | P / P / P / P | P / P / P / P | Inquiry is a valid assisted purchase path; the audit does not click it.            |
|  34 | CDV           | [Ex Nihilo Lust In Paradise](https://cdv.kz/item/406402)                                                                                     | Russian direct CTA                                       | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |
|  35 | CDV           | [Kilian Angels' Share Paradis](https://cdv.kz/item/412490)                                                                                   | Russian direct CTA                                       | P / P / P / W | P / P / P / W | Product JSON-LD is absent.                                                         |

## Gate result

The matrix now covers 35 URLs across 10 stores. The 29 reachable, manually
labelled PDPs produced zero false Critical findings.
The three Allbirds Critical findings are expected because a fullscreen region
gate blocks the purchase path and PDP Guard deliberately does not choose a
region. The six Sephora, ASOS and adidas URLs are access-challenge controls:
each produces one page-availability Critical and no misleading PDP findings.

Known false warnings: the Men's Tree Runner produced one non-critical warning
that was not reproduced as a purchase-flow failure. KazakhYuvelir consistently
lacks parseable Product/ProductGroup JSON-LD, so those warnings are expected.

## Stage 3.1 interaction controls

- [Viled Roberto Coin ring](https://viled.kz/item/392538): “Добавить в корзину”
  produced a visible “Перейти в корзину” confirmation and Passed.
- [Viled Graff Classic necklace](https://viled.kz/item/396335): the inquiry-only
  CTA was explicitly skipped and remained Passed; “Оставить заявку” was not
  clicked.
- [CDV Ex Nihilo Lust In Paradise](https://cdv.kz/item/406402): “Добавить в
  корзину” produced a visible “Перейти в корзину” confirmation and Passed. The
  confirmation appears after more than 5,000 ordinary DOM nodes.
- [KazakhYuvelir Invictus bracelet](https://kazakhyuvelir.kz/product/bracelet-invictus-m064456-0003):
  “Выберите размер” was explicitly skipped and remained Passed; no variant was
  selected.
- [Glossier Boy Brow](https://www.glossier.com/products/boy-brow?variant=43886803222773):
  the fresh protected context twice reported that the selected Add to bag
  control was not actionable, while a normal browser session added the item
  and changed Bag (0) to Bag (1). This remains a known non-critical false
  Warning.
