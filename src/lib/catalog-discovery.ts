import { chromium, type Browser, type Request } from "playwright";

import type { AuthenticatedUser, StoreCatalog } from "@/domain/saas";
import {
  systemDnsResolver,
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";
import {
  CatalogDiscoveryDeadlineError,
  WorkspaceService,
} from "@/lib/workspace-service";
import { CatalogDiscoveryBusyError } from "@/lib/workspace-contract";

const MAX_REDIRECTS = 5;
const DISCOVERY_TIMEOUT_MS = 30_000;
const MAX_CANDIDATE_LINKS = 200;
const MAX_INSPECTED_LINKS = 1_000;
const MAX_CATEGORY_CANDIDATES = 30;
const MAX_CATEGORY_PAGES = 10;

export interface CatalogDiscoveryResult {
  productUrls: string[];
  categories: Array<{ url: string; name: string; source?: "root_page_link" | "category_page_link" }>;
  mappings: Array<{ productUrl: string; categoryUrl: string }>;
  truncated: boolean;
}

export interface CatalogDiscoveryRunner {
  discover(storeUrl: string): Promise<string[] | CatalogDiscoveryResult>;
}

export { CatalogDiscoveryBusyError } from "@/lib/workspace-contract";

export class CatalogDiscoveryTimeoutError extends Error {
  constructor() {
    super("Catalog discovery exceeded its time limit.");
    this.name = "CatalogDiscoveryTimeoutError";
  }
}

export function catalogProductUrls(links: string[], origin: string) {
  const candidates = new Set<string>();
  for (const link of links) {
    try {
      const url = new URL(link);
      if (
        url.origin === origin &&
        /^\/(?:products?|p|dp|item)\/[^/]+\/?$/i.test(url.pathname)
      )
        candidates.add(url.href);
    } catch {
      // The persistence boundary records malformed candidates as rejected.
    }
    if (candidates.size >= MAX_CANDIDATE_LINKS) break;
  }
  return [...candidates];
}

let discoveryInProgress = false;

export async function executeCatalogDiscovery(
  service: WorkspaceService,
  principal: AuthenticatedUser,
  storeId: string,
  runner: CatalogDiscoveryRunner = new PlaywrightCatalogDiscoveryRunner(),
): Promise<StoreCatalog> {
  if (discoveryInProgress) throw new CatalogDiscoveryBusyError();
  discoveryInProgress = true;
  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
  try {
    const store = service.startCatalogDiscovery(principal, storeId);
    return await service.completeCatalogDiscovery(
      principal,
      store.id,
      await runner.discover(store.url),
      deadline,
    );
  } catch (error) {
    const store = service.getStore(principal, storeId);
    return service.failCatalogDiscovery(
      principal,
      store.id,
      error instanceof UnsafeUrlError
        ? "unsafe_url"
        : error instanceof CatalogDiscoveryTimeoutError ||
            error instanceof CatalogDiscoveryDeadlineError
          ? "timeout"
          : "infrastructure",
    );
  } finally {
    discoveryInProgress = false;
  }
}

export class PlaywrightCatalogDiscoveryRunner implements CatalogDiscoveryRunner {
  constructor(
    private readonly resolver: DnsResolver = systemDnsResolver,
    private readonly timeoutMs = DISCOVERY_TIMEOUT_MS,
  ) {}

  async discover(storeUrl: string): Promise<CatalogDiscoveryResult> {
    const origin = new URL(storeUrl).origin;
    let browser: Browser | null = null;
    let timedOut = false;
    let rejectTimeout: (error: Error) => void = () => undefined;
    const expiration = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      void browser?.close();
      rejectTimeout(new CatalogDiscoveryTimeoutError());
    }, this.timeoutMs);

    try {
      const startUrl = (
        await Promise.race([
          validatePublicUrl(`${origin}/`, this.resolver),
          expiration,
        ])
      ).href;
      browser = await chromium.launch();
      const context = await browser.newContext({
        viewport: { width: 1_280, height: 800 },
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      page.setDefaultNavigationTimeout(20_000);
      const safeHostCache = new Set<string>();
      let fatalSafetyError: UnsafeUrlError | null = null;

      await context.route("**/*", async (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        if (["font", "image", "media"].includes(resourceType)) {
          await route.abort("blockedbyclient");
          return;
        }

        try {
          const requestUrl = new URL(request.url());
          if (request.isNavigationRequest() && requestUrl.origin !== origin)
            throw new UnsafeUrlError(
              "Catalog discovery cannot navigate outside the store origin.",
            );
          if (redirectCount(request) > MAX_REDIRECTS)
            throw new UnsafeUrlError(
              `The page exceeded ${MAX_REDIRECTS} redirects.`,
            );

          const cacheKey = requestUrl.origin;
          if (request.isNavigationRequest()) {
            await validatePublicUrl(request.url(), this.resolver);
          } else if (!safeHostCache.has(cacheKey)) {
            await validatePublicUrl(request.url(), this.resolver);
            safeHostCache.add(cacheKey);
          }
          await route.continue();
        } catch (error) {
          if (request.isNavigationRequest())
            fatalSafetyError =
              error instanceof UnsafeUrlError
                ? error
                : new UnsafeUrlError("An unsafe navigation was blocked.");
          await route.abort("blockedbyclient");
        }
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());

      let response: import("playwright").Response | null = null;
      try {
        response = await page.goto(startUrl, { waitUntil: "domcontentloaded" });
      } catch (error) {
        if (fatalSafetyError) throw fatalSafetyError;
        if (timedOut) throw new CatalogDiscoveryTimeoutError();
        throw error;
      }
      if (fatalSafetyError) throw fatalSafetyError;
      if (timedOut) throw new CatalogDiscoveryTimeoutError();
      if (!response || response.status() >= 400)
        throw new Error("The store root page could not be loaded.");

      await page
        .locator("a[href]")
        .first()
        .waitFor({ state: "attached" })
        .catch(() => undefined);

      const anchors = await page
        .locator("a[href]")
        .evaluateAll(
          (anchors, limit) =>
            anchors
              .slice(0, limit)
              .map((anchor) => ({
                href: (anchor as HTMLAnchorElement).href,
                text: anchor.textContent?.trim() ?? "",
              })),
          MAX_INSPECTED_LINKS,
        );
      const links = anchors.map((anchor) => anchor.href);
      const productUrls = catalogProductUrls(links, origin);
      const categoryCandidates = categoryLinks(anchors, origin);
      const categories = categoryCandidates.slice(0, MAX_CATEGORY_CANDIDATES);
      const mappings: CatalogDiscoveryResult["mappings"] = [];
      let truncated = categoryCandidates.length > MAX_CATEGORY_PAGES;
      for (const category of categories.slice(0, MAX_CATEGORY_PAGES)) {
        const safeCategory = await validatePublicUrl(category.url, this.resolver);
        if (safeCategory.origin !== origin) continue;
        const categoryPage = await context.newPage();
        try {
          const response = await categoryPage.goto(safeCategory.href, { waitUntil: "domcontentloaded", timeout: 5_000 });
          if (!response || response.status() >= 400) {
            truncated = true;
            continue;
          }
          const categoryProductUrls = catalogProductUrls(
            await categoryPage.locator("a[href]").evaluateAll((anchors, limit) => anchors.slice(0, limit).map((anchor) => (anchor as HTMLAnchorElement).href), MAX_INSPECTED_LINKS),
            origin,
          );
          for (const productUrl of categoryProductUrls) mappings.push({ productUrl, categoryUrl: safeCategory.href });
          productUrls.push(...categoryProductUrls);
        } catch {
          if (fatalSafetyError) throw fatalSafetyError;
          if (timedOut) throw new CatalogDiscoveryTimeoutError();
          truncated = true;
        } finally {
          await categoryPage.close();
        }
      }
      const boundedProducts = [...new Set(productUrls)].slice(0, MAX_CANDIDATE_LINKS);
      return { productUrls: boundedProducts, categories, mappings, truncated: truncated || boundedProducts.length === MAX_CANDIDATE_LINKS };
    } catch (error) {
      if (timedOut && !(error instanceof UnsafeUrlError))
        throw new CatalogDiscoveryTimeoutError();
      throw error;
    } finally {
      clearTimeout(timeout);
      await browser?.close().catch(() => undefined);
    }
  }
}

export function categoryLinks(
  links: Array<string | { href: string; text: string }>,
  origin: string,
) {
  const categories = new Map<string, { url: string; name: string; source: "root_page_link" }>();
  for (const link of links) {
    try {
      const url = new URL(typeof link === "string" ? link : link.href);
      if (url.origin !== origin || !/^\/(?:collections?|categories|catalog)\/[^/]+\/?$/i.test(url.pathname)) continue;
      const normalized = url.href;
      if (!categories.has(normalized))
        categories.set(normalized, {
          url: normalized,
          name: typeof link === "string" ? "" : link.text,
          source: "root_page_link",
        });
    } catch { /* persistence rejects malformed URLs */ }
  }
  return [...categories.values()];
}

function redirectCount(request: Request) {
  let count = 0;
  let previous = request.redirectedFrom();
  while (previous) {
    count += 1;
    previous = previous.redirectedFrom();
  }
  return count;
}
