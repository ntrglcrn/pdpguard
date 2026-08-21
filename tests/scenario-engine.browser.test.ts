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
        body: `<html><head><link rel="canonical" href="https://shop.example.com${url.pathname}"></head><body><main><h1>${url.pathname === "/next" ? "Next product" : "First product"}</h1><span data-testid="sku">${url.pathname === "/next" ? "2" : "1"}</span><span data-testid="product-id">${url.pathname === "/next" ? "product-2" : "product-1"}</span><a href="/next?sku=2&token=secret">Next</a><button onclick="fetch('/api/product?sku=2')">Load</button><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: url.pathname === "/next" ? "Next product" : "First product", sku: url.pathname === "/next" ? "2" : "1", productID: url.pathname === "/next" ? "product-2" : "product-1", url: `https://shop.example.com${url.pathname}` })}</script></main></body></html>`,
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
        { assert: "fingerprintChanged", from: "before" },
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
        { assert: "fingerprintChanged", from: "before" },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain(
      "Clicked role=button name=Next",
    );
    expect(result.finding.evidence.join(" ")).toContain("sku=2");
  });

  it("asserts a completed URL and main-content transition", async () => {
    await page.goto("https://shop.example.com/start");
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "url", name: "source_url" },
        { capture: "fingerprint", name: "source_content" },
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        {
          assert: "navigationCompleted",
          urlMatches: "https://shop.example.com/next*",
        },
        { assert: "urlChanged", from: "source_url" },
        { assert: "mainContentChanged", from: "source_content" },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("captures product identity from the clicked target URL", async () => {
    await page.goto("https://shop.example.com/start");
    const result = await runScenario(
      page,
      baseScenario([
        {
          capture: "linkTarget",
          name: "target_sku",
          locator: { by: "role", role: "link", name: "Next" },
          part: { query: "sku" },
        },
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        {
          assert: "capturedValue",
          locator: { by: "testId", value: "sku" },
          source: "text",
          equalsCapture: "target_sku",
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

  it("verifies every supported product identity source", async () => {
    await page.goto("https://shop.example.com/next");
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "productIdentity",
          kind: "title",
          expected: "Next product",
          locator: { by: "role", role: "heading", name: "Next product" },
        },
        {
          assert: "productIdentity",
          kind: "sku",
          expected: "2",
          locator: { by: "testId", value: "sku" },
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
          expected: "https://shop.example.com/next",
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

  it("scrolls a configured descendant into a reachable position", async () => {
    await page.setContent(
      `<div style="height:80px;overflow:auto"><div style="height:300px"></div><button>Filter option</button></div>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "reachability",
          locator: { by: "role", role: "button", name: "Filter option" },
          check: "notCovered",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("reports deterministic reachability facets", async () => {
    await page.setContent(
      `<div style="height:80px;overflow:auto"><div style="height:300px"></div><button><span>Filter option</span></button></div>`,
    );
    const locator = {
      by: "role" as const,
      role: "button" as const,
      name: "Filter option",
    };
    const result = await runScenario(
      page,
      baseScenario([
        { assert: "reachability", locator, check: "scrollableIntoView" },
        { assert: "reachability", locator, check: "notCovered" },
        { assert: "reachability", locator, check: "centerClickable" },
        { assert: "reachability", locator, check: "reachable" },
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
          assert: "reachability",
          locator: { by: "role", role: "button", name: "Filter option" },
          check: "notCovered",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toMatch(
      /Box .* actionable point .* overflow:/,
    );
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
      `<div role="dialog" aria-label="Choose a size" data-testid="size-dialog">Choose a size</div><script>document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('[role=dialog]').hidden = true })</script>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "escapeClosesDialog",
          locator: { by: "role", role: "dialog", name: "Choose a size" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });

  it("fails when Escape does not close the configured dialog", async () => {
    await page.setContent(
      `<div role="dialog" aria-label="Choose a size">Choose a size</div>`,
    );
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "escapeClosesDialog",
          locator: { by: "role", role: "dialog", name: "Choose a size" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("failed");
    expect(result.finding.evidence.join(" ")).toContain("close after Escape");
  });

  it("supports history-back target assertions", async () => {
    await page.goto("https://shop.example.com/start");
    const result = await runScenario(
      page,
      baseScenario([
        { capture: "fingerprint", name: "start_content" },
        {
          action: "click",
          locator: { by: "role", role: "link", name: "Next" },
        },
        { action: "back" },
        {
          assert: "historyBack",
          url: "https://shop.example.com/start",
          contentFrom: "start_content",
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
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

  it("asserts that a configured error page appeared", async () => {
    await page.setContent(`<main><h1>Page unavailable</h1></main>`);
    const result = await runScenario(
      page,
      baseScenario([
        {
          assert: "errorPage",
          locator: { by: "role", role: "heading", name: "Page unavailable" },
        },
      ]),
      { resolver },
    );

    expect(result.finding.status).toBe("passed");
  });
});
