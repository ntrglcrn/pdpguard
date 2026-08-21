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
  control: "positive" | "negative";
  html: string;
  expected: {
    ruleId: BenchmarkRuleId;
    status: FindingStatus;
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
] satisfies BenchmarkCase[];
