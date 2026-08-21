import { chromium, devices, type Browser } from "playwright";

import {
  summarizeFindings,
  type AuditRuleContext,
  type AuditResult,
  type AuditRunner,
  type Finding,
} from "@/domain/audit";
import { runAuditRules } from "@/lib/audit/rules";
import {
  screenshotStorage,
  type ScreenshotStorage,
} from "@/lib/screenshot-storage";
import {
  systemDnsResolver,
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const VIEWPORT = { width: 390, height: 844 };
const MAX_REDIRECTS = 5;
const AUDIT_TIMEOUT_MS = 45_000;
const READINESS_TIMEOUT_MS = 15_000;
const READINESS_STABILITY_MS = 750;
const READINESS_POLL_MS = 250;
const MAX_SCREENSHOT_HEIGHT = 20_000;

export class AuditTimeoutError extends Error {
  constructor() {
    super("The audit exceeded its time limit.");
    this.name = "AuditTimeoutError";
  }
}

export class AuditPageTooLargeError extends Error {
  constructor() {
    super("The page is too large to capture safely.");
    this.name = "AuditPageTooLargeError";
  }
}

function redirectCount(request: import("playwright").Request): number {
  let count = 0;
  let previous = request.redirectedFrom();
  while (previous) {
    count += 1;
    previous = previous.redirectedFrom();
  }
  return count;
}

interface ReadinessOptions {
  timeoutMs?: number;
  stabilityMs?: number;
}

interface ReadinessSnapshot {
  fingerprint: string;
  meaningful: boolean;
  pageHeight: number;
  signals: string[];
  textLength: number;
}

async function waitForAuditReadiness(
  page: AuditRuleContext["page"],
  options: ReadinessOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? READINESS_TIMEOUT_MS;
  const stabilityMs = options.stabilityMs ?? READINESS_STABILITY_MS;
  const deadline = Date.now() + timeoutMs;
  let previousFingerprint = "";
  let stableSince = Date.now();
  let lastSnapshot: ReadinessSnapshot | null = null;

  while (Date.now() < deadline) {
    const snapshot = await page
      .evaluate((): ReadinessSnapshot => {
        const body = document.body;
        const content =
          document.querySelector<HTMLElement>("main, [role='main'], article") ??
          body;
        const text = content?.innerText.replace(/\s+/g, " ").trim() ?? "";
        const visible = (element: Element | null) => {
          if (!(element instanceof HTMLElement)) return false;
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
        const signals: string[] = [];

        if (
          /(?:[$€£₸]\s*\d|\d[\d\s.,]*\s*(?:[$€£₸]|USD|EUR|GBP|KZT))/iu.test(
            text.slice(0, 10_000),
          )
        )
          signals.push("price");
        for (
          let index = 0;
          index < Math.min(document.images.length, 500);
          index += 1
        ) {
          const image = document.images[index];
          const rect = image.getBoundingClientRect();
          if (
            visible(image) &&
            !image.closest(
              "header, nav, [role='banner'], [role='navigation']",
            ) &&
            rect.width >= 180 &&
            rect.height >= 180 &&
            image.naturalWidth >= 300 &&
            image.naturalHeight >= 300
          ) {
            signals.push("product-image");
            break;
          }
        }

        if (
          visible(
            document.querySelector(
              "main button, main [role='button'], main input[type='submit'], main select, form button[type='submit']",
            ),
          )
        )
          signals.push("commerce-control");

        const pageHeight = Math.max(
          body?.scrollHeight ?? 0,
          document.documentElement.scrollHeight,
        );
        return {
          fingerprint: JSON.stringify([
            text.slice(0, 2_000),
            body?.childElementCount ?? 0,
            document.images.length,
            document.links.length,
            document.forms.length,
            pageHeight,
            signals,
          ]),
          meaningful: text.length >= 200 || signals.length > 0,
          pageHeight,
          signals,
          textLength: text.length,
        };
      })
      .catch(() => null);

    if (!snapshot) {
      previousFingerprint = "";
      stableSince = Date.now();
    } else {
      if (snapshot.pageHeight > MAX_SCREENSHOT_HEIGHT)
        throw new AuditPageTooLargeError();
      if (snapshot.fingerprint !== previousFingerprint) {
        previousFingerprint = snapshot.fingerprint;
        stableSince = Date.now();
      }
      lastSnapshot = snapshot;
      if (snapshot.meaningful && Date.now() - stableSince >= stabilityMs)
        return { ready: true as const, snapshot, timeoutMs, stabilityMs };
    }

    await page.waitForTimeout(READINESS_POLL_MS);
  }

  return {
    ready: false as const,
    snapshot: lastSnapshot,
    timeoutMs,
    stabilityMs,
  };
}

export async function runAuditWhenReady(
  context: AuditRuleContext,
  options?: ReadinessOptions,
): Promise<Finding[]> {
  const readiness = await waitForAuditReadiness(context.page, options);
  if (readiness.ready) return runAuditRules(context);

  const snapshot = readiness.snapshot;
  return [
    {
      id: "page-availability",
      ruleId: "page-availability",
      title: "PDP readiness",
      description:
        "The page did not reach a stable state with enough observable content to audit.",
      severity: "critical",
      status: "failed",
      evidence: [
        `The page did not become auditable within ${readiness.timeoutMs}ms.`,
        `Last observation: ${snapshot?.textLength ?? 0} visible text characters; PDP signals: ${snapshot?.signals.join(", ") || "none"}.`,
        "The remaining PDP rules were not run, so this result is incomplete.",
      ],
      recommendation:
        "Confirm the PDP finishes loading for shoppers, then run the audit again.",
    },
  ];
}

export class PlaywrightAuditRunner implements AuditRunner {
  constructor(
    private readonly storage: ScreenshotStorage = screenshotStorage,
    private readonly resolver: DnsResolver = systemDnsResolver,
  ) {}

  async run(inputUrl: string): Promise<AuditResult> {
    const startedAt = new Date();
    const auditedUrl = (await validatePublicUrl(inputUrl, this.resolver)).href;
    let browser: Browser | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void browser?.close();
    }, AUDIT_TIMEOUT_MS);

    try {
      browser = await chromium.launch();
      const mobile = { ...devices["iPhone 13"], userAgent: undefined };
      const context = await browser.newContext({
        ...mobile,
        viewport: VIEWPORT,
        locale: "en-US",
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.setDefaultNavigationTimeout(30_000);

      let blockedRequestCount = 0;
      let observedRedirectCount = 0;
      let fatalSafetyError: UnsafeUrlError | null = null;
      const safeHostCache = new Set<string>();

      await context.route("**/*", async (route) => {
        const request = route.request();
        const isMainNavigation =
          request.isNavigationRequest() && request.frame() === page.mainFrame();
        const currentRedirectCount = isMainNavigation
          ? redirectCount(request)
          : 0;
        observedRedirectCount = Math.max(
          observedRedirectCount,
          currentRedirectCount,
        );

        try {
          if (currentRedirectCount > MAX_REDIRECTS) {
            throw new UnsafeUrlError(
              `The page exceeded ${MAX_REDIRECTS} redirects.`,
            );
          }

          const requestUrl = new URL(request.url());
          const cacheKey = `${requestUrl.protocol}//${requestUrl.hostname}:${requestUrl.port}`;
          if (isMainNavigation || !safeHostCache.has(cacheKey)) {
            await validatePublicUrl(request.url(), this.resolver);
            if (!isMainNavigation) safeHostCache.add(cacheKey);
          }
          await route.continue();
        } catch (error) {
          blockedRequestCount += 1;
          if (isMainNavigation) {
            fatalSafetyError =
              error instanceof UnsafeUrlError
                ? error
                : new UnsafeUrlError("An unsafe navigation was blocked.");
          }
          await route.abort("blockedbyclient");
        }
      });

      await context.routeWebSocket("**/*", (socket) => socket.close());

      let mainResponse: import("playwright").Response | null = null;
      try {
        mainResponse = await page.goto(auditedUrl, {
          waitUntil: "domcontentloaded",
        });
      } catch (error) {
        if (fatalSafetyError) throw fatalSafetyError;
        if (timedOut) throw new AuditTimeoutError();
        throw error;
      }
      if (fatalSafetyError) throw fatalSafetyError;

      if (timedOut) throw new AuditTimeoutError();

      const pageHeight = await page.evaluate(() =>
        Math.max(
          document.body?.scrollHeight ?? 0,
          document.documentElement.scrollHeight,
        ),
      );
      if (pageHeight > MAX_SCREENSHOT_HEIGHT)
        throw new AuditPageTooLargeError();

      const findings = await runAuditWhenReady({ page, mainResponse });
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: "png",
      });
      const screenshot = await this.storage.save(screenshotBuffer);
      const finishedAt = new Date();

      return {
        auditedUrl,
        finalUrl: page.url(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        pageTitle: (await page.title()).trim(),
        screenshot,
        summary: summarizeFindings(findings),
        findings,
        metadata: {
          viewport: VIEWPORT,
          userAgent: await page.evaluate(() => navigator.userAgent),
          httpStatus: mainResponse?.status() ?? null,
          redirectCount: observedRedirectCount,
          blockedRequestCount,
        },
      };
    } catch (error) {
      if (timedOut && !(error instanceof UnsafeUrlError))
        throw new AuditTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeout);
      await browser?.close().catch(() => undefined);
    }
  }
}

export const auditRunner = new PlaywrightAuditRunner();
