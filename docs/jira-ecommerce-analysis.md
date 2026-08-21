# Jira-анализ ecommerce defects для PDP Guard

Дата исследования: 21 августа 2026.

## Методика и границы

Исследование read-only: Jira и код PDP Guard не изменялись.

Первоначальный запрос `labels = bag` вернул ноль задач. Эталонный тикет
[VKZ-10973](https://viled.atlassian.net/browse/VKZ-10973) показал, что
«баг» — это issue type `Баг`, а его label — `web`. Базовая выборка:

```jql
project = VKZ AND issuetype in (Баг, Bug) AND labels = web ORDER BY created DESC
```

Она содержит 59 задач. Чтобы не потерять storefront defects с labels
`backend`, `checkout` или без labels, дополнительно полностью просмотрены
текстовые выдачи по `карточка товара` (97), `каталог` (139, две страницы),
`поиск` (48), `корзина` (58), `чекаут`/`checkout` (40), `добавить в корзину`
(60) и `цена` (78). Числа пересекаются: один issue может попадать в несколько
выдач; это не число уникальных дефектов.

Классификация использует одну основную категорию:

- **A** — текущий PDP Guard уже имеет достаточный deterministic check.
- **B** — новый rule возможен без новой product surface.
- **C** — нужна platform capability: interaction flow, PLP/search/cart/checkout,
  auth, locale, API correlation или baseline.
- **D** — human/design judgement или недостаточно objective acceptance criteria.
- **E** — не относится к ecommerce customer surface.

## Executive summary

Детально прочитаны 54 ecommerce-relevant issue: 24 из label `web` выборки и
30 дополнительных PDP/PLP/cart/checkout задач. Основные повторяющиеся классы:

1. navigation и client-side state не меняют контент либо ведут не туда;
2. цена, скидка и валюта расходятся между PDP, PLP, popup, рекомендациями и
   checkout;
3. variant, Add to Cart и purchase-state не соответствуют выбранному товару;
4. опубликованные API/CMS данные не доходят до storefront;
5. filters, overlays и sticky UI делают часть интерфейса недоступной.

**Подтверждённое текущее A-покрытие:** отсутствие CTA и отсутствие
currency-formatted цены на публичной PDP. Примеры —
[VKZ-4190](https://viled.atlassian.net/browse/VKZ-4190) и
[VKZ-8540](https://viled.atlassian.net/browse/VKZ-8540).

Большая часть ценных дефектов — категория C. Это не недостаток существующих
rules: Stage 1 намеренно аудирует один публичный PDP URL без auth, catalogue
discovery и interaction flows.

## Current PDP Guard coverage

Текущий engine проверяет `page-availability`, `page-title`, `canonical-url`,
`robots-indexing`, `product-image`, `product-image-alt-text`, `broken-images`,
`product-price`, `variant-label-integrity`, `share-url-integrity`,
`purchase-cta` и `structured-product-data`.

Ниже classification фиксирует исходное исследование; после него добавлен
bounded scenario engine, но customer-configured surface scenarios ещё не
shipped.

| Jira pattern                                                    | Jira examples                                                                                                        | Existing PDP Guard check                      | Coverage                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Нет «Добавить в корзину» на PDP                                 | [VKZ-4190](https://viled.atlassian.net/browse/VKZ-4190)                                                              | `purchase-cta`                                | A                                                |
| Нет корректной видимой цены                                     | [VKZ-8540](https://viled.atlassian.net/browse/VKZ-8540)                                                              | `product-price`                               | A, если итоговый DOM не содержит formatted price |
| Client navigation меняет URL без обновления контента            | [VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458), [VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706) | `page-availability` только для начального URL | Нет                                              |
| Цена/товар после Add to Cart не соответствует выбранной variant | [VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901), [VKZ-4914](https://viled.atlassian.net/browse/VKZ-4914)     | Нет                                           | Нет                                              |
| Discount price не отображён на PLP/search                       | [VKZ-7924](https://viled.atlassian.net/browse/VKZ-7924), [VKZ-10593](https://viled.atlassian.net/browse/VKZ-10593)   | `product-price` только на PDP                 | Нет                                              |
| CMS/API data не рендерятся на storefront                        | [VKZ-10664](https://viled.atlassian.net/browse/VKZ-10664), [VKZ-10640](https://viled.atlassian.net/browse/VKZ-10640) | Image rules без API contract                  | Нет                                              |
| Checkout total/payment state неверны                            | [VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050), [VKZ-4788](https://viled.atlassian.net/browse/VKZ-4788)     | Нет                                           | Нет                                              |

## Taxonomy

| Category                  | Основная категория | Примеры                                             | Detector / required context                                             |
| ------------------------- | ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| PDP purchase path         | A/C                | VKZ-4190, VKZ-9901, VKZ-4914                        | CTA DOM сейчас; variant + Add-to-Cart state в будущем                   |
| PDP price/currency        | A/B/C              | VKZ-8540, VKZ-4144, VKZ-3589, VKZ-8571              | visible price; затем locale/action и cross-surface assertions           |
| Variants                  | B/C                | VKZ-3832, VKZ-5366, VKZ-9901                        | repeated visible labels; selection-state and price parity               |
| PDP media/recommendations | C/D                | VKZ-4690, VKZ-4226, VKZ-4951, VKZ-8333              | navigation identity/API data; screenshots alone are D                   |
| PDP links/content         | B/C                | VKZ-3601, VKZ-9803, VKZ-9811, VKZ-3321, VKZ-3292    | URL validation/share navigation; locale/content contract                |
| PLP/search/filter         | C                  | VKZ-10789, VKZ-10509, VKZ-10566, VKZ-7924, VKZ-9090 | declarative actions plus URL/network/result state                       |
| Layout/reachability       | B/D                | VKZ-10509, VKZ-10668, VKZ-11416, VKZ-11417          | boxes, overflow, `elementFromPoint`, scroll; vague smoothness remains D |
| Cart/checkout             | C                  | VKZ-7417, VKZ-5050, VKZ-4788, VKZ-11118             | authenticated cart, controlled product and delivery/payment state       |
| Shop-in-Shop/CMS parity   | C                  | VKZ-10664, VKZ-10640, VKZ-10637                     | owned API response correlated with DOM and locale                       |

## Repeating defect patterns

### 1. Content does not follow navigation state

Evidence: [VKZ-11458](https://viled.atlassian.net/browse/VKZ-11458),
[VKZ-10706](https://viled.atlassian.net/browse/VKZ-10706),
[VKZ-10821](https://viled.atlassian.net/browse/VKZ-10821),
[VKZ-11210](https://viled.atlassian.net/browse/VKZ-11210).

- Observed defect: URL changes but error page, previous content or wrong history
  destination remains visible.
- Observable evidence: click target, final URL, main-landmark text/hash before
  and after, visible error boundary, `goBack()` destination.
- Detection: configured browser scenario with explicit expected route and
  target landmark.
- False-positive risk: legitimate same-content route or A/B test.
- Required context: source URL, interaction target and expected destination.
- Category: C.

### 2. Price, discount and currency parity breaks across surfaces

Evidence: [VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901),
[VKZ-4914](https://viled.atlassian.net/browse/VKZ-4914),
[VKZ-4144](https://viled.atlassian.net/browse/VKZ-4144),
[VKZ-3589](https://viled.atlassian.net/browse/VKZ-3589),
[VKZ-8571](https://viled.atlassian.net/browse/VKZ-8571),
[VKZ-7924](https://viled.atlassian.net/browse/VKZ-7924),
[VKZ-10593](https://viled.atlassian.net/browse/VKZ-10593),
[VKZ-5050](https://viled.atlassian.net/browse/VKZ-5050).

- Observed defect: selected product/variant price differs in popup, PLP,
  recommendation or checkout; discount/locale value disappears or is zero.
- Observable evidence: normalized money value, currency, selected SKU, API
  payload and visible text before/after interaction.
- Detection: compare only values that represent the same SKU and state; use
  an owned API response where DOM alone cannot establish the expected value.
- False-positive risk: tax, delivery and installment prices can be validly
  different; compare equivalent price types only.
- Required context: product state, locale/currency, selected variant and, for
  checkout, controlled cart/delivery/payment state.
- Category: C; a `visible zero/undefined price` rule is B after calibration.

### 3. Variant state is broken or ambiguous

Evidence: [VKZ-3832](https://viled.atlassian.net/browse/VKZ-3832),
[VKZ-5366](https://viled.atlassian.net/browse/VKZ-5366),
[VKZ-9901](https://viled.atlassian.net/browse/VKZ-9901).

- Observed defect: duplicate or misordered size labels; selected size does not
  determine popup/cart price.
- Evidence: visible option text, ARIA selected state, selected SKU and price.
- Detector: duplicate normalized labels is a B candidate; ordering and
  semantics require a size-system contract, so are C.
- False-positive risk: duplicate labels may be legitimate when width, fit or
  regional system distinguishes them.

### 4. Published storefront data fails to render

Evidence: [VKZ-10664](https://viled.atlassian.net/browse/VKZ-10664),
[VKZ-10640](https://viled.atlassian.net/browse/VKZ-10640),
[VKZ-10637](https://viled.atlassian.net/browse/VKZ-10637),
[VKZ-7082](https://viled.atlassian.net/browse/VKZ-7082).

- Evidence: API reports a visible section/image/localized content, but DOM has
  no matching section.
- Detector: bounded API snapshot plus DOM assertion after a configured publish
  state.
- False-positive risk: rollout, experiment, targeting or locale fallback.
- Required context: owned API contract, tenant, locale and expected section.
- Category: C.

### 5. Controls are visible but unusable

Evidence: [VKZ-10509](https://viled.atlassian.net/browse/VKZ-10509),
[VKZ-10668](https://viled.atlassian.net/browse/VKZ-10668),
[VKZ-11416](https://viled.atlassian.net/browse/VKZ-11416),
[VKZ-6082](https://viled.atlassian.net/browse/VKZ-6082).

- Evidence: open panel’s descendants lie beyond the scrollable viewport,
  center point is covered, expected sticky landmark leaves viewport, or Escape
  leaves dialog open.
- Detector: DOM boxes, overflow ancestry, scroll range, `elementFromPoint`,
  keyboard event and dialog visibility.
- False-positive risk: intentional auto-hiding header or alternate dismiss
  policy; make expected behavior scenario-specific.
- Category: B, except visual “jitter” without a numerical threshold, which is D.

## Best new deterministic rules

| Priority | Proposed rule                                           | Jira evidence        | Detection signal                                                       | Complexity | FP risk                             |
| -------- | ------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- | ---------- | ----------------------------------- |
| P0       | `pdp-visible-price` calibration for zero/undefined text | VKZ-8540, VKZ-4144   | formatted price absent, zero or `undefined` near purchase controls     | Low        | Low–medium                          |
| P0       | `pdp-variant-label-duplicates`                          | VKZ-3832             | repeated normalized visible variant labels in the same selector        | Low        | Medium                              |
| P1       | `pdp-share-link-valid`                                  | VKZ-9803, VKZ-3601   | copied/declared URL has placeholder segment or fails page availability | Medium     | Low                                 |
| P1       | Dialog keyboard dismissibility                          | VKZ-6082             | open modal persists after Escape                                       | Low        | Low                                 |
| P1       | Expanded-control reachability                           | VKZ-10509, VKZ-10668 | interactive descendants cannot be scrolled into visible region         | Medium     | Medium                              |
| P1       | Configured sticky-header retention                      | VKZ-11416            | declared sticky landmark leaves viewport after scroll                  | Medium     | Medium                              |
| P2       | PDP SKU/reference presence                              | VKZ-9811             | configured product identifier absent from expanded details             | Low        | Medium; business requirement varies |
| Later    | Variant → popup/cart price parity                       | VKZ-9901, VKZ-4914   | selected SKU and normalized price differ across state transition       | High       | Low with controlled fixture         |
| Later    | API-to-DOM section parity                               | VKZ-10664, VKZ-10640 | published visible API data has no corresponding storefront DOM         | High       | Medium                              |

## Future capabilities validated by Jira

| Capability                               | Problems it solves                       | Evidence                                 | Why current engine cannot                     |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Declarative interaction scenarios        | Client navigation, share, media, filters | VKZ-11458, VKZ-10706, VKZ-9803, VKZ-5364 | Current run navigates once and does not click |
| Variant and controlled Add-to-Cart state | Wrong popup/cart price                   | VKZ-9901, VKZ-4914                       | No purchase interaction or SKU-state model    |
| PLP/search surface                       | Discount display, filters, results       | VKZ-7924, VKZ-10593, VKZ-10789           | Current scope is PDP only                     |
| Authenticated cart/checkout flows        | Totals, payment eligibility, delivery    | VKZ-7417, VKZ-5050, VKZ-4788             | No account, cart or safe session model        |
| Multi-locale/currency matrix             | Zero/stale/localized values              | VKZ-4144, VKZ-3589, VKZ-8571, VKZ-3321   | One default browser state                     |
| API + browser correlation                | CMS/render, price parity                 | VKZ-10664, VKZ-10640, VKZ-8571           | No owned API contract collection              |
| Approved visual baseline                 | Subjective layout/image-size defects     | VKZ-11119, VKZ-10520                     | Screenshot alone does not define expected UI  |

## Human-only / unsuitable cases

- [VKZ-11417](https://viled.atlassian.net/browse/VKZ-11417): header “jitter”
  needs an agreed layout-shift threshold and target behavior.
- [VKZ-10520](https://viled.atlassian.net/browse/VKZ-10520): uneven favourites
  layout requires semantic layout expectation or approved visual baseline.
- [VKZ-11119](https://viled.atlassian.net/browse/VKZ-11119): only a screenshot
  describes incorrect image size.
- [VKZ-10503](https://viled.atlassian.net/browse/VKZ-10503): no description;
  the summary alone is insufficient evidence.

Do not turn these into AI-only findings. AI may group confirmed evidence, but
must not invent expected state.

## Top 10 opportunities

1. **PDP CTA availability** — 1 confirmed bug: VKZ-4190; current A coverage.
2. **Client-navigation content assertion** — 2 bugs: VKZ-11458, VKZ-10706;
   C; protects a shopper from an apparently successful but empty route.
3. **Variant-to-cart price parity** — 2 bugs: VKZ-9901, VKZ-4914; C; prevents
   wrong-price purchase state.
4. **Price/currency state matrix** — at least 5 examples: VKZ-4144,
   VKZ-3589, VKZ-8571, VKZ-8540, VKZ-5050; B/C; high commercial clarity.
5. **PLP/search discount parity** — 3 examples: VKZ-7924, VKZ-10593,
   VKZ-10888; C; preserves merchandising accuracy.
6. **Variant selector integrity** — 2 examples: VKZ-3832, VKZ-5366; B/C;
   avoids invalid selection and ambiguous product state.
7. **Valid PDP/share URL** — 2 examples: VKZ-9803, VKZ-3601; B; direct,
   reproducible navigation evidence.
8. **Reachability and modal keyboard scenarios** — 3 examples: VKZ-10509,
   VKZ-10668, VKZ-6082; B; improves accessibility and completion.
9. **Storefront/API parity** — 4 examples: VKZ-10664, VKZ-10640, VKZ-10637,
   VKZ-7082; C; catches publish-to-storefront regressions.
10. **Controlled checkout totals and eligibility** — 3 examples: VKZ-7417,
    VKZ-5050, VKZ-4788; C; high customer and business impact.

## Recommended roadmap impact

### Nearest rule backlog

1. Calibrate `pdp-visible-price` against zero/`undefined` representations.
2. Add duplicate variant-label check only with grouped selector fixtures.
3. Add share-link/placeholder URL rule.
4. Add Escape dialog scenario and expandable-control reachability check.
5. Add configurable sticky landmark scenario; do not infer intended sticky UI.

Each new rule needs a stable ID, one finding, evidence/recommendation and
positive/negative local benchmark cases.

### Engine backlog

- Declarative browser actions with pre/post URL, DOM, selected state and
  bounded network evidence.
- Scenario input model for variant, locale/currency and expected route.
- Bounded, deduplicated console/network error collection.

### Platform roadmap

- PLP/search, cart and checkout surfaces.
- Explicit customer authorization and isolated authenticated sessions.
- API/browser correlation only for customer-owned API contracts.
- Device/locale/currency matrix and historical run comparison.

### What Jira validates and what it does not

Jira strongly validates the current roadmap’s deterministic browser scenarios,
PLP/search/cart/checkout expansion, comparison and API correlation direction.
It does **not** validate AI-first quality detection or generic visual regression
as the next priority: the high-impact examples above have objective state, URL,
DOM, network or API evidence.
