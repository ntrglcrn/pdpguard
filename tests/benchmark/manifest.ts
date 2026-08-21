import type { FindingStatus } from "@/domain/audit";

const productImage = `
  <img alt="Black silk shirt" width="500" height="600"
    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='600'%3E%3Crect width='500' height='600' fill='%23333'/%3E%3C/svg%3E">
`;

const productJsonLd = `
  <script type="application/ld+json">{
    "@type":"Product","name":"Silk Shirt","image":"https://example.com/shirt.jpg",
    "offers":{"price":"129","availability":"https://schema.org/InStock"}
  }</script>
`;

const completePdp = `
  <!doctype html><html><head><title>Silk Shirt</title>${productJsonLd}</head><body>
  <main><h1>Silk Shirt</h1>${productImage}
  <p class="price">$129.00</p><button>Add to cart</button></main>
  </body></html>
`;

export const benchmarkRuleIds = [
  "page-availability",
  "page-title",
  "product-image",
  "broken-images",
  "product-price",
  "purchase-cta",
  "structured-product-data",
] as const;

export type BenchmarkRuleId = (typeof benchmarkRuleIds)[number];

interface BenchmarkCase {
  name: string;
  control: "positive" | "negative" | "regression";
  html: string;
  expected: {
    ruleId: BenchmarkRuleId;
    status: FindingStatus;
    evidenceIncludes?: string;
  };
}

export const benchmarkCases = [
  ...benchmarkRuleIds.map((ruleId): BenchmarkCase => ({
    name: `${ruleId}/negative-control/complete-pdp`,
    control: "negative",
    html: completePdp,
    expected: { ruleId, status: "passed" },
  })),
  {
    name: "page-availability/positive-control/empty-page",
    control: "positive",
    html: "<!doctype html><html><body></body></html>",
    expected: { ruleId: "page-availability", status: "failed" },
  },
  {
    name: "page-title/positive-control/missing-title",
    control: "positive",
    html: "<main>Product details</main>",
    expected: { ruleId: "page-title", status: "failed" },
  },
  {
    name: "product-image/positive-control/missing-product-image",
    control: "positive",
    html: "<main><h1>Silk Shirt</h1><p>$129.00</p></main>",
    expected: { ruleId: "product-image", status: "failed" },
  },
  {
    name: "broken-images/positive-control/visible-broken-image",
    control: "positive",
    html: '<main>Silk Shirt<img src="broken://image" style="display:block;width:300px;height:300px"></main>',
    expected: { ruleId: "broken-images", status: "failed" },
  },
  {
    name: "broken-images/regression/empty-src-lazy-placeholder",
    control: "regression",
    html: '<main><img src="" data-src="https://example.com/product.jpg" style="display:block;width:300px;height:300px"></main>',
    expected: { ruleId: "broken-images", status: "passed" },
  },
  {
    name: "product-price/positive-control/missing-visible-price",
    control: "positive",
    html: "<main><h1>Silk Shirt</h1><button>Add to cart</button></main>",
    expected: { ruleId: "product-price", status: "failed" },
  },
  {
    name: "purchase-cta/positive-control/disabled-cta",
    control: "positive",
    html: "<main><h1>Silk Shirt</h1><p>$129.00</p><button disabled>Add to cart</button></main>",
    expected: { ruleId: "purchase-cta", status: "failed" },
  },
  {
    name: "structured-product-data/positive-control/missing-json-ld",
    control: "positive",
    html: "<main><h1>Silk Shirt</h1><p>$129.00</p></main>",
    expected: { ruleId: "structured-product-data", status: "failed" },
  },
  {
    name: "purchase-cta/regression/add-to-basket-label",
    control: "regression",
    html: "<main><button>Add to Basket</button></main>",
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/dismissible-first-session-overlay",
    control: "regression",
    html: `
      <button style="margin:100px;width:180px;height:60px">Add to cart</button>
      <div role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:2;background:white">
        <button onclick="this.parentElement.remove()" aria-label="Close">×</button>
      </div>
    `,
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/text-close-overlay",
    control: "regression",
    html: `
      <button>Add to cart</button>
      <div role="dialog" style="position:fixed;inset:0;z-index:2;background:white">
        <button onclick="this.parentElement.remove()">Close</button>
      </div>
    `,
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/anonymous-icon-overlay-close",
    control: "regression",
    html: `
      <button>Add to cart</button>
      <div role="dialog" aria-modal="true" style="position:fixed;inset:0;z-index:2;background:white">
        <button class="dialog-close" onclick="this.parentElement.remove()"
          style="position:absolute;right:12px;top:12px;width:40px;height:40px"><svg><use href="#cross"></use></svg></button>
      </div>
    `,
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/edge-banner-overlap",
    control: "regression",
    html: `
      <div style="height:1200px">Product details</div>
      <button style="width:180px;height:60px">Add to cart</button>
      <div style="position:fixed;inset:auto 0 0;height:80px;background:white;z-index:2">Cookie banner</div>
    `,
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/below-fold-cta",
    control: "regression",
    html: `
      <div style="height:1200px">Product details</div>
      <button style="width:180px;height:60px">Add to cart</button>
    `,
    expected: { ruleId: "purchase-cta", status: "passed" },
  },
  {
    name: "purchase-cta/regression/undismissable-region-gate",
    control: "regression",
    html: `
      <button>Add to cart</button>
      <div role="dialog" style="position:fixed;inset:0;z-index:2;background:white">Choose region</div>
    `,
    expected: { ruleId: "purchase-cta", status: "failed" },
  },
  {
    name: "purchase-cta/regression/primary-over-recommendation-control",
    control: "regression",
    html: `
      <main><h1>Product</h1><button style="width:220px;height:48px">Add to cart</button>
        <section class="recommendation-carousel"><button aria-label="Add to cart" style="width:24px;height:24px"></button></section>
      </main>
    `,
    expected: {
      ruleId: "purchase-cta",
      status: "passed",
      evidenceIncludes: "220 × 48px",
    },
  },
  {
    name: "purchase-cta/regression/variant-gate-over-recommendation-icons",
    control: "regression",
    html: `
      <main><h1>Product</h1><button style="width:220px;height:48px">Choose shade</button>
        <section class="recommendation-carousel"><button aria-label="Add to cart" style="width:24px;height:24px"></button></section>
      </main>
    `,
    expected: {
      ruleId: "purchase-cta",
      status: "passed",
      evidenceIncludes: "variant gate",
    },
  },
  {
    name: "purchase-cta/regression/recommendation-icons-only",
    control: "regression",
    html: `
      <main><h1>Product</h1><section class="recommendation-carousel">
        <button aria-label="Add to cart" style="width:24px;height:24px"></button>
      </section></main>
    `,
    expected: { ruleId: "purchase-cta", status: "failed" },
  },
  {
    name: "purchase-cta/regression/russian-variant-gate-label",
    control: "regression",
    html: '<main><button style="width:200px;height:44px">Выберите размер</button></main>',
    expected: {
      ruleId: "purchase-cta",
      status: "passed",
      evidenceIncludes: "variant gate",
    },
  },
  {
    name: "purchase-cta/regression/sold-out-nearby-text",
    control: "regression",
    html: "<main><div>Out of stock<button disabled>Add to cart</button></div></main>",
    expected: {
      ruleId: "purchase-cta",
      status: "passed",
      evidenceIncludes: "explicitly marked sold out",
    },
  },
  {
    name: "purchase-cta/regression/sold-out-json-ld-availability",
    control: "regression",
    html: `
      <script type="application/ld+json">{"@type":"Product","offers":{"availability":"https://schema.org/OutOfStock"}}</script>
      <main><button disabled>Add to cart</button></main>
    `,
    expected: {
      ruleId: "purchase-cta",
      status: "passed",
      evidenceIncludes: "explicitly marked sold out",
    },
  },
] satisfies BenchmarkCase[];
