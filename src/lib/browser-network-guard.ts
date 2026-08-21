import type { BrowserContext, Page, Request } from "playwright";

import {
  UnsafeUrlError,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const MAX_REDIRECTS = 5;

function redirectCount(request: Request): number {
  let count = 0;
  let previous = request.redirectedFrom();
  while (previous) {
    count += 1;
    previous = previous.redirectedFrom();
  }
  return count;
}

export async function installBrowserNetworkGuard(
  context: BrowserContext,
  page: Page,
  resolver: DnsResolver,
) {
  let blockedRequestCount = 0;
  let observedRedirectCount = 0;
  let fatalSafetyError: UnsafeUrlError | null = null;
  const safeHostCache = new Set<string>();

  await context.route("**/*", async (route) => {
    const request = route.request();
    const isMainNavigation =
      request.isNavigationRequest() && request.frame() === page.mainFrame();
    const currentRedirectCount = isMainNavigation ? redirectCount(request) : 0;
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
        await validatePublicUrl(request.url(), resolver);
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

  return {
    get blockedRequestCount() {
      return blockedRequestCount;
    },
    get redirectCount() {
      return observedRedirectCount;
    },
    get fatalSafetyError() {
      return fatalSafetyError;
    },
  };
}
