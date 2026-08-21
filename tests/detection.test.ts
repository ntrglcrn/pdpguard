import { describe, expect, it } from "vitest";

import {
  findVisiblePriceText,
  matchesPurchaseCta,
  matchesVariantGate,
} from "@/lib/audit/detection";

describe("price detection", () => {
  it.each([
    "$129.00",
    "129 €",
    "£ 89",
    "49 990 ₸",
    "USD 25",
    "25 EUR",
    "GBP 50",
    "KZT 12 000",
    "Free",
  ])("detects %s", (value) =>
    expect(findVisiblePriceText([value])).toBeTruthy(),
  );

  it.each(["$undefined", "$NaN", "$0", "$0.00", "0 EUR"])(
    "rejects invalid price %s",
    (value) => expect(findVisiblePriceText([value])).toBeNull(),
  );

  it("does not confuse plain numbers with a price", () => {
    expect(
      findVisiblePriceText([
        "SKU 12345",
        "Available in 4 sizes",
        "Free shipping",
      ]),
    ).toBeNull();
  });
});

describe("purchase CTA detection", () => {
  it.each([
    "Add to cart",
    "ADD TO BAG",
    "Add to Basket",
    "Buy now",
    "Купить",
    "В корзину",
    "Добавить в корзину — M",
  ])("matches %s", (value) => expect(matchesPurchaseCta(value)).toBe(true));

  it("rejects unrelated copy", () =>
    expect(matchesPurchaseCta("View details")).toBe(false));

  it.each([
    "Select size",
    "Select A Size",
    "Choose shade",
    "Select color",
    "Выберите размер",
    "Выбрать оттенок",
  ])("matches variant gate %s", (value) =>
    expect(matchesVariantGate(value)).toBe(true),
  );
});
