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
              priceCurrency: "USD",
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
      applicableOfferCount: 1,
      completeOfferCount: 1,
      completeOfferType: "Offer",
      price: true,
      priceCurrency: true,
      availability: true,
      availabilityValues: ["https://schema.org/InStock"],
    });
  });

  it("keeps a priced Offer incomplete when priceCurrency is missing", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "Product",
        offers: { "@type": "Offer", price: 42 },
      }),
    ]);
    expect(product).toMatchObject({
      offers: true,
      price: true,
      priceCurrency: false,
      completeOfferCount: 0,
      priceValues: ["42"],
    });
  });

  it("keeps missing recommended availability separate from completeness", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "Product",
        offers: {
          "@type": "Offer",
          priceSpecification: { price: 42, priceCurrency: "USD" },
        },
      }),
    ]);
    expect(product).toMatchObject({
      completeOfferCount: 1,
      priceCurrency: true,
      availability: false,
    });
  });

  it("collects valid Offers from ProductGroup variants", () => {
    const [group] = parseProductJsonLd([
      JSON.stringify({
        "@type": "ProductGroup",
        name: "Lip color",
        hasVariant: [
          {
            "@type": "Product",
            name: "Lip color - Red",
            image: "https://example.com/red.jpg",
            offers: {
              "@type": "Offer",
              price: 42,
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
          },
        ],
      }),
    ]);
    expect(group).toMatchObject({
      type: "ProductGroup",
      image: true,
      completeOfferCount: 1,
      availability: true,
    });
  });

  it("does not treat OfferShippingDetails as a product Offer", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "Product",
        name: "Serum",
        image: "https://example.com/serum.jpg",
        offers: {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: 5,
            currency: "USD",
          },
        },
      }),
    ]);
    expect(product).toMatchObject({
      offers: false,
      applicableOfferCount: 0,
      completeOfferCount: 0,
    });
  });

  it("selects product nodes across separate JSON-LD blocks", () => {
    const products = parseProductJsonLd([
      JSON.stringify({ "@type": "Organization", name: "Shop" }),
      JSON.stringify({
        "@type": "Product",
        name: "Serum",
        image: "https://example.com/serum.jpg",
        offers: {
          "@type": "http://schema.org/Offer",
          price: 29,
          priceCurrency: "EUR",
        },
      }),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      completeOfferCount: 1,
      completeOfferType: "Offer",
    });
  });

  it("passes multiple Offers when one has a complete price and currency", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "Product",
        offers: [
          { "@type": "Offer", price: 10 },
          { "@type": "Offer", price: 12, priceCurrency: "USD" },
        ],
      }),
    ]);
    expect(product).toMatchObject({
      applicableOfferCount: 2,
      completeOfferCount: 1,
      priceCurrency: true,
    });
  });

  it("supports AggregateOffer lowPrice with priceCurrency", () => {
    const [product] = parseProductJsonLd([
      JSON.stringify({
        "@type": "Product",
        offers: {
          "@type": "AggregateOffer",
          lowPrice: 119,
          highPrice: 199,
          priceCurrency: "USD",
        },
      }),
    ]);
    expect(product).toMatchObject({
      completeOfferCount: 1,
      completeOfferType: "AggregateOffer",
      priceValues: ["119"],
    });
  });

  it("ignores malformed JSON-LD", () => {
    expect(parseProductJsonLd(["{ definitely not json"])).toEqual([]);
  });
});
