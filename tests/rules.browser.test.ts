import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { runAuditRules } from "@/lib/audit/rules";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});

afterAll(async () => {
  await browser.close();
});

describe("browser audit rules", () => {
  it("passes a complete local PDP fixture and produces a screenshot", async () => {
    await page.setContent(`
      <!doctype html><html><head><title>Silk Shirt</title>
      <script type="application/ld+json">{
        "@type":"Product","name":"Silk Shirt","image":"https://example.com/shirt.jpg",
        "offers":{"price":"129","availability":"https://schema.org/InStock"}
      }</script></head><body>
      <main><h1>Silk Shirt</h1>
      <img alt="Black silk shirt" width="500" height="600"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='600'%3E%3Crect width='500' height='600' fill='%23333'/%3E%3C/svg%3E">
      <p class="price">$129.00</p><button>Add to cart</button></main>
      </body></html>
    `);
    await page
      .locator("img")
      .evaluate((image: HTMLImageElement) => image.decode());
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(findings.filter((item) => item.status === "failed")).toEqual([]);
    expect(
      (await page.screenshot({ fullPage: true })).byteLength,
    ).toBeGreaterThan(1_000);
  });

  it("reports a disabled purchase CTA", async () => {
    await page.setContent(
      "<title>Product</title><main><p>$12</p><button disabled>Add to cart</button></main>",
    );
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({
      status: "failed",
      severity: "critical",
    });
  });

  it("reports an overlapped purchase CTA", async () => {
    await page.setContent(`
      <style>#cover{position:fixed;inset:0;z-index:2}</style>
      <button style="margin:100px;width:180px;height:60px">Add to cart</button><div id="cover"></div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "purchase-cta")?.evidence[0],
    ).toContain("covered");
  });

  it("reports a visible broken image", async () => {
    await page.setContent(
      '<img src="broken://image" style="display:block;width:300px;height:300px">',
    );
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "broken-images"),
    ).toMatchObject({ status: "failed" });
  });
});
