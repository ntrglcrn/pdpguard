import { describe, expect, it } from "vitest";

import { parseProductJsonLd } from "@/lib/audit/json-ld";

describe("parseProductJsonLd", () => {
  it("parses Product data inside @graph", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "BreadcrumbList" },
          {
            "@type": ["Thing", "Product"],
            name: "Silk shirt",
            image: ["https://example.com/shirt.jpg"],
            offers: {
              "@type": "Offer",
              price: "129.00",
              availability: "https://schema.org/InStock",
            },
          },
        ],
      }),
    ]);

    expect(product).toMatchObject({
      type: "Product",
      name: true,
      image: true,
      offers: true,
      price: true,
      availability: true,
      availabilityValues: ["https://schema.org/InStock"],
    });
  });

  it("supports ProductGroup, offer arrays and priceSpecification", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "ProductGroup",
        name: "Lip color",
        image: "https://example.com/lip.jpg",
        offers: [{ priceSpecification: { price: 42 } }],
      }),
    ]);
    expect(product).toMatchObject({
      type: "ProductGroup",
      price: true,
      priceValues: ["42"],
    });
  });

  it("ignores malformed JSON-LD", () => {
    expect(parseProductJsonLd(["{ definitely not json"])).toEqual([]);
  });
});
