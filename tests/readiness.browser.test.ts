import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { runAuditWhenReady } from "@/lib/audit/engine";
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

describe("audit readiness", () => {
  it("waits for a delayed PDP before running normal rules", async () => {
    await page.setContent("<title>Loading…</title><main>Loading…</main>");
    await page.evaluate(() => {
      setTimeout(() => {
        document.title = "Silk Shirt";
        const canonical = document.createElement("link");
        canonical.rel = "canonical";
        canonical.href = "https://example.com/products/silk-shirt";
        document.head.append(canonical);
        const productData = document.createElement("script");
        productData.type = "application/ld+json";
        productData.text = JSON.stringify({
          "@type": "Product",
          name: "Silk Shirt",
          image: "https://example.com/shirt.jpg",
          offers: {
            price: "129",
            availability: "https://schema.org/InStock",
          },
        });
        document.head.append(productData);
        document.body.innerHTML = `
          <main><h1>Silk Shirt</h1>
          <img alt="Silk shirt" width="500" height="600"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='600'%3E%3Crect width='500' height='600'/%3E%3C/svg%3E">
          <p class="price">$129.00</p><button>Add to cart</button></main>`;
      }, 300);
    });

    const findings = await runAuditWhenReady(
      { page, mainResponse: null },
      { timeoutMs: 2_000, stabilityMs: 200 },
    );

    expect(findings).toHaveLength(12);
    expect(findings.filter((finding) => finding.status === "failed")).toEqual(
      [],
    );
  });

  it("returns one incomplete result for a permanent loader", async () => {
    await page.setContent("<title>Loading…</title><main>Loading…</main>");

    const findings = await runAuditWhenReady(
      { page, mainResponse: null },
      { timeoutMs: 350, stabilityMs: 150 },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "page-availability",
      status: "failed",
      severity: "critical",
    });
    expect(findings[0].evidence.join(" ")).toContain(
      "remaining PDP rules were not run",
    );
  });

  it("keeps an immediately ready PDP within the existing wait budget", async () => {
    const html = `
      <title>Silk Shirt</title><main><h1>Silk Shirt</h1>
      <p class="price">$129.00</p><button>Add to cart</button></main>
    `;
    await page.setContent(html);
    const expected = await runAuditRules({ page, mainResponse: null });
    await page.setContent(html);
    const startedAt = Date.now();

    const findings = await runAuditWhenReady(
      { page, mainResponse: null },
      { timeoutMs: 2_000 },
    );

    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(findings).toEqual(expected);
  });
});
