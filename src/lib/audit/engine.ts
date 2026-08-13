import { chromium, devices, type Browser } from "playwright";

import {
  summarizeFindings,
  type AuditResult,
  type AuditRunner,
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
      const mobile = devices["iPhone 13"];
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

      await page
        .waitForLoadState("load", { timeout: 8_000 })
        .catch(() => undefined);
      await page.waitForTimeout(750);
      if (timedOut) throw new AuditTimeoutError();

      const pageHeight = await page.evaluate(() =>
        Math.max(
          document.body?.scrollHeight ?? 0,
          document.documentElement.scrollHeight,
        ),
      );
      if (pageHeight > MAX_SCREENSHOT_HEIGHT)
        throw new AuditPageTooLargeError();

      const findings = await runAuditRules({ page, mainResponse });
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
