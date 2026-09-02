import { chromium, type Browser, type Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import type { Scenario } from "@/domain/scenario";
import {
  runScenario,
  ScenarioValidationError,
} from "@/lib/audit/scenario-engine";

const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const baseScenario = (steps: Scenario["steps"]): Scenario => ({
  id: "product-navigation",
  version: 1,
  name: "Product navigation",
  approvedOrigins: ["https://shop.example.com"],
  evidenceQueryKeys: ["sku"],
  steps,
});

describe("scenario engine", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route("https://shop.example.com/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/product") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
        return;
      }
      await route.fulfill({
        contentType: "text/html",
        body: `<html><head><link rel="canonical" href="https://shop.example.com${url.pathname}"></head><body><main><h1 data-testid="title">${url.pathname === "/next" ? "Next product" : "First product"}</h1><span data-testid="sku">${url.pathname === "/next" ? "2" : "1"}</span><span data-testid="product-id">${url.pathname === "/next" ? "product-2" : "product-1"}</span><a href="/next?sku=2&token=secret">Next</a><button onclick="fetch('/api/product?sku=2')">Load</button><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: url.pathname === "/next" ? "Next product" : "First product", sku: url.pathname === "/next" ? "2" : "1", productID: url.pathname === "/next" ? "product-2" : "product-1", url: `https://shop.example.com${url.pathname}` })}</script></main></body></html>`,
      });
    });
  });

  afterAll(async () => browser.close());
  afterEach(async () => page.close().catch(() => undefined));

  it("runs allowed actions and assertions with bounded evidence", async () => {
    await page.goto("https://shop.example.com/start?sku=1&token=secret");
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "before" },
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        {
          assert: "navigation",
          from: "before",
          matches: "https://shop.example.com/next*",
          timeoutMs: 200,
        },
        { assert: "url", matches: "https://shop.example.com/next*" },
        { assert: "visibleText", text: "Next product" },
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Load" },
        },
        {
          assert: "request",
          urlMatches: "https://shop.example.com/api/product*",
          method: "GET",
          status: 200,
          query: { sku: "2" },
        },
      ]),
      { resolver, locale: "en-US", screenshotUrl: "/api/screenshots/fixture" },
    );

    expect(result.completedSteps).toBe(7);
    expect(result.finding.status).toBe("passed");
    expect(result.finding.evidence.join(" ")).toContain("sku=2");
    expect(result.finding.evidence.join(" ")).not.toContain("secret");
  });

  it("fails safely on an ambiguous action locator", async () => {
    await page.setContent("<button>Buy</button><button>Buy</button>");
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Buy" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence).toContain("Failed step 1: click.");
    expect(result.finding.evidence.join(" ")).toContain(
      "resolved to 2 elements",
    );
  });

  it("blocks navigation outside approved origins", async () => {
    const result = await runScenario(
      page,
      baseScenario([
        { action: "navigate", url: "https://other.example.com/product" },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(
      "outside approved origins",
    );
  });

  it("rejects more than twelve steps before execution", async () => {
    await expect(
      runScenario(
        page,
        baseScenario(
          Array.from({ length: 13 }, () => ({
            assert: "visibleText",
            text: "x",
          })),
        ),
        { resolver },
      ),
    ).rejects.toBeInstanceOf(ScenarioValidationError);
  });

  it("rejects placeholder navigation paths", async () => {
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "navigate",
          url: "https://shop.example.com/products/undefined",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("placeholder path");
  });

  it("reports a clicked navigation whose content stays stale", async () => {
    await page.goto("https://shop.example.com/start");
    await page.setContent(
      `<main><h1>First product</h1><button onclick="history.pushState({}, '', '/next?sku=2')">Next</button></main>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "before" },
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Next" },
        },
        {
          assert: "navigation",
          from: "before",
          matches: "https://shop.example.com/next*",
          timeoutMs: 200,
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(
      "Clicked role=button name=Next",
    );
    expect(result.finding.evidence.join(" ")).toContain("sku=2");
  });

  it("waits for an observable client-side content transition", async () => {
    await page.goto("https://shop.example.com/start");
    await page.setContent(
      `<main><h1>First product</h1><button onclick="history.pushState({}, '', '/next?sku=2'); setTimeout(() => document.querySelector('h1').textContent = 'Next product', 100)">Next</button></main>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "before" },
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Next" },
        },
        {
          assert: "navigation",
          from: "before",
          matches: "https://shop.example.com/next*",
          errorText: "Something went wrong",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("reports a visible error boundary before a successful-looking transition", async () => {
    await page.goto("https://shop.example.com/start");
    await page.setContent(
      `<main><h1>First product</h1><button onclick="history.pushState({}, '', '/next'); document.querySelector('main').innerHTML = '<h1>Next product</h1><p>Something went wrong</p>'">Next</button></main>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "before" },
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Next" },
        },
        {
          assert: "navigation",
          from: "before",
          equals: "https://shop.example.com/next",
          errorText: "Something went wrong",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(
      "visible error text: Something went wrong",
    );
    expect(result.finding.evidence.join(" ")).toContain(
      "Clicked role=button name=Next",
    );
  });

  it("does not accept a transient SPA state before a delayed error", async () => {
    await page.goto("https://shop.example.com/start");
    await page.setContent(
      `<main><h1>First product</h1><button onclick="history.pushState({}, '', '/next'); document.querySelector('h1').textContent = 'Loading'; setTimeout(() => document.querySelector('main').innerHTML = '<h1>First product</h1><p>Something went wrong</p>', 75)">Next</button></main>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "before" },
        {
          action: "click",
          locator: { by: "role", role: "button", name: "Next" },
        },
        {
          assert: "navigation",
          from: "before",
          equals: "https://shop.example.com/next",
          errorText: "Something went wrong",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("visible error text");
  });

  it("captures product identity from the clicked target URL", async () => {
    await page.goto("https://shop.example.com/start");
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        {
          assert: "productIdentity",
          kind: "sku",
          expected: "2",
          locator: { by: "testId", value: "sku" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("detects stale product identity after an in-app URL transition", async () => {
    await page.goto("https://shop.example.com/start");
    await page.setContent(
      `<main><span data-testid="sku">1</span><a href="/next?sku=2" onclick="event.preventDefault(); history.pushState({}, '', this.href)">Next</a></main>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        {
          assert: "productIdentity",
          kind: "sku",
          expected: "2",
          locator: { by: "testId", value: "sku" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(
      "Expected sku identity 2; observed 1",
    );
  });

  it("verifies the configured product identity signals", async () => {
    await page.goto("https://shop.example.com/next");
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "title",
          expected: "Next product",
          locator: { by: "testId", value: "title" },
        },
        {
          assert: "productIdentity",
          kind: "productId",
          expected: "product-2",
          locator: { by: "testId", value: "product-id" },
        },
        {
          assert: "productIdentity",
          kind: "canonicalUrl",
          expected: "https://shop.example.com/next#ignored",
        },
        {
          assert: "productIdentity",
          kind: "jsonLd",
          field: "productID",
          expected: "product-2",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it.each([
    {
      name: "SKU",
      step: {
        assert: "productIdentity" as const,
        kind: "sku" as const,
        expected: "wrong-sku",
        locator: { by: "testId" as const, value: "sku" },
      },
      evidence: "Expected sku identity wrong-sku; observed 2",
    },
    {
      name: "canonical",
      step: {
        assert: "productIdentity" as const,
        kind: "canonicalUrl" as const,
        expected: "https://shop.example.com/wrong?token=secret",
      },
      evidence:
        "Expected canonicalUrl identity https://shop.example.com/wrong; observed https://shop.example.com/next",
    },
    {
      name: "JSON-LD",
      step: {
        assert: "productIdentity" as const,
        kind: "jsonLd" as const,
        field: "productID" as const,
        expected: "wrong-product",
      },
      evidence: "Expected jsonLd identity wrong-product; observed product-2",
    },
  ])("reports a deterministic $name mismatch", async ({ step, evidence }) => {
    await page.goto("https://shop.example.com/next");
    const result = await runScenario(page, baseScenario([step]), { resolver });

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(evidence);
    expect(result.finding.evidence.join(" ")).not.toContain("secret");
  });

  it("allows scenarios to omit unavailable optional identity signals", async () => {
    await page.setContent(`<span data-testid="sku">2</span>`);
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "sku",
          expected: "2",
          locator: { by: "testId", value: "sku" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("rejects ambiguous JSON-LD product identity", async () => {
    await page.setContent(
      `<script type="application/ld+json">${JSON.stringify([
        { "@type": "Product", sku: "stale" },
        { "@type": "Product", sku: "target" },
      ])}</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "jsonLd",
          field: "sku",
          expected: "target",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("unambiguous");
  });

  it("sanitizes URL-like JSON-LD identity evidence", async () => {
    await page.setContent(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", url: "https://shop.example.com/stale?token=secret" })}</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "jsonLd",
          field: "url",
          expected: "https://shop.example.com/target?token=secret",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).not.toContain("secret");
  });

  it("bounds JSON-LD traversal for large primitive arrays", async () => {
    await page.setContent(
      `<script type="application/ld+json">${JSON.stringify(Array.from({ length: 50_000 }, (_, index) => index))}</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "jsonLd",
          field: "sku",
          expected: "target",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("observed none");
  });

  it("scrolls a configured descendant into a reachable position", async () => {
    await page.setContent(
      `<div style="height:80px;overflow:auto"><div style="height:300px"></div><button>Filter option</button></div>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "state",
          locator: { by: "role", role: "button", name: "Filter option" },
          state: "reachable",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("fails reachability when the actionable point is occluded", async () => {
    await page.setContent(
      `<button style="position:fixed;left:20px;top:20px;width:160px;height:40px">Filter option</button><div style="position:fixed;inset:0;background:white;z-index:2"></div>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "state",
          locator: { by: "role", role: "button", name: "Filter option" },
          state: "reachable",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toMatch(
      /Box before scroll .* actionable point .* blocker div .* overflow:/,
    );
  });

  it("checks bounded keyboard reachability", async () => {
    await page.setContent(`<button>First</button><button>Target</button>`);
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "keyboardReachable",
          locator: { by: "role", role: "button", name: "Target" },
          maxTabs: 2,
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
    expect(result.finding.evidence.join(" ")).toContain(
      "reached by keyboard after 2 Tab presses (limit 2)",
    );
    expect(
      await page.evaluate(() => document.activeElement === document.body),
    ).toBe(true);
  });

  it("fails keyboard reachability within the configured bound", async () => {
    await page.setContent(
      `<button>First</button><button>Second</button><button>Target</button>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "keyboardReachable",
          locator: { by: "role", role: "button", name: "Target" },
          maxTabs: 2,
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("within 2 Tab presses");
  });

  it("fails when a configured dialog remains visible after Escape", async () => {
    await page.setContent(`<div role="dialog">Choose a size</div>`);
    const result = await runScenario(
      page,
      baseScenario([
        { action: "press", key: "Escape" },
        {
          assert: "state",
          locator: { by: "role", role: "dialog", name: "Choose a size" },
          state: "hidden",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("assert state");
  });

  it("passes configured Escape dismissal", async () => {
    await page.setContent(
      `<div role="dialog" data-testid="size-dialog">Choose a size</div><script>document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('[role=dialog]').hidden = true })</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        { action: "press", key: "Escape" },
        {
          assert: "state",
          locator: { by: "testId", value: "size-dialog" },
          state: "hidden",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("atomically checks configured Escape dismissal", async () => {
    await page.setContent(
      `<div role="dialog" aria-label="Size"><button>Close</button></div><script>document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('[role=dialog]').remove() })</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "dismissedByEscape",
          locator: { by: "role", role: "dialog", name: "Size" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
    expect(result.finding.evidence.join(" ")).toContain(
      "before visible; after hidden or detached",
    );
  });

  it("does not accept a dialog that reopens after Escape", async () => {
    await page.setContent(
      `<div role="dialog" aria-label="Size">Choose a size</div><script>document.addEventListener('keydown', event => { if (event.key === 'Escape') { const dialog = document.querySelector('[role=dialog]'); dialog.hidden = true; setTimeout(() => dialog.hidden = false, 75) } })</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "dismissedByEscape",
          locator: { by: "role", role: "dialog", name: "Size" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
  });

  it("supports history-back target assertions", async () => {
    await page.goto("https://shop.example.com/start");
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        { action: "back" },
        { assert: "url", equals: "https://shop.example.com/start" },
        { assert: "visibleText", text: "First product" },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("supports bounded history-back transition assertions", async () => {
    await page.goto("https://shop.example.com/start");
    await page.getByRole("link", { name: "Next" }).click();
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "target" },
        { action: "back" },
        {
          assert: "navigation",
          from: "target",
          equals: "https://shop.example.com/start",
          errorText: "Something went wrong",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it.each([
    [
      "private subresource",
      `<button onclick="fetch('http://127.0.0.1/secret')">Unsafe</button>`,
    ],
    [
      "popup origin escape",
      `<a href="https://outside.test/secret" target="_blank">Unsafe</a>`,
    ],
  ])("blocks %s requests triggered by a click", async (_name, html) => {
    await page.setContent(html);
    const result = await runScenario(
      page,
      baseScenario([
        {
          action: "click",
          locator: {
            by: "role",
            role: /popup/.test(_name) ? "link" : "button",
            name: "Unsafe",
          },
        },
        { assert: "request", urlMatches: "https://shop.example.com/never" },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toMatch(
      /non-public network address|outside approved origins|internal hostnames/,
    );
  });

  it("detects a configured visible error boundary on HTTP 200", async () => {
    await page.setContent(`<main><p>Something went wrong</p></main>`);
    const result = await runScenario(
      page,
      baseScenario([{ assert: "absentText", text: "Something went wrong" }]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
  });
});
