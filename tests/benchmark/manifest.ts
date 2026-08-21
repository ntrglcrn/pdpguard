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
  <!doctype html><html><head><title>Silk Shirt</title>
  <link rel="canonical" href="https://example.com/products/silk-shirt">${productJsonLd}</head><body>
  <main><h1>Silk Shirt</h1>${productImage}
  <p class="price">$129.00</p><button>Add to cart</button></main>
  </body></html>
`;

export const benchmarkRuleIds = [
  "page-availability",
  "page-title",
  "canonical-url",
  "robots-indexing",
  "share-url-integrity",
  "product-image",
  "product-image-alt-text",
  "broken-images",
  "product-price",
  "variant-label-integrity",
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
    name: "canonical-url/positive-control/missing-canonical",
    control: "positive",
    html: "<head><title>Silk Shirt</title></head><main>Product details</main>",
    expected: { ruleId: "canonical-url", status: "failed" },
  },
  {
    name: "robots-indexing/positive-control/meta-noindex",
    control: "positive",
    html: '<head><meta name="robots" content="noindex"></head><main>Silk Shirt</main>',
    expected: { ruleId: "robots-indexing", status: "failed" },
  },
  {
    name: "robots-indexing/regression/meta-none",
    control: "regression",
    html: '<head><meta name="robots" content="none"></head><main>Silk Shirt</main>',
    expected: {
      ruleId: "robots-indexing",
      status: "failed",
      evidenceIncludes: "none",
    },
  },
  {
    name: "robots-indexing/regression/conflicting-multiple-meta-directives",
    control: "regression",
    html: '<head><meta name="robots" content="all"><meta name="robots" content="nofollow, noindex"></head><main>Silk Shirt</main>',
    expected: {
      ruleId: "robots-indexing",
      status: "failed",
      evidenceIncludes: "conflicting all and noindex",
    },
  },
  {
    name: "share-url-integrity/positive-control/undefined-query-value",
    control: "positive",
    html: '<main><a aria-label="Share on X" href="https://x.com/intent/post?url=undefined">Share</a></main>',
    expected: { ruleId: "share-url-integrity", status: "failed" },
  },
  {
    name: "share-url-integrity/regression/null-path-segment",
    control: "regression",
    html: '<main><a href="https://www.facebook.com/sharer/sharer.php?u=https://shop.example/products/null">Facebook</a></main>',
    expected: { ruleId: "share-url-integrity", status: "failed" },
  },
  {
    name: "share-url-integrity/regression/unresolved-encoded-segment",
    control: "regression",
    html: '<main><a data-share href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fshop.example%2Fproducts%2F%5Bhandle%5D">LinkedIn</a></main>',
    expected: { ruleId: "share-url-integrity", status: "failed" },
  },
  {
    name: "share-url-integrity/negative-control/resolved-product-url",
    control: "negative",
    html: '<main><a aria-label="Share on X" href="https://x.com/intent/post?url=https%3A%2F%2Fshop.example%2Fproducts%2Fsilk-shirt">Share</a></main>',
    expected: { ruleId: "share-url-integrity", status: "passed" },
  },
  {
    name: "share-url-integrity/regression/hidden-placeholder-clone",
    control: "regression",
    html: `
      <main>
        <a aria-label="Share on X" href="https://x.com/intent/post?url=https://shop.example/products/shirt">Share</a>
        <a hidden aria-label="Share on X" href="https://x.com/intent/post?url=undefined">Share</a>
      </main>
    `,
    expected: { ruleId: "share-url-integrity", status: "passed" },
  },
  {
    name: "share-url-integrity/regression/click-share-is-out-of-scope",
    control: "regression",
    html: '<main><button aria-label="Share product">Share</button></main>',
    expected: { ruleId: "share-url-integrity", status: "passed" },
  },
  {
    name: "product-image/positive-control/missing-product-image",
    control: "positive",
    html: "<main><h1>Silk Shirt</h1><p>$129.00</p></main>",
    expected: { ruleId: "product-image", status: "failed" },
  },
  {
    name: "product-image-alt-text/positive-control/empty-primary-image-alt",
    control: "positive",
    html: `
      <main><img alt="" width="500" height="600"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='600'%3E%3Crect width='500' height='600' fill='%23333'/%3E%3C/svg%3E"></main>
    `,
    expected: { ruleId: "product-image-alt-text", status: "failed" },
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
  ...["$undefined", "$NaN", "$0.00"].map((price): BenchmarkCase => ({
    name: `product-price/positive-control/invalid-${price.slice(1).toLowerCase().replace(".", "-")}`,
    control: "positive",
    html: `<main><p class="price">${price}</p></main>`,
    expected: { ruleId: "product-price", status: "failed" },
  })),
  {
    name: "product-price/negative-control/free",
    control: "negative",
    html: '<main><p class="price">Free</p></main>',
    expected: {
      ruleId: "product-price",
      status: "passed",
      evidenceIncludes: "Free",
    },
  },
  {
    name: "variant-label-integrity/positive-control/duplicate-within-group",
    control: "positive",
    html: `
      <main><fieldset><legend>Size</legend>
        <label><input type="radio" name="size" value="m-1">M</label>
        <label><input type="radio" name="size" value="m-2">M</label>
      </fieldset></main>
    `,
    expected: {
      ruleId: "variant-label-integrity",
      status: "failed",
      evidenceIncludes: "repeats label “M” 2 times",
    },
  },
  {
    name: "variant-label-integrity/negative-control/unique-within-group",
    control: "negative",
    html: `
      <main><fieldset><legend>Size</legend>
        <label><input type="radio" name="size" value="s">S</label>
        <label><input type="radio" name="size" value="m">M</label>
      </fieldset></main>
    `,
    expected: { ruleId: "variant-label-integrity", status: "passed" },
  },
  {
    name: "variant-label-integrity/regression/same-label-across-groups",
    control: "regression",
    html: `
      <main>
        <fieldset><legend>Size</legend>
          <label><input type="radio" name="size" value="one">One size</label>
          <label><input type="radio" name="size" value="large">Large</label>
        </fieldset>
        <fieldset><legend>Pack</legend>
          <label><input type="radio" name="pack" value="one">One size</label>
          <label><input type="radio" name="pack" value="double">Double</label>
        </fieldset>
      </main>
    `,
    expected: { ruleId: "variant-label-integrity", status: "passed" },
  },
  {
    name: "variant-label-integrity/regression/hidden-responsive-clone",
    control: "regression",
    html: `
      <main><fieldset><legend>Size</legend>
        <label><input type="radio" name="size" value="s">S</label>
        <label><input type="radio" name="size" value="m">M</label>
        <div style="display:none">
          <label><input type="radio" name="size-clone" value="s">S</label>
        </div>
      </fieldset></main>
    `,
    expected: { ruleId: "variant-label-integrity", status: "passed" },
  },
  {
    name: "variant-label-integrity/regression/duplicate-select-options",
    control: "regression",
    html: `
      <main><select aria-label="Color">
        <option>Black</option><option>Black</option>
      </select></main>
    `,
    expected: { ruleId: "variant-label-integrity", status: "failed" },
  },
  {
    name: "variant-label-integrity/regression/size-order-is-out-of-scope",
    control: "regression",
    html: `
      <main><fieldset><legend>Size</legend>
        <label><input type="radio" name="size" value="xl">XL</label>
        <label><input type="radio" name="size" value="s">S</label>
        <label><input type="radio" name="size" value="m">M</label>
      </fieldset></main>
    `,
    expected: { ruleId: "variant-label-integrity", status: "passed" },
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
