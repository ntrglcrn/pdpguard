import { gunzipSync } from "node:zlib";

import type { CatalogDiscoveryResult } from "@/domain/catalog";
import {
  systemDnsResolver,
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";

const MAX_REDIRECTS = 5;
const MAX_SITEMAPS = 10;
const MAX_DEPTH = 3;
const MAX_PAGE_URLS = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const DISCOVERY_TIMEOUT_MS = 15_000;

export class CatalogDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogDiscoveryError";
  }
}

export class CatalogDiscoveryTimeoutError extends CatalogDiscoveryError {
  constructor() {
    super("Sitemap discovery timed out.");
    this.name = "CatalogDiscoveryTimeoutError";
  }
}

type SitemapEntry = { url: string; depth: number };

function decodeXml(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    (entity, code: string) => {
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
      const value = Number.parseInt(
        code.slice(code[1]?.toLowerCase() === "x" ? 2 : 1),
        code[1]?.toLowerCase() === "x" ? 16 : 10,
      );
      return Number.isFinite(value) && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity;
    },
  );
}

function entryUrls(xml: string, tag: "url" | "sitemap"): string[] {
  const entries = xml.matchAll(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
  );
  const urls: string[] = [];
  for (const entry of entries) {
    const loc = entry[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1];
    if (loc) urls.push(decodeXml(loc.trim()));
  }
  return urls;
}

function normalizeHttpUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

async function readLimitedBody(response: Response, remainingBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > remainingBytes) {
    throw new CatalogDiscoveryError("The sitemap is too large to process.");
  }
  if (!response.body) return { text: "", bytes: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > remainingBytes) {
        throw new CatalogDiscoveryError("The sitemap is too large to process.");
      }
      chunks.push(value);
    }
    let body = Buffer.concat(chunks, bytes);
    if (body[0] === 0x1f && body[1] === 0x8b) {
      try {
        body = gunzipSync(body, { maxOutputLength: remainingBytes });
      } catch {
        throw new CatalogDiscoveryError(
          "The compressed sitemap is invalid or too large.",
        );
      }
    }
    return { text: new TextDecoder().decode(body), bytes: body.byteLength };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function fetchSitemap(
  input: string,
  resolver: DnsResolver,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  let url = await validatePublicUrl(input, resolver);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(url, {
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: { Accept: "application/xml,text/xml,text/plain" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location)
        throw new CatalogDiscoveryError("The sitemap redirect is invalid.");
      if (redirects === MAX_REDIRECTS)
        throw new CatalogDiscoveryError(
          `The sitemap exceeded ${MAX_REDIRECTS} redirects.`,
        );
      url = await validatePublicUrl(new URL(location, url).href, resolver);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CatalogDiscoveryError(
        `The sitemap returned HTTP ${response.status}.`,
      );
    }
    return { response, finalUrl: url.href };
  }
  throw new CatalogDiscoveryError("The sitemap redirect is invalid.");
}

export async function discoverCatalog(
  input: string,
  options: { resolver?: DnsResolver; fetcher?: typeof fetch } = {},
): Promise<CatalogDiscoveryResult> {
  const resolver = options.resolver ?? systemDnsResolver;
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  const queue: SitemapEntry[] = [{ url: input, depth: 0 }];
  const seenSitemaps = new Set<string>();
  const allowedOrigins = new Set<string>();
  const pageUrls = new Set<string>();
  let totalBytes = 0;
  let truncated = false;
  let rootUrl = input;

  try {
    while (
      queue.length &&
      seenSitemaps.size < MAX_SITEMAPS &&
      pageUrls.size < MAX_PAGE_URLS
    ) {
      const next = queue.shift();
      if (!next) break;
      const requestedUrl = (await validatePublicUrl(next.url, resolver)).href;
      if (seenSitemaps.has(requestedUrl)) continue;
      seenSitemaps.add(requestedUrl);

      const { response, finalUrl } = await fetchSitemap(
        requestedUrl,
        resolver,
        fetcher,
        controller.signal,
      );
      if (next.depth === 0) rootUrl = finalUrl;
      allowedOrigins.add(new URL(finalUrl).origin);
      const body = await readLimitedBody(
        response,
        MAX_TOTAL_BYTES - totalBytes,
      );
      totalBytes += body.bytes;
      if (!/<(?:[\w.-]+:)?(?:urlset|sitemapindex)\b/i.test(body.text)) {
        throw new CatalogDiscoveryError(
          "The response is not a supported XML sitemap.",
        );
      }

      const childSitemaps = entryUrls(body.text, "sitemap");
      if (childSitemaps.length) {
        if (next.depth >= MAX_DEPTH) {
          truncated = true;
          continue;
        }
        for (const child of childSitemaps) {
          const childUrl = normalizeHttpUrl(child, finalUrl);
          if (childUrl) queue.push({ url: childUrl, depth: next.depth + 1 });
        }
        continue;
      }

      for (const page of entryUrls(body.text, "url")) {
        const pageUrl = normalizeHttpUrl(page, finalUrl);
        if (
          !pageUrl ||
          !allowedOrigins.has(new URL(pageUrl).origin) ||
          pageUrls.has(pageUrl)
        )
          continue;
        if (pageUrls.size === MAX_PAGE_URLS) {
          truncated = true;
          break;
        }
        pageUrls.add(pageUrl);
      }
    }
    if (queue.length) truncated = true;

    return {
      sitemapUrl: rootUrl,
      pageUrls: [...pageUrls],
      inspectedSitemaps: seenSitemaps.size,
      truncated,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new CatalogDiscoveryTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
