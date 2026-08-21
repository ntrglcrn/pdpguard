# Product Vision

Через 3–5 лет PDP Guard — детерминированная платформа качества ecommerce,
которая безопасно проверяет customer-owned storefronts в реальном браузере,
превращает наблюдаемые дефекты в доказательные findings и показывает изменения
качества во времени.

Для команды это единое место для browser testing, continuous monitoring,
истории запусков, сравнения регрессий, отчётов, API и интеграций в процесс
исправления. Workspace хранит только свои stores и результаты; роли, policies,
audit trail и isolated execution делают продукт пригодным для enterprise use.
В дальнейшем та же доказательная модель может покрыть mobile apps и другие
ecommerce surfaces — PLP, search, cart, checkout и CMS — без размывания PDP как
первой и основной специализации.

AI может помогать группировать или объяснять уже подтверждённые evidence, но
не заменяет детерминированный rule engine там, где проблема проверяема кодом.

---

# Document Roles

- **Vision** задаёт долгосрочное направление и product principles.
- **Roadmap** упорядочивает подтверждённую работу и её gates; он не создаёт
  новые product requirements.
- **PRD** ([PDP Guard v2](./prd/pdp-guard-v2.md)) задаёт scope, functional
  requirements и acceptance criteria.
- **Architecture** ([hosted security boundary](./hosted-security-boundary.md))
  задаёт trust boundaries и hosted constraints, но не обещает delivery
  capability.

---

# Product Principles

- **Deterministic over AI.** AI допустим только поверх подтверждённых facts.
- **Evidence over opinion.** Каждый Finding содержит evidence и recommendation.
- **Low false positives over rule count.** Неустойчивая эвристика не становится
  shipped rule.
- **Benchmark before expansion.** Новое или изменённое правило получает local
  positive, negative и нужные regression cases до release.
- **Stable public rule IDs.** Public IDs не переименовываются и не
  переиспользуются без compatible migration strategy.
- **One Finding = one problem.** Evidence и recommendation остаются конкретными.
- **Security first at browser boundaries.** URL, redirect и request safety,
  limits и safe errors не ослабляются ради coverage.

---

# Current State

Проект — один Next.js 16 application. main служит integration branch; feature
work идёт в отдельных workstreams.

- [x] Public HTTP(S) PDP audit возвращает typed findings, summary и full-page
      screenshot в mobile viewport.
- [x] URL safety блокирует credential-bearing URL и local/private/reserved
      destinations до навигации и в page requests; redirects перепроверяются.
- [x] Playwright runner имеет bounded navigation/readiness/screenshot limits,
      блокирует service workers и WebSockets и закрывает browser resources.
- [x] Двенадцать stable rules с сохранёнными public IDs: page-availability,
      page-title, canonical-url, robots-indexing, product-image,
      product-image-alt-text, broken-images, product-price, variant-label-integrity,
      share-url-integrity, purchase-cta, structured-product-data.
- [x] Local browser fixtures, unit tests, executable benchmark и calibration
      существуют для shipped rules; live storefronts остаются manual evidence, не
      CI dependency.
- [x] Bounded declarative scenario engine поддерживает validated actions,
      captures и assertions с approved origins, sanitized bounded evidence и
      browser fixture coverage.
- [x] Clean-checkout CI запускает lint, typecheck, tests, Chromium install,
      benchmark и production build.
- [x] Hosted security boundary документирован; persisted SQLite ownership chain
      Workspace → Store → Audit Run → Finding / Artifact имеет owner/member RBAC и
      scoped worker capabilities.
- [ ] Нет external identity flow, isolated workers, queues, hosted object
      storage, schedules, public SaaS API, exports и integrations.

Known limitations: browser runner и local screenshots не подходят для hosted
multi-tenant execution. Scenario engine пока не является user-configurable
product surface, не запускает payment/order submission и не заменяет hosted
worker boundary.

---

# Roadmap v2.0

Работа ведётся в трёх параллельных треках. Ссылки ведут на PRD; [x] означает
подтверждённую code и verification coverage, а не только design intent.

## Track 1 — Engine

**Outcome:** deterministic PDP scenarios и findings с bounded reproducible
evidence, при сохранении v1 contracts.

- [x] Сохранить v1 rules, stable public IDs и local benchmark foundation —
      [FR-1](./prd/pdp-guard-v2.md#fr-1-preserve-all-v1-pdp-rules).
- [x] Усилить visible-price validation для placeholder, undefined, NaN и zero
      price с explicit Free semantics —
      [FR-2](./prd/pdp-guard-v2.md#fr-2-strengthened-visible-price-validation).
- [x] Проверять duplicate visible labels внутри одного semantic variant group,
      игнорируя hidden clones и cross-group duplicates —
      [FR-3](./prd/pdp-guard-v2.md#fr-3-variant-label-integrity).
- [x] Реализовать bounded declarative actions/assertions, validation,
      sanitized scenario findings и fixture coverage —
      [FR-4](./prd/pdp-guard-v2.md#fr-4-bounded-deterministic-scenario-engine),
      [FR-13](./prd/pdp-guard-v2.md#fr-13-scenario-findings-and-evidence).
- [x] Добавить static share URL integrity для undefined, null и unresolved
      path/template segments. Это static часть
      [FR-5](./prd/pdp-guard-v2.md#fr-5-pdp-navigation-and-share-link-validation).
- [x] Добавить configured PDP navigation scenario package: final URL, explicit
      error boundary, content transition и history-back —
      [FR-5](./prd/pdp-guard-v2.md#fr-5-pdp-navigation-and-share-link-validation).
- [x] Проверять product identity после in-app navigation по stable explicit
      identifier, не по image URL —
      [FR-6](./prd/pdp-guard-v2.md#fr-6-product-identity-after-in-app-navigation).
- [x] Добавить configured reachability и Escape dismissal checks поверх
      scenario engine —
      [FR-10](./prd/pdp-guard-v2.md#fr-10-interactive-reachability-and-keyboard-dismissal).
- [ ] После отдельной calibration уточнить product-image lazy-load readiness,
      не смешивая delivery state с alt-text rule.

## Track 2 — Platform

**Outcome:** безопасный hosted foundation для customer-owned runs; browser
execution остаётся внутри established security boundary.

- [x] Документировать hosted isolation, resource, artifact и tenant boundary —
      [hosted security boundary](./hosted-security-boundary.md).
- [x] Реализовать persisted SQLite ownership chain и server-side owner/member
      authorization для Workspace → Store → Audit Run → Finding / Artifact.
- [ ] Добавить external authentication boundary до hosted доступа к customer
      URLs и audit results.
- [ ] Перенести browser execution из web process в isolated per-job workers с
      durable lifecycle, cancellation и configurable bounds.
- [ ] Добавить private durable artifact storage с retention/deletion; не
      переносить local-filesystem assumptions.
- [ ] Добавить authorized single-run report и audit history.
- [ ] Перед beta добавить encrypted session references, customer-owned API
      origin policy и prohibited-action controls —
      [FR-7](./prd/pdp-guard-v2.md#fr-7-variant-and-add-to-cart-consistency),
      [FR-11](./prd/pdp-guard-v2.md#fr-11-customer-owned-api-to-browser-correlation),
      [FR-12](./prd/pdp-guard-v2.md#fr-12-controlled-cart-and-checkout-scenarios).

## Track 3 — Surfaces

**Outcome:** coverage расширяется с PDP только на bounded supplied URLs; crawler
и visual-only judgement не добавляются.

- [ ] Добавить configured PLP/search scenarios: product cards, filter
      apply/reset, expected query/result state и price presentation —
      [FR-8](./prd/pdp-guard-v2.md#fr-8-plp-and-search-audit-surface).
- [ ] Добавить до трёх explicit locale/currency combinations per scenario; не
      угадывать merchant mechanism и не делать FX conversion —
      [FR-9](./prd/pdp-guard-v2.md#fr-9-locale-and-currency-scenarios).
- [ ] В controlled beta добавить variant/Add-to-Cart parity только с isolated
      test product/session и bounded cleanup —
      [FR-7](./prd/pdp-guard-v2.md#fr-7-variant-and-add-to-cart-consistency).
- [ ] В controlled beta добавить cart/checkout totals и payment eligibility,
      останавливаясь до payment/order submission —
      [FR-12](./prd/pdp-guard-v2.md#fr-12-controlled-cart-and-checkout-scenarios).
- [ ] Добавить customer-owned API-to-browser correlation с approved origins,
      declarative bounded JSON paths и selected values —
      [FR-11](./prd/pdp-guard-v2.md#fr-11-customer-owned-api-to-browser-correlation).

---

# Sequencing and Gates

1. **Engine GA:** bounded scenario engine and configured FR-5, FR-6 and FR-10
   assertions have deterministic browser fixture coverage. AuditRule benchmark
   coverage remains separate from stateful scenario execution.
2. **Surface GA:** FR-8 and FR-9 use the scenario engine and do not require
   authenticated sessions.
3. **Hosted alpha:** external authentication/authorization, isolated workers,
   durable run state and private artifact storage are required before public
   hosting.
4. **Controlled beta:** FR-7, FR-11 and FR-12 stay blocked by hosted alpha,
   secret/session handling and destructive-action prevention.

The canonical hosted failure model is in
[hosted-security-boundary.md](./hosted-security-boundary.md). PRD non-goals
remain in force: no AI pass/fail, generic visual regression, unbounded crawling,
payment submission or order placement.

---

# Current Focus

main — integration only; it has no feature focus.

## Engine Current Focus

**Calibrate product-image lazy-load readiness before changing the shipped image
rules.**

## Platform Current Focus

**Add external authentication boundary before hosted access to persisted customer URLs and audit results.**

## Surfaces Current Focus

**Blocked on configured scenario packages: do not begin PLP/search, locale or cart/checkout implementation before the Engine FR-5 package establishes the product integration pattern.**

---

# Deferred

- Generic visual baselines, AI-generated pass/fail, unbounded public-web
  crawling, mobile-app testing, payment/order submission and arbitrary customer
  JavaScript are out of scope for v2.0.
- SSO, enterprise roles, custom tenant policies/retention, multi-region and
  customer-managed workers/storage remain post-paid-release work unless a
  verified customer requirement changes the decision.
