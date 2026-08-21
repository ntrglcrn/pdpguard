import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page, type Response } from "playwright";

import { runAuditRules } from "@/lib/audit/rules";
import { extractProductUrls } from "@/lib/category-discovery";

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
  it("extracts same-origin PDP links from a category fixture", async () => {
    await page.setContent(`
      <base href="https://shop.example/collections/shoes">
      <a href="/products/red-shoe">Red shoe</a>
      <a href="/item/42#details">Item 42</a>
      <a href="/p/blue-shirt">Blue shirt</a>
      <a href="/collections/sale">Sale</a>
      <a href="https://other.example/products/external">External</a>
      <a href="/item/42">Duplicate</a>
    `);

    await expect(extractProductUrls(page)).resolves.toEqual({
      urls: [
        "https://shop.example/products/red-shoe",
        "https://shop.example/item/42",
        "https://shop.example/p/blue-shirt",
      ],
      truncated: false,
    });
  });

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

  it("returns one finding for an access challenge instead of PDP noise", async () => {
    await page.setContent(`
      <title>Access denied</title>
      <main><h1>Verify you are human</h1><p>Complete the security verification to continue.</p></main>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "page-availability",
      status: "failed",
      severity: "critical",
    });
    expect(findings[0].evidence.join(" ")).toContain("access challenge");
  });

  it("returns one availability finding for an HTTP failure", async () => {
    await page.setContent("<title>Forbidden</title><main>Forbidden</main>");
    const mainResponse = { status: () => 403 } as Response;
    const findings = await runAuditRules({ page, mainResponse });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "page-availability",
      status: "failed",
      severity: "critical",
    });
    expect(findings[0].evidence[0]).toBe("Main response status: 403.");
  });

  it("does not reject a real PDP that mentions human verification", async () => {
    await page.setContent(`
      <title>Verified Product</title><main><h1>Verified Product</h1>
      <p class="price">$40</p><button>Add to cart</button>
      <p>Support may ask you to verify you are human.</p></main>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(findings[0]).toMatchObject({
      ruleId: "page-availability",
      status: "passed",
    });
    expect(findings).toHaveLength(7);
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
      findings
        .find((item) => item.ruleId === "purchase-cta")
        ?.evidence.join(" "),
    ).toContain("blocked");
  });

  it("dismisses an obvious first-session overlay before checking the CTA", async () => {
    await page.setContent(`
      <button style="margin:100px;width:180px;height:60px">Add to cart</button>
      <div role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:2;background:white">
        <p>Welcome offer</p><button onclick="this.parentElement.remove()" aria-label="Close">×</button>
      </div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "passed" });
  });

  it("does not confuse a bottom banner with a CTA below the fold", async () => {
    await page.setContent(`
      <div style="height:1200px">Product details</div>
      <button style="width:180px;height:60px">Add to cart</button>
      <div style="position:fixed;inset:auto 0 0;height:80px;background:white;z-index:2">Cookie banner</div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "passed" });
  });

  it("finds a CTA below the fold", async () => {
    await page.setContent(`
      <main><h1>Product</h1><p class="price">$12</p>
      <div style="height:1200px">Details</div>
      <button style="width:180px;height:60px">Add to cart</button></main>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "passed" });
  });

  it("dismisses a fullscreen popup with a text close button", async () => {
    await page.setContent(`
      <main><h1>Product</h1><p class="price">$12</p><button>Add to cart</button></main>
      <div role="dialog" style="position:fixed;inset:0;z-index:3;background:white">
        <button onclick="this.parentElement.remove()">Close</button>
      </div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "passed" });
  });

  it("dismisses a dialog with an unnamed icon cross", async () => {
    await page.setContent(`
      <main><h1>Product</h1><p class="price">$12</p><button>Add to cart</button></main>
      <div role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:3;background:white">
        <button class="welcome-dialog__close-btn" onclick="this.parentElement.remove()"
          style="position:absolute;right:12px;top:12px;width:40px;height:40px"><svg><use href="#cross"></use></svg></button>
        <button>Continue</button>
      </div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "passed" });
  });

  it("reports an undismissable fullscreen blocker", async () => {
    await page.setContent(`
      <main><h1>Product</h1><p class="price">$12</p><button>Add to cart</button></main>
      <div role="dialog" style="position:fixed;inset:0;z-index:3;background:white"><p>Choose region</p></div>
    `);
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "purchase-cta"),
    ).toMatchObject({ status: "failed", severity: "critical" });
  });

  it("prefers the primary CTA over recommendation controls", async () => {
    await page.setContent(`
      <main><h1>Primary product</h1><p class="price">$120</p>
        <button style="width:220px;height:48px">Add to cart</button>
        <section class="recommendation-carousel" style="margin-top:900px">
          <button aria-label="Add to cart" style="width:24px;height:24px"></button>
        </section>
      </main>
    `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "passed" });
    expect(finding?.evidence[0]).toContain("220 × 48px");
  });

  it("does not treat a primary CTA upsell hook as a recommendation", async () => {
    await page.setContent(`
      <main><h1>Primary product</h1><p class="price">$22</p>
        <button class="js-can-trigger-upsell" style="width:220px;height:48px">Add to bag $22</button>
      </main>
    `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "passed" });
    expect(finding?.evidence[0]).toContain("Add to bag $22");
  });

  it("ignores 200 small recommendation CTA icons", async () => {
    const recommendations = Array.from(
      { length: 200 },
      (_, index) =>
        `<button aria-label="Add to cart" style="position:absolute;left:${500 + index * 30}px;width:24px;height:24px"></button>`,
    ).join("");
    await page.setContent(`
        <main><h1>Primary product</h1><p class="price">$120</p>
          <button style="width:220px;height:48px">Choose shade</button>
          <section class="recommendation-carousel">${recommendations}</section>
        </main>
      `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "passed" });
    expect(finding?.evidence.join(" ")).toContain("variant gate");
    expect(finding?.evidence.join(" ")).toContain("Choose shade");
  }, 20_000);

  it("does not treat recommendation-only CTA icons as a purchase path", async () => {
    const recommendations = Array.from(
      { length: 200 },
      (_, index) =>
        `<button aria-label="Add to cart" style="position:absolute;left:${500 + index * 30}px;width:24px;height:24px"></button>`,
    ).join("");
    await page.setContent(`
      <main><h1>Primary product</h1><p class="price">$120</p>
        <section class="recommendation-carousel">${recommendations}</section>
      </main>
    `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "failed", severity: "critical" });
  });

  it.each(["Select size", "Choose shade", "Выберите размер"])(
    "passes the variant gate %s without clicking it",
    async (label) => {
      await page.setContent(`
        <main><h1>Product</h1><p class="price">$12</p>
          <button onclick="window.variantClicked=true" style="width:200px;height:44px">${label}</button>
        </main>
      `);
      const finding = (await runAuditRules({ page, mainResponse: null })).find(
        (item) => item.ruleId === "purchase-cta",
      );
      expect(finding).toMatchObject({ status: "passed", severity: "info" });
      expect(finding?.evidence.join(" ")).toContain("variant selection");
      expect(
        await page.evaluate(() =>
          Boolean(
            (window as typeof window & { variantClicked?: boolean })
              .variantClicked,
          ),
        ),
      ).toBe(false);
    },
  );

  it("passes an explicitly sold-out disabled CTA", async () => {
    await page.setContent(`
      <main><h1>Product</h1><p class="price">$12</p><div><p>Out of stock</p>
      <button disabled style="width:200px;height:44px">Add to cart</button></div></main>
    `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "passed", severity: "info" });
    expect(finding?.evidence.join(" ")).toContain("explicitly marked sold out");
  });

  it("uses Product availability for an explicit sold-out state", async () => {
    await page.setContent(`
      <script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/OutOfStock"}}</script>
      <main><h1>Product</h1><p class="price">$12</p><button disabled>Add to cart</button></main>
    `);
    const finding = (await runAuditRules({ page, mainResponse: null })).find(
      (item) => item.ruleId === "purchase-cta",
    );
    expect(finding).toMatchObject({ status: "passed", severity: "info" });
  });

  it("reports a visible broken image", async () => {
    await page.setContent(
      '<main>Product<img src="broken://image" style="display:block;width:300px;height:300px"></main>',
    );
    const findings = await runAuditRules({ page, mainResponse: null });
    expect(
      findings.find((item) => item.ruleId === "broken-images"),
    ).toMatchObject({ status: "failed" });
  });
});
