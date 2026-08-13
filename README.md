# PDP Guard

PDP Guard is a local MVP for auditing one public ecommerce product page at a time. It opens the page in a mobile Chromium viewport, runs deterministic checks, captures a full-page screenshot, and presents evidence-oriented findings.

## Requirements

- Node.js 20.9 or newer
- pnpm 10

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), enter a public product page URL, and select **Run audit**.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture

- `src/app` contains the product workspace and HTTP routes.
- `src/domain` contains the stable audit result and rule contracts.
- `src/lib/audit` contains the Playwright runner and independent rules.
- `src/lib/url-safety.ts` owns SSRF validation.
- `src/lib/screenshot-storage.ts` owns temporary local screenshot storage.

Screenshots are stored under `.runtime/screenshots`, excluded from Git, and removed opportunistically after 24 hours. No audit history is persisted.

## MVP limitations

- One URL and one in-process audit at a time; there is no queue or worker.
- Full-page captures are rejected above 20,000 CSS pixels to bound memory use.
- Product-page classification, cart interaction, authentication, catalog scans, visual regression, AI, billing, and integrations are out of scope.
- Rules use deliberately explainable heuristics and can produce false positives or negatives on unusual storefronts.
- Network requests are checked against local/private/reserved address ranges before navigation and at request time. This materially reduces SSRF risk, but a hostile environment with DNS rebinding or compromised DNS requires infrastructure-level egress controls before internet deployment.
- The app is intended for trusted local use. Do not expose this MVP directly to the public internet without authentication, rate limiting, isolated browser workers, and network sandboxing.
