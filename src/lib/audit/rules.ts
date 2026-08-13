import type { AuditRule, AuditRuleContext, Finding } from "@/domain/audit";
import {
  findVisiblePriceText,
  PURCHASE_CTA_LABELS,
} from "@/lib/audit/detection";
import { parseProductJsonLd } from "@/lib/audit/json-ld";

const finding = (value: Finding): Finding => value;

export const pageAvailabilityRule: AuditRule = async ({
  page,
  mainResponse,
}) => {
  const body = await page.evaluate(() => {
    const element = document.body;
    if (!element) return { visible: false, textLength: 0 };
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      visible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.height > 0,
      textLength: element.innerText.trim().length,
    };
  });
  const status = mainResponse?.status() ?? null;
  const passed =
    (status === null || status < 400) && body.visible && body.textLength > 0;

  return finding({
    id: "page-availability",
    ruleId: "page-availability",
    title: "Page availability",
    description: passed
      ? "The page responded and contains visible content."
      : "The page did not return usable visible content.",
    severity: passed ? "info" : "critical",
    status: passed ? "passed" : "failed",
    evidence: [
      status === null
        ? "No HTTP status was available."
        : `Main response status: ${status}.`,
      `Visible body text: ${body.textLength} characters.`,
    ],
    recommendation: passed
      ? "No action is required."
      : "Confirm the product URL is public and returns a successful HTML document.",
  });
};

export const pageTitleRule: AuditRule = async ({ page }) => {
  const title = (await page.title()).trim();
  const passed = title.length > 0;
  return finding({
    id: "page-title",
    ruleId: "page-title",
    title: "Page title",
    description: passed
      ? "The document has a page title."
      : "The document title is empty.",
    severity: "info",
    status: passed ? "passed" : "failed",
    evidence: [passed ? `Title: ${title}` : "No non-empty <title> was found."],
    recommendation: passed
      ? "No action is required."
      : "Add a concise product-specific title for usability and search visibility.",
  });
};

interface ImageSnapshot {
  src: string;
  alt: string;
  visible: boolean;
  inChrome: boolean;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  hasSrc: boolean;
}

async function imageSnapshots(
  context: AuditRuleContext,
): Promise<ImageSnapshot[]> {
  return context.page.evaluate(() =>
    Array.from(document.images).map((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        src: image.currentSrc || image.getAttribute("src") || "",
        alt: image.alt,
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0,
        inChrome: Boolean(
          image.closest("header, nav, [role='banner'], [role='navigation']"),
        ),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        complete: image.complete,
        hasSrc: Boolean(
          image.getAttribute("src") || image.getAttribute("srcset"),
        ),
      };
    }),
  );
}

export const productImageRule: AuditRule = async (context) => {
  const images = await imageSnapshots(context);
  const candidate = images
    .filter(
      (image) =>
        image.visible &&
        !image.inChrome &&
        image.width >= 180 &&
        image.height >= 180 &&
        image.width * image.height >= 40_000 &&
        image.naturalWidth >= 300 &&
        image.naturalHeight >= 300,
    )
    .sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];

  return finding({
    id: "product-image",
    ruleId: "product-image",
    title: "Product image",
    description: candidate
      ? "A large visible product image candidate was found."
      : "No large visible product image candidate was found.",
    severity: candidate ? "info" : "warning",
    status: candidate ? "passed" : "failed",
    evidence: candidate
      ? [
          `Rendered size: ${candidate.width} × ${candidate.height}px; natural size: ${candidate.naturalWidth} × ${candidate.naturalHeight}px.`,
          candidate.alt
            ? `Alt text: ${candidate.alt}`
            : "The candidate has empty alt text.",
        ]
      : [
          "No non-navigation image met the minimum size and visibility thresholds.",
        ],
    recommendation: candidate
      ? "No action is required."
      : "Ensure the primary product image loads at a prominent mobile size.",
  });
};

export const brokenImagesRule: AuditRule = async (context) => {
  const images = await imageSnapshots(context);
  const broken = images.filter(
    (image) =>
      image.visible &&
      (!image.hasSrc || (image.complete && image.naturalWidth === 0)),
  );

  return finding({
    id: "broken-images",
    ruleId: "broken-images",
    title: "Broken images",
    description:
      broken.length === 0
        ? "No visible broken images were found."
        : `${broken.length} visible image${broken.length === 1 ? "" : "s"} may be broken.`,
    severity: broken.length === 0 ? "info" : "warning",
    status: broken.length === 0 ? "passed" : "failed",
    evidence:
      broken.length === 0
        ? ["All visible images have a source and non-zero natural width."]
        : broken
            .slice(0, 5)
            .map((image) => image.src || "Visible image has an empty src."),
    recommendation:
      broken.length === 0
        ? "No action is required."
        : "Fix or remove image sources that fail to load for shoppers.",
  });
};

export const productPriceRule: AuditRule = async ({ page }) => {
  const texts = await page.evaluate(() => {
    const output = new Set<string>();
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    for (const element of document.querySelectorAll(
      "[itemprop='price'], [data-price], [class*='price' i], [id*='price' i]",
    )) {
      if (isVisible(element))
        output.add((element as HTMLElement).innerText || "");
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node: Node | null;
    let inspected = 0;
    while ((node = walker.nextNode()) && inspected < 5_000) {
      inspected += 1;
      const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const parent = node.parentElement;
      if (parent && text.length > 0 && text.length <= 80 && isVisible(parent))
        output.add(text);
    }

    return Array.from(output).slice(0, 5_000);
  });
  const price = findVisiblePriceText(texts);

  return finding({
    id: "product-price",
    ruleId: "product-price",
    title: "Visible product price",
    description: price
      ? "A visible currency-formatted price was found."
      : "No visible currency-formatted price was found.",
    severity: price ? "info" : "warning",
    status: price ? "passed" : "failed",
    evidence: [
      price
        ? `Visible price text: ${price}`
        : "No visible price candidate matched.",
    ],
    recommendation: price
      ? "No action is required."
      : "Display a clear product price near the primary purchase controls.",
  });
};

export const purchaseCtaRule: AuditRule = async ({ page }) => {
  const candidates = await page.evaluate((labels) => {
    const normalize = (value: string) =>
      value.replace(/\s+/g, " ").trim().toLowerCase();
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, [role='button'], input[type='button'], input[type='submit'], a",
      ),
    )
      .map((element) => {
        const text =
          element instanceof HTMLInputElement
            ? element.value
            : element.innerText || element.getAttribute("aria-label") || "";
        const normalized = normalize(text);
        if (
          !labels.some(
            (label) =>
              normalized === label || normalized.startsWith(`${label} `),
          )
        ) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0;
        const disabled =
          ("disabled" in element &&
            Boolean((element as HTMLButtonElement).disabled)) ||
          element.getAttribute("aria-disabled") === "true";
        const x = Math.min(
          Math.max(rect.left + rect.width / 2, 0),
          innerWidth - 1,
        );
        const y = Math.min(
          Math.max(rect.top + rect.height / 2, 0),
          innerHeight - 1,
        );
        const top = visible ? document.elementFromPoint(x, y) : null;
        const overlapped = Boolean(
          top && top !== element && !element.contains(top),
        );
        return { text: text.trim(), visible, disabled, overlapped };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);
  }, PURCHASE_CTA_LABELS);

  const usable = candidates.find(
    (candidate) =>
      candidate.visible && !candidate.disabled && !candidate.overlapped,
  );
  const visible = candidates.find((candidate) => candidate.visible);
  const passed = Boolean(usable);
  const reason =
    candidates.length === 0
      ? "No supported purchase CTA label was found."
      : !visible
        ? "A purchase CTA exists but is not visible."
        : visible.disabled
          ? `The visible CTA “${visible.text}” is disabled.`
          : visible.overlapped
            ? `The visible CTA “${visible.text}” is covered at its center point.`
            : `The CTA “${visible.text}” is usable.`;

  return finding({
    id: "purchase-cta",
    ruleId: "purchase-cta",
    title: "Purchase CTA",
    description: passed
      ? "A visible, enabled and unobstructed purchase CTA was found."
      : "The purchase CTA may prevent purchase on mobile.",
    severity: passed ? "info" : "critical",
    status: passed ? "passed" : "failed",
    evidence: [reason],
    recommendation: passed
      ? "No action is required."
      : "Make a supported purchase CTA visible, enabled and free from overlays.",
  });
};

export const structuredProductDataRule: AuditRule = async ({ page }) => {
  const scripts = await page
    .locator("script[type='application/ld+json']")
    .allTextContents();
  const products = parseProductJsonLd(scripts);
  const complete = products.find(
    (product) =>
      product.name && product.image && product.offers && product.price,
  );
  const passed = Boolean(complete);

  return finding({
    id: "structured-product-data",
    ruleId: "structured-product-data",
    title: "Structured product data",
    description: passed
      ? `A complete ${complete?.type} JSON-LD record was found.`
      : "Complete Product or ProductGroup JSON-LD was not found.",
    severity: passed ? "info" : "warning",
    status: passed ? "passed" : "failed",
    evidence: complete
      ? [
          "The record includes name, image, offers and a price or priceSpecification.",
          complete.availability
            ? "Offer availability is present."
            : "Offer availability is not present (optional for this check).",
        ]
      : products.length === 0
        ? ["No parseable Product or ProductGroup JSON-LD record was found."]
        : [
            "A product record exists but is missing name, image, offers or price.",
          ],
    recommendation: passed
      ? "No action is required."
      : "Add or repair Product JSON-LD with name, image and priced offers.",
  });
};

export const auditRules: AuditRule[] = [
  pageAvailabilityRule,
  pageTitleRule,
  productImageRule,
  brokenImagesRule,
  productPriceRule,
  purchaseCtaRule,
  structuredProductDataRule,
];

export async function runAuditRules(
  context: AuditRuleContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of auditRules) findings.push(await rule(context));
  return findings;
}
