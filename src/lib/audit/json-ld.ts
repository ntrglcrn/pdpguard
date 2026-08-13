const MAX_JSON_LD_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;

export interface ProductStructuredData {
  type: "Product" | "ProductGroup";
  name: boolean;
  image: boolean;
  offers: boolean;
  price: boolean;
  availability: boolean;
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
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
}

function valuesOf(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function collectOfferData(record: JsonRecord) {
  const offers = valuesOf(record.offers);
  const priceValues: string[] = [];
  let hasPrice = false;
  let hasAvailability = false;

  for (const offer of offers) {
    if (
      offer.price !== undefined &&
      offer.price !== null &&
      offer.price !== ""
    ) {
      hasPrice = true;
      priceValues.push(String(offer.price));
    }
    if (offer.availability !== undefined) hasAvailability = true;

    for (const specification of valuesOf(offer.priceSpecification)) {
      if (
        specification.price !== undefined &&
        specification.price !== null &&
        specification.price !== ""
      ) {
        hasPrice = true;
        priceValues.push(String(specification.price));
      }
    }
  }

  return { offers, priceValues, hasPrice, hasAvailability };
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

      const { offers, priceValues, hasPrice, hasAvailability } =
        collectOfferData(record);
      products.push({
        type,
        name: typeof record.name === "string" && record.name.trim().length > 0,
        image:
          typeof record.image === "string" ||
          (Array.isArray(record.image) && record.image.length > 0) ||
          isRecord(record.image),
        offers: offers.length > 0,
        price: hasPrice,
        availability: hasAvailability,
        priceValues,
      });
    }
  }

  return products;
}
