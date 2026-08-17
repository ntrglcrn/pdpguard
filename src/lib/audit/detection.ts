export const PURCHASE_CTA_LABELS = [
  "add to cart",
  "add to bag",
  "add to basket",
  "buy now",
  "купить",
  "в корзину",
  "добавить в корзину",
] as const;

export const VARIANT_GATE_LABELS = [
  "select size",
  "select a size",
  "choose size",
  "choose a size",
  "select shade",
  "select a shade",
  "choose shade",
  "choose a shade",
  "select color",
  "select a color",
  "choose color",
  "choose a color",
  "выберите размер",
  "выбрать размер",
  "выберите оттенок",
  "выбрать оттенок",
  "выберите цвет",
  "выбрать цвет",
] as const;

export const PURCHASE_INQUIRY_LABELS = [
  "оставить заявку",
  "send inquiry",
] as const;

const PRICE_PATTERN =
  /(?:[$€£₸]\s*\d[\d\s.,]*|\d[\d\s.,]*\s*(?:[$€£₸]|(?:USD|EUR|GBP|KZT)\b)|\b(?:USD|EUR|GBP|KZT)\s*\d[\d\s.,]*)/iu;

export function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function matchesPurchaseCta(value: string): boolean {
  const normalized = normalizeLabel(value);
  return PURCHASE_CTA_LABELS.some(
    (label) => normalized === label || normalized.startsWith(`${label} `),
  );
}

export function matchesVariantGate(value: string): boolean {
  const normalized = normalizeLabel(value);
  return VARIANT_GATE_LABELS.some(
    (label) => normalized === label || normalized.startsWith(`${label} `),
  );
}

export function matchesPurchaseInquiry(value: string): boolean {
  const normalized = normalizeLabel(value);
  return PURCHASE_INQUIRY_LABELS.some(
    (label) => normalized === label || normalized.startsWith(`${label} `),
  );
}

export function findVisiblePriceText(texts: string[]): string | null {
  for (const text of texts) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (
      normalized.length > 0 &&
      normalized.length <= 80 &&
      PRICE_PATTERN.test(normalized)
    ) {
      return normalized.match(PRICE_PATTERN)?.[0] ?? normalized;
    }
  }
  return null;
}
