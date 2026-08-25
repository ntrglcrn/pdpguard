import type { Finding } from "@/domain/audit";

type FindingPresentation = { category: string; impact: string };

const fallback: FindingPresentation = {
  category: "Page quality",
  impact:
    "May affect the shopper experience or the quality of the product page.",
};

const presentationByRuleId: Record<string, FindingPresentation> = {
  "page-availability": {
    category: "Page quality",
    impact: "Shoppers may be unable to access or use the product page.",
  },
  "page-title": {
    category: "SEO / Discoverability",
    impact:
      "May make the product page harder to identify in browsers and search results.",
  },
  "canonical-url": {
    category: "SEO / Discoverability",
    impact: "Search engines may receive an unclear preferred product URL.",
  },
  "robots-indexing": {
    category: "SEO / Discoverability",
    impact: "Search engines may be prevented from indexing the product page.",
  },
  "share-url-integrity": {
    category: "Page quality",
    impact: "Shoppers may be unable to share a working product link.",
  },
  "product-image": {
    category: "Media",
    impact: "Product presentation may be incomplete for shoppers.",
  },
  "product-image-alt-text": {
    category: "Accessibility",
    impact: "Reduces accessibility of the primary product image.",
  },
  "broken-images": {
    category: "Media",
    impact: "Product presentation may be incomplete for shoppers.",
  },
  "product-price": {
    category: "Product data",
    impact: "Shoppers may be unable to understand the current product price.",
  },
  "variant-label-integrity": {
    category: "Product data",
    impact:
      "Shoppers may have difficulty understanding or selecting a product variant.",
  },
  "purchase-cta": {
    category: "Purchase",
    impact: "Can prevent or complicate the shopper’s path to purchase.",
  },
  "structured-product-data": {
    category: "SEO / Discoverability",
    impact: "Search engines may receive incomplete product information.",
  },
};

export function findingPresentation(ruleId: string): FindingPresentation {
  return presentationByRuleId[ruleId] ?? fallback;
}

export function failuresFirst(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => Number(a.status === "passed") - Number(b.status === "passed"),
  );
}
