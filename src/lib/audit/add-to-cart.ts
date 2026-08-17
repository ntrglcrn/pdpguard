import type { Finding } from "@/domain/audit";
import { ADD_TO_CART_LABELS, VARIANT_GATE_LABELS } from "@/lib/audit/detection";
import type { Page } from "playwright";

const TARGET_ATTRIBUTE = "data-pdpguard-add-to-cart-target";

interface InteractionSnapshot {
  url: string;
  confirmations: string[];
  indicators: string[];
  drawers: string[];
}

async function interactionSnapshot(page: Page): Promise<InteractionSnapshot> {
  return page.evaluate(() => {
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
    const textOf = (element: HTMLElement) =>
      (element.innerText || element.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
    const elements = Array.from(
      document.body.querySelectorAll<HTMLElement>(
        "button, a, [role='status'], [role='alert'], [role='dialog'], [class*='toast' i], [class*='notification' i], [class*='drawer' i], [class*='mini-cart' i], [class*='cart-panel' i]",
      ),
    ).slice(0, 5_000);

    return {
      url: location.href,
      confirmations: elements
        .filter((element) => {
          const text = textOf(element);
          return (
            visible(element) &&
            text.length > 0 &&
            text.length <= 120 &&
            /added to (?:cart|bag|basket)|in (?:your )?(?:cart|bag|basket)|view (?:cart|bag|basket)|товар добавлен|добавлено в корзину|перейти в корзину|в корзине/i.test(
              text,
            )
          );
        })
        .map(textOf)
        .slice(0, 20),
      indicators: Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-cart-count], [class*='cart-count' i], [id*='cart-count' i], [aria-label*='cart' i], [aria-label*='bag' i], [aria-label*='корзин' i]",
        ),
      )
        .filter(visible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 20),
      drawers: elements
        .filter(
          (element) =>
            visible(element) &&
            element.matches(
              "[role='dialog'], [class*='drawer' i], [class*='mini-cart' i], [class*='cart-panel' i]",
            ) &&
            /cart|bag|basket|корзин/i.test(textOf(element)),
        )
        .map(textOf)
        .slice(0, 10),
    };
  });
}

export async function runAddToCartInteraction(page: Page): Promise<Finding> {
  const candidate = await page.evaluate(
    ({ labels, gateLabels, targetAttribute }) => {
      document
        .querySelectorAll(`[${targetAttribute}]`)
        .forEach((element) => element.removeAttribute(targetAttribute));
      const normalize = (value: string) =>
        value.replace(/\s+/g, " ").trim().toLowerCase();
      const labelOf = (element: HTMLElement) =>
        element instanceof HTMLInputElement
          ? element.value
          : element.innerText ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            "";
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
      const placementOf = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const ancestry = Array.from(
          (function* () {
            let current: HTMLElement | null = element.parentElement;
            for (let depth = 0; current && depth < 8; depth += 1) {
              yield current;
              current = current.parentElement;
            }
          })(),
        )
          .map((node) => `${node.id} ${node.className}`)
          .join(" ");
        return {
          rect,
          recommendation:
            /recommend|related|similar|carousel|slider|swiper|upsell|cross.?sell|product.?card/i.test(
              ancestry,
            ),
          outside: rect.right <= 0 || rect.left >= innerWidth,
        };
      };
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          "button, [role='button'], input[type='button'], input[type='submit']",
        ),
      );
      const candidates = Array.from(controls)
        .map((element) => {
          const label = labelOf(element).trim();
          const normalized = normalize(label);
          if (
            !labels.some(
              (allowed) =>
                normalized === allowed || normalized.startsWith(`${allowed} `),
            )
          )
            return null;
          const { rect, recommendation, outside } = placementOf(element);
          const smallAriaOnly =
            !element.innerText.trim() &&
            Boolean(element.getAttribute("aria-label")) &&
            (rect.width < 80 || rect.height < 28);
          return {
            element,
            label,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            eligible:
              rendered(element) &&
              !recommendation &&
              !outside &&
              !smallAriaOnly,
            disabled:
              ("disabled" in element &&
                Boolean((element as HTMLButtonElement).disabled)) ||
              element.getAttribute("aria-disabled") === "true",
            score:
              rect.width * rect.height -
              (recommendation ? 1_000_000 : 0) -
              (outside ? 1_000_000 : 0) -
              (smallAriaOnly ? 1_000_000 : 0),
          };
        })
        .filter(
          (
            value,
          ): value is {
            element: HTMLElement;
            label: string;
            width: number;
            height: number;
            eligible: boolean;
            disabled: boolean;
            score: number;
          } => Boolean(value),
        )
        .sort((left, right) => right.score - left.score);
      const selected = candidates.find((item) => item.eligible);
      const variantGate = controls.find((element) => {
        const normalized = normalize(labelOf(element));
        const { recommendation, outside } = placementOf(element);
        return (
          gateLabels.some(
            (allowed) =>
              normalized === allowed || normalized.startsWith(`${allowed} `),
          ) &&
          rendered(element) &&
          !recommendation &&
          !outside
        );
      });
      selected?.element.setAttribute(targetAttribute, "true");
      return selected
        ? {
            label: selected.label,
            width: selected.width,
            height: selected.height,
            disabled: selected.disabled,
            variantGateLabel: variantGate ? labelOf(variantGate).trim() : null,
          }
        : null;
    },
    {
      labels: ADD_TO_CART_LABELS,
      gateLabels: VARIANT_GATE_LABELS,
      targetAttribute: TARGET_ATTRIBUTE,
    },
  );

  if (!candidate) {
    return {
      id: "add-to-cart-interaction",
      ruleId: "add-to-cart-interaction",
      title: "Add-to-cart interaction",
      description: "No safe direct add-to-cart control was available to test.",
      severity: "info",
      status: "passed",
      evidence: [
        "Skipped: Buy now, generic Buy, variant gates and inquiry controls are never clicked.",
      ],
      recommendation: "No action is required.",
    };
  }

  const identity = `Selected add-to-cart CTA: “${candidate.label}” (${candidate.width} × ${candidate.height}px).`;
  if (candidate.disabled && candidate.variantGateLabel) {
    return {
      id: "add-to-cart-interaction",
      ruleId: "add-to-cart-interaction",
      title: "Add-to-cart interaction",
      description: "Variant selection is required before add to cart.",
      severity: "info",
      status: "passed",
      evidence: [
        identity,
        `Skipped: “${candidate.variantGateLabel}” must be completed first; variants are never selected.`,
      ],
      recommendation: "No action is required.",
    };
  }
  if (candidate.disabled) {
    return {
      id: "add-to-cart-interaction",
      ruleId: "add-to-cart-interaction",
      title: "Add-to-cart interaction",
      description: "The selected add-to-cart control could not be tested.",
      severity: "warning",
      status: "failed",
      evidence: [identity, "The control is disabled."],
      recommendation:
        "Confirm the add-to-cart control becomes enabled after valid product selections.",
    };
  }

  const before = await interactionSnapshot(page);
  try {
    await page.locator(`[${TARGET_ATTRIBUTE}]`).click({ timeout: 5_000 });
  } catch {
    return {
      id: "add-to-cart-interaction",
      ruleId: "add-to-cart-interaction",
      title: "Add-to-cart interaction",
      description: "The selected add-to-cart control could not be activated.",
      severity: "warning",
      status: "failed",
      evidence: [
        identity,
        "The click was blocked or did not become actionable.",
      ],
      recommendation:
        "Keep the direct add-to-cart control enabled and free from overlays.",
    };
  }

  // ponytail: fixed observation window; add store adapters only when calibration proves they are needed.
  await page.waitForTimeout(1_500);
  const after = await interactionSnapshot(page);
  const newConfirmation = after.confirmations.find(
    (value) => !before.confirmations.includes(value),
  );
  const newDrawer = after.drawers.find(
    (value) => !before.drawers.includes(value),
  );
  const indicatorChanged =
    JSON.stringify(before.indicators) !== JSON.stringify(after.indicators);
  const cartNavigation =
    before.url !== after.url &&
    /\/(?:cart|bag|basket)(?:\/|\?|#|$)/i.test(after.url);
  const cartLocation = cartNavigation
    ? `${new URL(after.url).origin}${new URL(after.url).pathname}`
    : null;
  const confirmation = newConfirmation
    ? `Visible confirmation: “${newConfirmation}”.`
    : newDrawer
      ? "A cart drawer or dialog became visible."
      : indicatorChanged
        ? "The visible cart indicator changed."
        : cartLocation
          ? `The page navigated to a cart URL: ${cartLocation}`
          : null;

  return {
    id: "add-to-cart-interaction",
    ruleId: "add-to-cart-interaction",
    title: "Add-to-cart interaction",
    description: confirmation
      ? "The page confirmed the add-to-cart action."
      : "The click produced no observable cart confirmation.",
    severity: confirmation ? "info" : "warning",
    status: confirmation ? "passed" : "failed",
    evidence: [
      identity,
      confirmation ??
        "No new confirmation, cart drawer, cart indicator change or cart navigation was observed within 1.5 seconds.",
    ],
    recommendation: confirmation
      ? "No action is required."
      : "Show an immediate cart confirmation after a successful add-to-cart action.",
  };
}
