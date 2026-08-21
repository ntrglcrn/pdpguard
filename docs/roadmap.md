# Product Vision

Через 3–5 лет PDP Guard — детерминированная платформа качества ecommerce,
которая безопасно проверяет customer-owned storefronts в реальном браузере,
превращает наблюдаемые дефекты в доказательные findings и показывает изменения
качества во времени.

Для команды это единое место для browser testing, continuous monitoring,
истории запусков, сравнения регрессий, отчётов, API и интеграций в процесс
исправления. Workspace хранит только свои stores и результаты; роли,
policies, audit trail и isolated execution делают продукт пригодным для
enterprise use. В дальнейшем та же доказательная модель может покрыть mobile
apps и другие ecommerce surfaces — PLP, search, cart, checkout и CMS — без
размывания PDP как первой и основной специализации.

AI может помогать группировать или объяснять уже подтверждённые evidence, но
не заменяет детерминированный rule engine там, где проблема проверяема кодом.

---

# Product Principles

Каждое решение в roadmap и реализации должно следовать этим принципам.

- **Deterministic over AI.** Существующий engine и product context уже
  выбирают детерминированные правила по умолчанию; AI допустим только поверх
  подтверждённых facts.
- **Evidence over opinion.** Каждый `Finding` содержит evidence и
  recommendation; продукт не заявляет неподтверждённый revenue impact.
- **Low false positives over rule count.** Новое покрытие не важнее доверия к
  finding; неустойчивая эвристика остаётся вне shipped rules.
- **Benchmark before expansion.** Локальный executable benchmark и real-world
  calibration предшествуют расширению правила или смене его severity.
- **Stable public rule IDs.** `id` и `ruleId` уже являются частью finding
  contract; после попадания в сохраняемые reports их нельзя менять или
  переиспользовать без совместимой migration strategy.
- **One Finding = one problem.** Это сохраняет понятные evidence,
  recommendations, сравнение запусков и приоритизацию.
- **Security first at browser boundaries.** Public URL validation, redirect и
  request checks, limits и safe errors не ослабляются ради coverage.
- **Safe browser execution.** Untrusted pages не получают доступ к web process,
  tenant data или неконтролируемым ресурсам.
- **Reproducibility over cleverness.** Чистый checkout, CI, stable fixtures и
  bounded behavior ценнее неявных эвристик и machine-specific state.
- **Backward compatibility where reports persist.** Изменение rule semantics,
  severity или result contract должно быть observable и сравнимо с историей.

---

# Current State

Проект — один Next.js 16 application, пока локальный MVP.

Development идёт двумя параллельными workstreams: `engine` развивает
детерминированные audit rules и browser execution, `saas-foundation` развивает
tenant ownership и hosted foundation boundaries. `main` используется только
для integration, разрешения конфликтов и полного verification объединённого
состояния; feature work напрямую в `main` не начинается.

- [x] UI запускает аудит одной публичной HTTP(S)-страницы и показывает
      findings и full-page screenshot в viewport 390 × 844.
- [x] Playwright runner ограничивает время аудита, redirects и высоту
      screenshot; блокирует service workers и WebSockets; после
      `domcontentloaded` ждёт bounded structural readiness перед rules.
- [x] URL проходят DNS-проверку: локальные, private, reserved и URL с
      credentials отклоняются до навигации и при запросах страницы.
- [x] Есть типизированные `Finding`, summary и двенадцать независимых правил:
      availability, title, canonical URL, robots indexing, product image, broken
      images, product image alt text, visible price, variant label integrity,
      share URL integrity, purchase CTA и Product/ProductGroup JSON-LD.
- [x] Есть unit-тесты URL safety, summary, price/CTA matching и JSON-LD, а
      также browser fixtures для текущих эвристик и delayed/permanent/immediate
      readiness states. В `docs/calibration.md` есть ручная калибровка 25 live
      URL (23 включены, два anti-bot случая исключены).
- [x] Скриншоты временно хранятся локально до 24 часов.
- [x] Есть исполнимый benchmark с локальным manifest, positive/negative
      controls для двенадцати правил, 13 именованными purchase CTA regressions,
      regressions для lazy image placeholder, robots indexing directives и
      permanent loader execution state, а также Product/Offer JSON-LD
      semantics и командой `pnpm benchmark`.
- [x] Есть один GitHub Actions workflow для clean-checkout verification:
      lint, typecheck, browser tests, benchmark и production build.
- [x] Поддерживаемое окружение и официальный clean-checkout workflow
      документированы в `README.md` и соответствуют CI.
- [x] Минимальная hosted security architecture документирована в
      `docs/hosted-security-boundary.md`; её worker, tenant и artifact controls
      являются future requirements и ещё не реализованы.
- [x] Реализована persisted SQLite model Workspace → Store → Audit Run →
      Finding / Artifact с hashed sessions, owner/member RBAC, scoped worker
      capabilities, durable terminal run states и проверкой полного ownership
      chain. Artifact bytes не возвращаются без workspace membership.
- [ ] Нет external identity flow, isolated workers, queues, hosted object
      storage, catalog scanning, public SaaS API, exports и integrations.

Технические долги, подтверждённые текущей проверкой:

- `pnpm lint` проходит.
- `pnpm typecheck` удаляет stale `.next`, заново запускает `next typegen` и
  затем выполняет strict TypeScript check; `pnpm build` проходит после него.
- `pnpm test` и `pnpm benchmark` проходят вне sandbox; внутри текущей sandbox
  Playwright не запускается из-за запрета macOS Mach port. Это ограничение
  среды, а не подтверждённый дефект правил.
- CI workflow проверен локально эквивалентными командами, но ещё не наблюдался
  на реальном GitHub-hosted runner.
- Global `auditInProgress`, local filesystem screenshots и runner в web
  process подходят для MVP, но не для публичного multi-tenant SaaS.
- Multi-platform calibration включает Shopify, headless Shopify, WooCommerce и
  Adobe Commerce / Magento. Найденный на Magento PDP false positive
  `broken-images` для lazy image placeholders исправлен и закреплён локальным
  regression case; настоящий broken image остаётся positive control.
- Live запуск Gold Apple подтвердил системный failure mode: прежний runner
  запускал rules по preloader и создавал cascade false warnings. Bounded
  readiness gate теперь пропускает rules только после стабильного auditable
  state, а permanent loader даёт один incomplete outcome.
- Full-page screenshot captures the current rendered document but deliberately
  does not force offscreen lazy components or shopper-specific interactions to
  materialize. This is a documented calibration limitation, not a reason to
  reinterpret DOM-based findings from the captured state.

---

# Product Evolution

**Current — Deterministic PDP Auditor**

Один локальный mobile audit даёт evidence для двенадцати core checks. Ценность —
быстро увидеть явный purchase blocker на конкретной публичной странице.

↓

**Commercial SaaS**

Authenticated workspace безопасно запускает и хранит свои audits. Ценность —
repeatable evidence и история, доступная команде, а не одному local process.

↓

**Continuous PDP Monitoring**

Store-owned URL sources, schedules и run comparison превращают разовые audits
в обнаружение регрессий. Ценность — узнать об изменении до обращения shoppers.

↓

**Ecommerce Quality Platform**

Единая evidence model распространяется на согласованные дополнительные
surfaces и browser scenarios. Ценность — общий язык качества между engineering,
ecommerce и agency teams.

↓

**Enterprise Platform**

Изоляция, custom policies, auditability и integration controls отвечают
требованиям крупных организаций. Ценность — управляемое качество нескольких
stores и teams без потери доказательности.

---

# First Commercial Release Scope

## Included

- Authenticated workspaces with an owner/member access boundary.
- Customer-owned stores, persisted audit runs, findings and controlled
  screenshot retention.
- Isolated, bounded browser execution that retains existing URL and request
  safety controls.
- A history view for one store and a single completed audit report.
- The benchmarked deterministic PDP rules shipped at the time of release.
- CI-backed verification, executable benchmark and documented multi-platform
  calibration evidence.

## Explicitly NOT Included

- PLP, search, cart, checkout, wishlist, brand pages, CMS or marketplace
  coverage.
- Mobile application auditing, including APK and TestFlight flows.
- AI-first detection, visual regression, custom rule builders and custom
  enterprise policies.
- White-label reporting, multi-region enterprise deployment, SSO and
  self-hosted deployment.
- A broad integration marketplace; only the API and the minimum customer-led
  integration work from later phases are candidates after Version 1.0.

This scope commercializes the proven PDP engine instead of presenting future
platform coverage as an initial-release promise.

---

# Development Phases

## Phase 1 — Воспроизводимое качество

**Goal:** сделать текущий engine проверяемым из чистого checkout.

**Expected result:** воспроизводимые local browser fixtures и единый CI
verification gate, который дополняется benchmark на границе с Phase 2.

**Definition of Done:** clean checkout проходит lint, typecheck, unit tests,
browser fixture tests и build в поддерживаемом окружении; эти проверки есть в
CI.

**Dependencies:** нет.

**Tasks:**

- [x] Убирать generated `.next` artifacts перед verification. **Priority:**
      Critical. **Impact:** typecheck снова отражает исходный код.
- [x] Добавить один CI workflow: install, lint, typecheck, test, browser
      install и build; подключить benchmark, как только он появится. **Priority:**
      Critical. **Impact:** регрессии перестают зависеть от машины разработчика.
- [x] Документировать поддерживаемое Node/pnpm/Playwright окружение.
      **Priority:** High. **Impact:** проблемы приложения отделены от ограничений
      среды.
- [x] Добавить deterministic PDP readiness gate перед rule engine и browser
      regressions для delayed PDP, permanent loader и immediately ready PDP.
      **Priority:** Critical. **Impact:** loader state больше не создаёт cascade
      false findings.

**Risks:** Playwright зависит от браузерных binaries и OS permissions; stale
generated output может маскировать состояние source tree.

---

## Phase 2 — Benchmark и калибровка правил

**Goal:** измерять качество правил до расширения их числа.

**Expected result:** versioned local fixtures и manifest с ожидаемыми findings;
live calibration остаётся отдельной ручной проверкой.

**Definition of Done:** `pnpm benchmark` выполняет committed cases, сообщает
ошибки по rule ID и запускается в CI. Для каждой эвристики есть positive и
negative control.

**Dependencies:** воспроизводимые local browser fixtures из Phase 1. Полное
завершение Phase 1 не требуется: benchmark implementation начинается сразу,
а его CI integration завершается на границе Phase 1 и Phase 2.

**Tasks:**

- [x] Создать минимальный benchmark manifest и runner поверх существующих
      browser fixtures. **Priority:** Critical. **Impact:** каждое изменение
      правила получает regression gate без зависимости от внешних сайтов.
- [x] Вынести репрезентативные CTA, price, image и JSON-LD cases в именованные
      benchmark cases. **Priority:** Critical. **Impact:** поведение правил
      становится явным продуктовым контрактом.
- [x] Добавить именованные regression cases для подтверждённых false
      positives/negatives из существующих tests, calibration и git history.
      **Priority:** High. **Impact:** снижает шум findings.
- [x] Закрепить permanent loader как execution-level benchmark regression без
      live URL в CI. **Priority:** Critical. **Impact:** обычные PDP rules не
      запускаются по неготовому DOM.
- [x] Расширять `docs/calibration.md` разными storefront platforms и failure
      modes, не включая live сайты в CI. **Priority:** High. **Impact:** проверяет
      переносимость эвристик.

**Risks:** магазины меняются и блокируют automation; fixture не должна
подменять реальную страницу случайным synthetic HTML.

---

# Gate to SaaS

Significant SaaS infrastructure work begins only when all gates below are
met. They protect the team from scaling an unverified detector and are
intentionally observable conditions, not arbitrary thresholds.

- **Executable benchmark:** the twelve existing rules have named local cases,
  expected findings and negative controls where a heuristic can produce a
  false positive. **Why:** persistent reports make rule behavior a customer
  contract.
- **Regression stability:** a clean checkout runs lint, typecheck, unit tests,
  browser fixtures, build and benchmark successfully in CI. **Why:** workers
  and storage multiply the cost of an unreliable base.
- **Rule maturity:** each shipped rule has evidence, recommendation, stable ID
  and calibration records; known limitations are documented. **Why:** SaaS
  history and comparison are meaningful only for understood rule semantics.
- **Browser reliability:** a supported runner can install Chromium and execute
  the browser suite repeatedly without relying on developer-local state.
  **Why:** the product's primary output depends on browser execution.
- **Defect coverage confidence:** calibration includes distinct storefront
  platforms and both passing and failing real-world scenarios, not only pages
  from one store. **Why:** one-site success does not establish ecommerce value.
- **Security design boundary:** the hosted design preserves existing URL
  validation and specifies isolation, bounded resources, screenshot access and
  tenant authorization in `docs/hosted-security-boundary.md`. This design is
  documented but not implemented. **Why:** untrusted navigation is the
  product's primary security boundary.

The criteria above authorize Phase 3 and implementation work in Phase 4. They
do not authorize exposing the local MVP or an incomplete hosted stack.

### Must exist before hosted alpha

- Authenticated workspace ownership and object-level authorization across
  Workspace → Store → Audit Run → Finding / Screenshot.
- Browser execution outside the web process, isolated per job and governed by
  durable lifecycle, cancellation and configurable resource limits.
- Existing URL/request/redirect validation plus connection-time egress controls
  that block private networks and DNS-rebinding paths.
- Private run-bound artifact storage with authorized access and enforced
  retention/deletion; no hosted local-filesystem assumption.
- Bounded stored data and sanitized failure responses.

### Must exist before paid release

- Production evidence for tenant isolation, worker containment, SSRF/egress and
  resource ceilings under concurrency and representative failures.
- Operational visibility for job attempts, retry/cancellation, artifact
  deletion and security-policy failures without unrestricted page capture.
- Tested retention/deletion and recovery behavior plus an incident path for
  browser-boundary or cross-tenant events.

### Can be deferred

- SSO, enterprise roles, custom tenant policies and custom retention.
- Multi-region/data-residency controls and customer-managed storage/workers.
- Private storefront access or customer browser sessions, which require a
  separate trust model.

These are readiness criteria, not an implementation backlog. The canonical
invariants, current gaps and failure model remain in
`docs/hosted-security-boundary.md`. Passing the planning gate authorizes work;
hosted alpha and paid release each remain blocked until their respective
runtime criteria are verified.

---

## Phase 3 — Проверки PDP с высоким уровнем доверия

**Goal:** расширять покрытие только там, где есть стабильная эвристика и
benchmark.

**Expected result:** больше actionable PDP checks при сохранении контракта
«одно правило — один Finding».

**Definition of Done:** у каждого правила есть stable rule ID, evidence,
recommendation, benchmark cases и calibration evidence. Critical используется
только для подтверждённого purchase blocker.

**Dependencies:** Phase 2 и успешно пройденный Gate to SaaS.

**Tasks:**

- [x] Добавить проверку canonical URL. **Priority:** High. **Impact:** выявляет
      missing, invalid и conflicting canonical declarations на PDP.
- [x] Добавить robots indexing directive check. **Priority:** High. **Impact:**
      выявляет PDP, исключённые из поискового индекса через `noindex` или
      `none` в применимых meta robots и финальном HTML `X-Robots-Tag`.
- [ ] Добавить Open Graph check. **Priority:** Medium. **Impact:** проверяет
      базовые product sharing metadata.
- [ ] Добавить hreflang check после multi-locale calibration. **Priority:**
      Medium. **Impact:** полезен международным storefronts, но требует
      аккуратной проверки reciprocal locale mappings.
- [x] Уточнить текущую JSON-LD проверку для price, currency и availability.
      **Priority:** High. **Impact:** finding различает отсутствие Product
      offer, price и priceCurrency, поддерживает ProductGroup variants и не
      превращает рекомендованную availability в warning.
- [x] Добавить deterministic alt text check для выбранного primary product
      image, используя existing image snapshot. **Priority:** Medium. **Impact:**
      даёт accessibility coverage без нового browser flow.
- [x] Усилить visible product price для `undefined`, `NaN` и zero, сохранив
      legitimate `Free`. **Priority:** High. **Impact:** invalid storefront
      values не проходят как наблюдаемая цена.
- [x] Добавить deterministic variant-label integrity check: дубли ищутся
      только внутри одной видимой semantic-группы, hidden responsive clones
      игнорируются. **Priority:** High. **Impact:** shopper не видит два
      неразличимых variant choices.
- [x] Добавить static share URL integrity check для `undefined`, `null` и
      unresolved path/template segments. **Priority:** High. **Impact:** явные
      placeholder URLs не доходят до shopper; click-flow остаётся отдельным
      future scenario.
- [ ] Добавить lazy-load readiness для product image после отдельной
      calibration. **Priority:** Medium. **Impact:** расширяет image delivery
      coverage без смешения с alt text check.
- [ ] Добавлять breadcrumbs, reviews и variant-state checks только после
      реальных примеров с устойчивой семантикой. **Priority:** Medium. **Impact:**
      полезны, но сильно зависят от storefront implementation.
- [ ] Собирать bounded, deduplicated browser console errors. **Priority:**
      Medium. **Impact:** добавляет техническое evidence без шумного log dump.

**Risks:** язык и платформенные паттерны дают false positives; нельзя менять
severity или existing rule IDs без benchmark regression cases.

---

## Phase 4 — Безопасный hosted audit service

**Goal:** заменить local-process assumptions минимальной основой SaaS.

**Expected result:** authenticated customer хранит и просматривает свои audits;
browser work выполняется вне web process.

**Definition of Done:** audit принадлежит workspace и store, доступ к результату
проверяется, results/screenshots durable, а job имеет bounded retry и
cancellation.

**Dependencies:** Phases 1–3, Gate to SaaS и подтверждённый спрос на hosted
product.

**Tasks:**

- [x] Определить минимальную persistence model: workspace, member, store,
      audit run, finding и screenshot reference. **Priority:** Critical.
      **Impact:** закрепляет ownership contract для минимальной коммерческой
      модели; SQLite является single-node foundation, не hosted database.
- [x] Добавить authentication и workspace authorization до сохранения customer
      URLs/results. **Priority:** Critical. **Impact:** создаёт tenant boundary.
- [ ] Изолировать browser workers и заменить global lock durable job state.
      **Priority:** Critical. **Impact:** защищает web app от untrusted browser work
      и позволяет horizontal scaling.
- [ ] Перенести защищённые SQLite artifact blobs в durable object storage с
      тем же access control и retention. **Priority:** High. **Impact:**
      single-node database не подходит для horizontal deployment.
- [ ] Добавить audit history и single-run report. **Priority:** High.
      **Impact:** делает результаты повторно полезными клиенту.

**Risks:** SSRF/evasion, egress control, browser resource exhaustion и
cross-tenant access. Текущий runner нельзя публично публиковать как есть.

---

## Phase 5 — Monitoring и reporting

**Goal:** перейти от разового аудита к контролю ограниченного каталога.

**Expected result:** customer запускает scheduled audits своих URL, видит
изменения и делится отчётом.

**Definition of Done:** URL intake bounded и authorized; jobs durable и
observable; comparison строится по stable rule ID; export не раскрывает чужие
данные.

**Dependencies:** Phase 4.

**Tasks:**

- [ ] Добавить bounded intake URLs принадлежащего customer каталога.
      **Priority:** High. **Impact:** создаёт monitoring без преждевременного
      public-web crawler.
- [ ] Добавить schedules, statuses, retries и cancellation в durable jobs.
      **Priority:** High. **Impact:** делает recurring checks надёжными.
- [ ] Сравнивать completed runs по rule ID и finding status. **Priority:**
      High. **Impact:** превращает audit в detector regression.
- [ ] Добавить shareable report и один export format после стабилизации report
      model. **Priority:** Medium. **Impact:** помогает agency/client workflow без
      нескольких document pipelines.

**Risks:** crawl volume, anti-bot pages, dynamic content и screenshot costs
требуют жёстких limits.

---

## Phase 6 — Интеграции и командный workflow

**Goal:** встроить verified findings в процесс исправления клиента.

**Expected result:** customer может вызывать audits по API и передавать finding
в выбранную внешнюю систему.

**Definition of Done:** API и integrations workspace-scoped, используют
least-privilege credentials, имеют delivery status и не нарушают tenant
isolation.

**Dependencies:** Phase 5.

**Tasks:**

- [ ] Опубликовать API для stores, audit runs, findings и reports.
      **Priority:** High. **Impact:** автоматизация появляется до затрат на много
      native integrations.
- [ ] Добавить один issue-tracker по подтверждённому customer demand.
      **Priority:** Medium. **Impact:** связывает finding с remediation без
      спекулятивных connectors.
- [ ] Добавить webhooks о completed и changed audit runs. **Priority:**
      Medium. **Impact:** подключает deployment и notification flows клиента.
- [ ] Расширять owner/member roles только при реальной потребности. **Priority:**
      Low. **Impact:** исключает преждевременную permission matrix.

**Risks:** OAuth tokens, webhooks replay, rate limits и idempotency увеличивают
security и support cost.

---

# Priorities

Приоритет и эффект указаны у каждой задачи. Порядок намеренный: сначала
воспроизводимое качество и benchmark, затем coverage, затем multi-tenant
runtime, monitoring и integrations.

---

# Dependencies

- Reproducible local browser fixtures → Phase 2: benchmark начинается до
  полного завершения Phase 1; его CI integration завершается на границе фаз.
- Phase 2 + Gate to SaaS → Phase 3: новое правило требует объективного
  regression gate и пройденной maturity/security проверки.
- Phases 1–3 → Phase 4: SaaS должен запускать уже проверенный engine.
- Phase 4 → Phase 5: monitoring требует persistence, authorization и jobs.
- Phase 5 → Phase 6: integrations требуют stable report и comparison model.

---

# Risks

Главные сквозные риски: SSRF/evasion, browser resource exhaustion, anti-bot
responses, false positives и data isolation. Они должны устраняться на уровне
shared runner, benchmark и authorization model, а не в отдельных UI paths.

---

# Nice to Have

- [ ] Desktop audits после стабилизации mobile rules.
- [ ] Дополнительные export formats после проверки ценности первого.
- [ ] Comments и annotations после появления persisted team workflow.
- [ ] White-label reports после подтверждённого спроса агентств.

---

# Future Ideas

- [ ] Controlled add-to-cart и PDP/cart price consistency после явной модели
      customer authorization и safe interaction policy.
- [ ] Visual regression с approved baselines и dynamic-region handling.
- [ ] Platform-specific adapters только там, где generic rules стабильно не
      покрывают важный кейс.
- [ ] AI grouping и remediation suggestions только поверх deterministic
      evidence.
- [ ] PLP, search, cart, checkout и mobile apps после повторяемого спроса на
      коммерческий PDP SaaS.

---

# Release Gate

Первый публичный коммерческий релиз возможен только когда все категории ниже
выполнены.

## Technical

- CI из clean checkout проходит lint, typecheck, unit tests, browser fixtures,
  build и benchmark.
- У каждого shipped rule есть stable behavior, evidence, recommendation и
  regression coverage.
- Audit history, findings и screenshots durable; comparison использует stable
  rule IDs и не смешивает workspace data.

## Product

- First Commercial Release Scope реализован целиком, а explicitly excluded
  items не представлены как доступная функциональность.
- Benchmark и multi-platform calibration подтверждают shipped rules и их
  известные ограничения.
- Report понятен без внутреннего контекста: finding объясняет проблему,
  evidence и следующий шаг.

## Operational

- Browser workers, job status, retry/cancellation boundaries и screenshot
  retention наблюдаемы для команды, которая поддерживает сервис.
- Документировано supported execution environment и проверен путь установки
  browser binaries для CI/production.
- Ошибки customer-facing и operational logs разделены; отказ audit не делает
  результат другого audit недоступным.

## Security

- Authentication, workspace authorization и retention/deletion rules защищают
  customer URLs, results и screenshots.
- Browser execution изолирован от web application; сохранены bounded
  network/redirect/time/memory/screenshot controls и safe errors.
- Нет cross-tenant доступа в report, screenshot, API или job workflow.

## Customer Value

- Customer может запустить audit своего store, увидеть сохранённый report и
  вернуться к history без помощи команды PDP Guard.
- Shipped findings дают проверяемый PDP defect или подтверждённое отсутствие
  проблемы, а не неподкреплённую оценку business impact.
- Как минимум один end-to-end customer workflow — run → report → remediation
  decision — проверен на representative store-owned pages.

---

# Future Roadmap

## Version 1.1 — Monitoring

После Version 1.0: bounded catalog URL intake, schedules, status и comparison
completed runs. Это развивает существующий audit report в detection regressions
для уже авторизованных stores.

## Version 1.2 — Remediation workflow

После подтверждения, что monitoring используют регулярно: API, webhooks и
одна integration, выбранная по customer demand. Это переносит verified
findings в существующий workflow команды.

## Enterprise

После повторяемого спроса от крупных customers: расширенные roles, custom
policies, audit trail, SSO/self-hosted considerations и multi-store controls.
Каждый элемент требует отдельной security и operational design, а не включается
как вариант настройки текущего MVP.

## Platform

После доказанной ценности PDP monitoring: controlled interaction tests,
visual regression и последовательно другие ecommerce surfaces. Mobile app
support рассматривается только как отдельный evidence-preserving product flow,
не как расширение текущего URL runner.

---

# Decision Log

| Decision                                      | Rationale                                                                                              | Consequence                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Deterministic rules are the default           | The product context and current engine already use explainable checks where ordinary code is reliable. | AI may assist evidence, never replace a check without a separate product decision. |
| Benchmark precedes rule expansion             | Manual calibration is useful but cannot prevent regressions.                                           | Each new or changed rule needs executable cases before it ships.                   |
| Findings carry stable IDs                     | `Finding` already exposes `id` and `ruleId`; future comparison depends on them.                        | Do not rename or reuse persisted rule IDs; make compatibility explicit.            |
| One rule returns one Finding                  | This is the repository audit contract and makes evidence/recommendations specific.                     | Avoid aggregate quality-score findings that hide independent defects.              |
| Browser execution is a security boundary      | The runner navigates untrusted public URLs and already applies SSRF/resource limits.                   | Hosted workers must be isolated; UI must not call Playwright directly.             |
| Local filesystem and global lock are MVP-only | They match the single-process implementation but do not persist or scale safely.                       | Replace them only in Phase 4, with tenant and worker boundaries.                   |
| Live stores are calibration, not CI fixtures  | The matrix includes anti-bot exclusions and changing third-party pages.                                | CI uses committed local cases; calibration stays separately documented.            |

---

# Success Metrics

Metrics measure product trust and customer value, not raw scan volume.

- **Benchmark quality:** coverage of shipped rule behavior by named positive,
  negative and regression cases; changes are reviewable by rule ID.
- **Regression stability:** clean CI pass/fail history for verification and
  benchmark gates, with failures attributable to source or environment.
- **Rule confidence:** calibration evidence across storefront types, documented
  known limitations, and the rate at which reported false positives/negatives
  become regression cases.
- **Audit reliability:** completed audit runs, bounded failure reasons and
  recovery from supported operational failures, separate from third-party
  anti-bot responses.
- **Customer value:** whether a customer can make and complete a remediation
  decision from a finding's evidence and recommendation.
- **Monitoring value:** after Version 1.1, whether run comparison identifies
  a meaningful change in a customer-owned store before manual discovery.

---

# Current Focus

`main` — integration only: он объединяет завершённые commits обоих workstreams
и не имеет отдельного feature focus.

## Engine Current Focus

**FR-5 завершён в статической части: `share-url-integrity` выявляет `undefined`,
`null` и unresolved segments в видимых share anchors. Click-flow и scenario
engine намеренно не добавлены.**

**Добавить lazy-load readiness для product image после отдельной calibration,
не смешивая delivery state с завершённым alt text rule.**

Deterministic primary product image alt text check завершён и использует
existing image snapshot. Structured Product/Offer semantics также сохранены в
объединённом benchmark.

## SaaS Current Focus

**Добавить external authentication boundary до hosted доступа к customer URLs и
audit results.**

Persisted SQLite ownership chain и owner/member checks завершены. External
identity flow, isolated workers, queues, hosted object storage и public API ещё
не реализованы.
