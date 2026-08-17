import { chromium, devices, type Browser } from "playwright";

import {
  summarizeFindings,
  type AuditOptions,
  type AuditResult,
  type AuditRunner,
} from "@/domain/audit";
import { runAuditRules } from "@/lib/audit/rules";
import { runAddToCartInteraction } from "@/lib/audit/add-to-cart";
import {
  screenshotStorage,
  type ScreenshotStorage,
} from "@/lib/screenshot-storage";
import { installBrowserNetworkGuard } from "@/lib/browser-network-guard";
import {
  systemDnsResolver,
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const VIEWPORT = { width: 390, height: 844 };
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

export class PlaywrightAuditRunner implements AuditRunner {
  constructor(
    private readonly storage: ScreenshotStorage = screenshotStorage,
    private readonly resolver: DnsResolver = systemDnsResolver,
  ) {}

  async run(
    inputUrl: string,
    options: AuditOptions = {},
  ): Promise<AuditResult> {
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

      const networkGuard = await installBrowserNetworkGuard(
        context,
        page,
        this.resolver,
      );

      let mainResponse: import("playwright").Response | null = null;
      try {
        mainResponse = await page.goto(auditedUrl, {
          waitUntil: "domcontentloaded",
        });
      } catch (error) {
        if (networkGuard.fatalSafetyError) throw networkGuard.fatalSafetyError;
        if (timedOut) throw new AuditTimeoutError();
        throw error;
      }
      if (networkGuard.fatalSafetyError) throw networkGuard.fatalSafetyError;

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
      const finalUrl = page.url();
      const pageTitle = (await page.title()).trim();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      const redirectCount = networkGuard.redirectCount;
      const blockedRequestCount = networkGuard.blockedRequestCount;
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: "png",
      });
      const screenshot = await this.storage.save(screenshotBuffer);
      if (options.testAddToCart && findings[0]?.status === "passed") {
        findings.push(await runAddToCartInteraction(page));
        if (networkGuard.fatalSafetyError) throw networkGuard.fatalSafetyError;
      }
      const finishedAt = new Date();

      return {
        auditedUrl,
        finalUrl,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        pageTitle,
        screenshot,
        summary: summarizeFindings(findings),
        findings,
        metadata: {
          viewport: VIEWPORT,
          userAgent,
          httpStatus: mainResponse?.status() ?? null,
          redirectCount,
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
