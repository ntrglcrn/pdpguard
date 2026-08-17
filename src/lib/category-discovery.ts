import { chromium, devices, type Browser, type Page } from "playwright";

import type { CatalogDiscoveryResult } from "@/domain/catalog";
import { installBrowserNetworkGuard } from "@/lib/browser-network-guard";
import { CatalogDiscoveryError } from "@/lib/catalog-discovery";
import {
  systemDnsResolver,
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const VIEWPORT = { width: 390, height: 844 };
const MAX_PRODUCT_URLS = 100;
const DISCOVERY_TIMEOUT_MS = 30_000;
const PRODUCT_PATH = /\/(?:products?|item|p|prd)\/[^/?#]+/i;

export class CategoryDiscoveryTimeoutError extends CatalogDiscoveryError {
  constructor() {
    super("Category discovery timed out.");
    this.name = "CategoryDiscoveryTimeoutError";
  }
}

export async function extractProductUrls(page: Page, limit = MAX_PRODUCT_URLS) {
  const { baseUrl, links } = await page.evaluate(() => ({
    baseUrl: document.baseURI,
    links: [...document.querySelectorAll("a[href]")].map(
      (anchor) => (anchor as HTMLAnchorElement).href,
    ),
  }));
  const finalUrl = new URL(baseUrl);
  const urls = new Set<string>();
  for (const value of links) {
    try {
      const url = new URL(value);
      if (
        url.origin !== finalUrl.origin ||
        url.username ||
        url.password ||
        !PRODUCT_PATH.test(url.pathname)
      )
        continue;
      url.hash = "";
      urls.add(url.href);
    } catch {
      continue;
    }
  }
  return {
    urls: [...urls].slice(0, limit),
    truncated: urls.size > limit,
  };
}

export async function discoverCategory(
  input: string,
  resolver: DnsResolver = systemDnsResolver,
): Promise<CatalogDiscoveryResult> {
  const sourceUrl = (await validatePublicUrl(input, resolver)).href;
  let browser: Browser | null = null;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void browser?.close();
  }, DISCOVERY_TIMEOUT_MS);

  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      ...devices["iPhone 13"],
      viewport: VIEWPORT,
      locale: "en-US",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    page.setDefaultNavigationTimeout(20_000);
    const networkGuard = await installBrowserNetworkGuard(
      context,
      page,
      resolver,
    );

    let response: import("playwright").Response | null = null;
    try {
      response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    } catch (error) {
      if (networkGuard.fatalSafetyError) throw networkGuard.fatalSafetyError;
      if (timedOut) throw new CategoryDiscoveryTimeoutError();
      throw error;
    }
    if (networkGuard.fatalSafetyError) throw networkGuard.fatalSafetyError;
    if (response && response.status() >= 400) {
      throw new CatalogDiscoveryError(
        `The category returned HTTP ${response.status()}.`,
      );
    }

    await page
      .waitForLoadState("load", { timeout: 8_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1_000);
    for (let index = 0; index < 3; index += 1) {
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
    }
    if (timedOut) throw new CategoryDiscoveryTimeoutError();

    const products = await extractProductUrls(page);
    return {
      sourceUrl: page.url(),
      sourceType: "category",
      pageUrls: products.urls,
      inspectedSources: 1,
      truncated: products.truncated,
    };
  } catch (error) {
    if (timedOut && !(error instanceof UnsafeUrlError))
      throw new CategoryDiscoveryTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    await browser?.close().catch(() => undefined);
  }
}
