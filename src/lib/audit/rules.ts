import type { AuditRule, AuditRuleContext, Finding } from "@/domain/audit";
import {
  findVisiblePriceText,
  PURCHASE_CTA_LABELS,
  VARIANT_GATE_LABELS,
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
      image.hasSrc &&
      image.complete &&
      image.naturalWidth === 0,
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
        ? ["No visible image with a source has zero natural width."]
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
  const scripts = await page
    .locator("script[type='application/ld+json']")
    .allTextContents();
  const structuredSoldOut = parseProductJsonLd(scripts).some((product) =>
    product.availabilityValues.some((value) =>
      /(?:outofstock|soldout|discontinued)$/i.test(value),
    ),
  );

  const selected = await page.evaluate(
    async ({ directLabels, gateLabels, structuredSoldOut }) => {
      const normalize = (value: string) =>
        value.replace(/\s+/g, " ").trim().toLowerCase();
      const labelOf = (element: HTMLElement) =>
        element instanceof HTMLInputElement
          ? element.value
          : element.innerText ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            "";
      const matches = (value: string, labels: readonly string[]) => {
        const normalized = normalize(value);
        return labels.some(
          (label) => normalized === label || normalized.startsWith(`${label} `),
        );
      };
      const rendered = (element: HTMLElement) => {
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
      const center = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 + scrollX,
          y: rect.top + rect.height / 2 + scrollY,
        };
      };
      const pricePattern =
        /(?:[$€£₸]\s*\d|\d[\d\s.,]*\s*(?:[$€£₸]|USD|EUR|GBP|KZT)\b|\b(?:USD|EUR|GBP|KZT)\s*\d)/iu;
      const h1 = Array.from(document.querySelectorAll<HTMLElement>("h1")).find(
        rendered,
      );
      const price = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[itemprop='price'], [data-price], [class*='price' i], [id*='price' i]",
        ),
      ).find(
        (element) => rendered(element) && pricePattern.test(element.innerText),
      );
      const mainImage = Array.from(document.images)
        .filter(
          (image) =>
            rendered(image) &&
            !image.closest("header, nav, [role='banner'], [role='navigation']"),
        )
        .sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return b.width * b.height - a.width * a.height;
        })[0];
      const anchors = [h1, price, mainImage]
        .filter((element): element is HTMLElement => Boolean(element))
        .map(center);

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "button, [role='button'], input[type='button'], input[type='submit'], a",
        ),
      )
        .map((element) => {
          const label = labelOf(element).trim();
          const type = matches(label, directLabels)
            ? ("direct CTA" as const)
            : matches(label, gateLabels)
              ? ("variant gate" as const)
              : null;
          if (!type) return null;

          const rect = element.getBoundingClientRect();
          const point = center(element);
          const ancestry = Array.from(
            (function* () {
              let current: HTMLElement | null = element;
              for (let depth = 0; current && depth < 8; depth += 1) {
                yield current;
                current = current.parentElement;
              }
            })(),
          )
            .map((node) => `${node.id} ${node.className}`)
            .join(" ");
          const recommendation =
            /recommend|related|similar|carousel|slider|swiper|upsell|cross.?sell|product.?card/i.test(
              ancestry,
            );
          const outside = rect.right <= 0 || rect.left >= innerWidth;
          const ariaOnly =
            !(element.innerText || "").trim() &&
            Boolean(element.getAttribute("aria-label"));
          const small = rect.width < 80 || rect.height < 28;
          const distance =
            anchors.length > 0
              ? Math.min(
                  ...anchors.map((anchor) =>
                    Math.hypot(point.x - anchor.x, point.y - anchor.y),
                  ),
                )
              : point.y;
          const score =
            2_000 -
            distance -
            (recommendation ? 1_500 : 0) -
            (outside ? 1_500 : 0) -
            (ariaOnly && small ? 1_000 : 0) -
            (!rendered(element) ? 1_500 : 0) +
            (type === "direct CTA" ? 50 : 0);
          return {
            element,
            label,
            type,
            score,
            primaryEligible:
              !recommendation && !outside && !(ariaOnly && small),
          };
        })
        .filter(
          (
            candidate,
          ): candidate is {
            element: HTMLElement;
            label: string;
            type: "direct CTA" | "variant gate";
            score: number;
            primaryEligible: boolean;
          } => Boolean(candidate),
        )
        .sort((left, right) => right.score - left.score);

      const originalScroll = { x: scrollX, y: scrollY };
      const results = [];
      for (const candidate of candidates) {
        const { element } = candidate;
        element.scrollIntoView({ block: "center", inline: "center" });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth;
        const disabled =
          ("disabled" in element &&
            Boolean((element as HTMLButtonElement).disabled)) ||
          element.getAttribute("aria-disabled") === "true";
        const top = visible
          ? document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            )
          : null;
        const overlapped = Boolean(
          top && top !== element && !element.contains(top),
        );
        let fixedAncestor: HTMLElement | null =
          top instanceof HTMLElement ? top : null;
        while (
          fixedAncestor &&
          !["fixed", "sticky"].includes(
            getComputedStyle(fixedAncestor).position,
          )
        ) {
          fixedAncestor = fixedAncestor.parentElement;
        }
        const coveringRect = fixedAncestor?.getBoundingClientRect();
        const edgeBanner = Boolean(
          overlapped &&
          fixedAncestor &&
          coveringRect &&
          coveringRect.height <= innerHeight * 0.4 &&
          (coveringRect.top <= 1 || coveringRect.bottom >= innerHeight - 1),
        );
        const nearbyText: string[] = [];
        let ancestor: HTMLElement | null = element;
        for (let depth = 0; ancestor && depth < 4; depth += 1) {
          nearbyText.push((ancestor.innerText || "").slice(0, 2_000));
          ancestor = ancestor.parentElement;
        }
        results.push({
          label: candidate.label,
          type: candidate.type,
          score: candidate.score,
          primaryEligible: candidate.primaryEligible,
          visible,
          disabled,
          overlapped,
          edgeBanner,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          soldOut:
            structuredSoldOut ||
            /sold out|out of stock|unavailable|нет в наличии|распродан|недоступен/i.test(
              nearbyText.join(" "),
            ),
        });
      }

      scrollTo({ left: originalScroll.x, top: originalScroll.y });
      return (
        results.find(
          (candidate) => candidate.visible && candidate.primaryEligible,
        ) ??
        results.find((candidate) => candidate.primaryEligible) ??
        null
      );
    },
    {
      directLabels: PURCHASE_CTA_LABELS,
      gateLabels: VARIANT_GATE_LABELS,
      structuredSoldOut,
    },
  );

  const usable = Boolean(
    selected?.visible &&
    !selected.disabled &&
    (!selected.overlapped || selected.edgeBanner),
  );
  const acceptableSoldOut = Boolean(
    selected?.soldOut && (!selected.overlapped || selected.edgeBanner),
  );
  const passed =
    usable || acceptableSoldOut || (!selected && structuredSoldOut);
  const identity = selected
    ? `Selected ${selected.type}: “${selected.label}” (${selected.width} × ${selected.height}px).`
    : "No supported purchase control was found.";
  const reason = !selected
    ? structuredSoldOut
      ? "Product structured data explicitly reports that the item is out of stock."
      : "No supported direct CTA or variant gate was found."
    : selected.soldOut && (!selected.overlapped || selected.edgeBanner)
      ? "The product is explicitly marked sold out; an enabled purchase control is not expected."
      : !selected.visible
        ? "The selected purchase control is not visible after scrolling into view."
        : selected.disabled
          ? "The selected purchase control is disabled without a nearby stock explanation."
          : selected.edgeBanner
            ? "The control is usable; a small edge banner temporarily covers its center point."
            : selected.overlapped
              ? "The selected purchase control is blocked at its center point."
              : selected.type === "variant gate"
                ? "The control is visible and enabled; variant selection is required before purchase."
                : "The direct purchase control is visible, enabled and unobstructed.";

  return finding({
    id: "purchase-cta",
    ruleId: "purchase-cta",
    title: "Purchase CTA",
    description: passed
      ? "A valid purchase path or explicit sold-out state was found."
      : "The purchase CTA may prevent purchase on mobile.",
    severity: passed ? "info" : "critical",
    status: passed ? "passed" : "failed",
    evidence: [identity, reason],
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

const OVERLAY_DISMISS_LABELS = [
  "close",
  "dismiss",
  "reject",
  "reject all",
  "decline",
  "no thanks",
  "accept",
  "accept all",
  "accept all cookies",
  "agree",
  "allow all",
  "got it",
  "закрыть",
  "отклонить",
  "отклонить все",
  "нет, спасибо",
  "принять",
  "принять все",
  "согласен",
  "разрешить все",
  "понятно",
  "×",
  "✕",
] as const;

async function dismissObviousOverlays(page: AuditRuleContext["page"]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dismissed = await page.evaluate((labels) => {
      const visible = (element: HTMLElement) => {
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
      const normalize = (value: string) =>
        value.replace(/\s+/g, " ").trim().toLowerCase();
      const overlays = Array.from(
        document.body.querySelectorAll<HTMLElement>("*"),
      )
        .slice(0, 5_000)
        .filter((element) => {
          if (!visible(element)) return false;
          const rect = element.getBoundingClientRect();
          const position = getComputedStyle(element).position;
          return (
            element.matches(
              "[role='dialog'], [role='alertdialog'], [aria-modal='true']",
            ) ||
            ((position === "fixed" || position === "sticky") &&
              rect.width >= innerWidth * 0.5 &&
              rect.height >= 50)
          );
        })
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return (
            rightRect.width * rightRect.height -
            leftRect.width * leftRect.height
          );
        });

      for (const overlay of overlays) {
        const controls = Array.from(
          overlay.querySelectorAll<HTMLElement>(
            "button, [role='button'], input[type='button'], input[type='submit']",
          ),
        ).filter(visible);

        for (const label of labels) {
          const control = controls.find((element) => {
            const text =
              element instanceof HTMLInputElement
                ? element.value
                : element.getAttribute("aria-label") ||
                  element.getAttribute("title") ||
                  element.innerText;
            const normalized = normalize(text);
            return normalized === label || normalized.startsWith(`${label} `);
          });
          if (control) {
            control.click();
            return true;
          }
        }

        const anonymousCross = controls.find((control) => {
          const rect = control.getBoundingClientRect();
          const compact = rect.width <= 64 && rect.height <= 64;
          let container: HTMLElement | null = control.parentElement;
          let inUpperCorner = false;
          while (container) {
            const containerRect = container.getBoundingClientRect();
            const nearTop =
              rect.top <=
              containerRect.top + Math.min(96, containerRect.height * 0.25);
            const nearSide =
              rect.left <=
                containerRect.left + Math.min(96, containerRect.width * 0.25) ||
              rect.right >=
                containerRect.right - Math.min(96, containerRect.width * 0.25);
            if (nearTop && nearSide) {
              inUpperCorner = true;
              break;
            }
            if (container === overlay) break;
            container = container.parentElement;
          }
          const attributes = Array.from(control.attributes)
            .filter(
              (attribute) =>
                attribute.name === "class" ||
                attribute.name === "id" ||
                attribute.name.startsWith("data-"),
            )
            .map((attribute) => attribute.value)
            .join(" ");
          const image = control.querySelector("img");
          const use = control.querySelector("use");
          const iconSignals = [
            attributes,
            image?.src,
            image?.alt,
            image?.className,
            use?.getAttribute("href"),
            use?.getAttribute("xlink:href"),
          ]
            .filter(Boolean)
            .join(" ");
          return (
            compact &&
            inUpperCorner &&
            /close|dismiss|cross|times|modal.?x|dialog.?x|крест|закры/i.test(
              iconSignals,
            )
          );
        });
        if (anonymousCross) {
          anonymousCross.click();
          return true;
        }
      }
      return false;
    }, OVERLAY_DISMISS_LABELS);

    if (!dismissed) return;
    await page.waitForTimeout(200);
  }
}

export async function runAuditRules(
  context: AuditRuleContext,
): Promise<Finding[]> {
  await dismissObviousOverlays(context.page);
  const findings: Finding[] = [];
  for (const rule of auditRules) findings.push(await rule(context));
  return findings;
}
