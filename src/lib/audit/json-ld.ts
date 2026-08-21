const MAX_JSON_LD_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;

export interface ProductStructuredData {
  type: "Product" | "ProductGroup";
  name: boolean;
  image: boolean;
  offers: boolean;
  applicableOfferCount: number;
  completeOfferCount: number;
  completeOfferType: "Offer" | "AggregateOffer" | null;
  price: boolean;
  priceCurrency: boolean;
  availability: boolean;
  availabilityValues: string[];
  priceValues: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value: unknown, output: JsonRecord[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, output);
    return;
  }
  if (!isRecord(value)) return;

  output.push(value);
  if ("@graph" in value) walk(value["@graph"], output);
}

function typesOf(record: JsonRecord): string[] {
  const value = record["@type"];
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
  return values.map(
    (type) => type.match(/^https?:\/\/schema\.org\/([^/?#]+)$/i)?.[1] ?? type,
  );
}

function valuesOf(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasImage(value: unknown) {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.length > 0) ||
    isRecord(value)
  );
}

function collectOfferData(
  record: JsonRecord,
  type: "Product" | "ProductGroup",
) {
  const variantOffers =
    type === "ProductGroup"
      ? valuesOf(record.hasVariant)
          .filter(
            (variant) =>
              typesOf(variant).includes("Product") &&
              hasText(variant.name) &&
              hasImage(variant.image),
          )
          .flatMap((variant) => valuesOf(variant.offers))
      : [];
  const offers = [...valuesOf(record.offers), ...variantOffers]
    .map((offer) => {
      const offerType = typesOf(offer).find(
        (candidate): candidate is "Offer" | "AggregateOffer" =>
          candidate === "Offer" || candidate === "AggregateOffer",
      );
      if (!offerType) return null;

      if (offerType === "AggregateOffer") {
        return {
          type: offerType,
          price: hasValue(offer.lowPrice),
          priceCurrency: hasText(offer.priceCurrency),
          priceValue: hasValue(offer.lowPrice) ? String(offer.lowPrice) : null,
          availability: false,
          availabilityValue: null,
        };
      }

      const directPrice = hasValue(offer.price);
      const specifications = valuesOf(offer.priceSpecification);
      const pricedSpecification = specifications.find((specification) =>
        hasValue(specification.price),
      );
      const completeSpecification = specifications.find(
        (specification) =>
          hasValue(specification.price) && hasText(specification.priceCurrency),
      );
      const price = directPrice || Boolean(pricedSpecification);
      const priceCurrency = directPrice
        ? hasText(offer.priceCurrency)
        : Boolean(completeSpecification);
      const priceValue = directPrice
        ? String(offer.price)
        : pricedSpecification
          ? String(pricedSpecification.price)
          : null;

      return {
        type: offerType,
        price,
        priceCurrency,
        priceValue,
        availability: hasValue(offer.availability),
        availabilityValue: hasValue(offer.availability)
          ? String(offer.availability)
          : null,
      };
    })
    .filter((offer) => offer !== null);
  const priceValues: string[] = [];
  const availabilityValues: string[] = [];

  for (const offer of offers) {
    if (offer.priceValue !== null) priceValues.push(offer.priceValue);
    if (offer.availabilityValue !== null)
      availabilityValues.push(offer.availabilityValue);
  }
  const completeOffers = offers.filter(
    (offer) => offer.price && offer.priceCurrency,
  );

  return {
    offers,
    priceValues,
    availabilityValues,
    completeOffers,
  };
}

export function parseProductJsonLd(scripts: string[]): ProductStructuredData[] {
  const products: ProductStructuredData[] = [];

  for (const script of scripts) {
    if (Buffer.byteLength(script, "utf8") > MAX_JSON_LD_BYTES) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(script);
    } catch {
      continue;
    }

    const records: JsonRecord[] = [];
    walk(parsed, records);

    for (const record of records) {
      const type = typesOf(record).find(
        (candidate): candidate is "Product" | "ProductGroup" =>
          candidate === "Product" || candidate === "ProductGroup",
      );
      if (!type) continue;

      const { offers, completeOffers, priceValues, availabilityValues } =
        collectOfferData(record, type);
      const variants =
        type === "ProductGroup"
          ? valuesOf(record.hasVariant).filter((variant) =>
              typesOf(variant).includes("Product"),
            )
          : [];
      products.push({
        type,
        name: typeof record.name === "string" && record.name.trim().length > 0,
        image:
          hasImage(record.image) ||
          variants.some(
            (variant) => hasText(variant.name) && hasImage(variant.image),
          ),
        offers: offers.length > 0,
        applicableOfferCount: offers.length,
        completeOfferCount: completeOffers.length,
        completeOfferType: completeOffers[0]?.type ?? null,
        price: offers.some((offer) => offer.price),
        priceCurrency: completeOffers.length > 0,
        availability: completeOffers.some(
          (offer) => offer.type === "Offer" && offer.availability,
        ),
        availabilityValues,
        priceValues,
      });
    }
  }

  return products;
}
