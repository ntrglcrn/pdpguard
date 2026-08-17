import { describe, expect, it, vi } from "vitest";

import { discoverCatalog } from "@/lib/catalog-discovery";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("discoverCatalog", () => {
  it("extracts, decodes and deduplicates page URLs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<urlset>
          <url><loc>https://shop.example/products/shirt?a=1&amp;b=2</loc></url>
          <url><loc>https://shop.example/products/shirt?a=1&amp;b=2#details</loc></url>
          <url><loc>file:///etc/passwd</loc></url>
          <url><loc>http://127.0.0.1/admin</loc></url>
          <url><loc>https://untrusted.example/product</loc></url>
        </urlset>`,
        { status: 200 },
      ),
    );

    await expect(
      discoverCatalog("https://shop.example/sitemap.xml", {
        resolver: publicResolver,
        fetcher,
      }),
    ).resolves.toMatchObject({
      pageUrls: ["https://shop.example/products/shirt?a=1&b=2"],
      inspectedSitemaps: 1,
      truncated: false,
    });
  });

  it("follows a sitemap index and validated redirects", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/sitemap-index.xml" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          `<sitemapindex><sitemap><loc>https://cdn.example/products.xml</loc></sitemap></sitemapindex>`,
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<urlset><url><loc>https://shop.example/item/42</loc></url></urlset>`,
        ),
      );

    const result = await discoverCatalog("https://shop.example/sitemap.xml", {
      resolver: publicResolver,
      fetcher,
    });

    expect(result).toMatchObject({
      sitemapUrl: "https://shop.example/sitemap-index.xml",
      pageUrls: ["https://shop.example/item/42"],
      inspectedSitemaps: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("blocks a redirect to a private address before fetching it", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/sitemap.xml" },
      }),
    );

    await expect(
      discoverCatalog("https://shop.example/sitemap.xml", {
        resolver: publicResolver,
        fetcher,
      }),
    ).rejects.toThrow("non-public");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caps the result at 200 page URLs", async () => {
    const xml = `<urlset>${Array.from(
      { length: 201 },
      (_, index) =>
        `<url><loc>https://shop.example/products/${index}</loc></url>`,
    ).join("")}</urlset>`;
    const result = await discoverCatalog("https://shop.example/sitemap.xml", {
      resolver: publicResolver,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(xml)),
    });

    expect(result.pageUrls).toHaveLength(200);
    expect(result.truncated).toBe(true);
  });

  it("rejects sitemap bodies above the total byte limit", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("x", {
        headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      }),
    );

    await expect(
      discoverCatalog("https://shop.example/sitemap.xml", {
        resolver: publicResolver,
        fetcher,
      }),
    ).rejects.toThrow("too large");
  });

  it("rejects an HTML page instead of treating it as a sitemap", async () => {
    await expect(
      discoverCatalog("https://shop.example/sitemap.xml", {
        resolver: publicResolver,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("<html><body>Not found</body></html>"),
          ),
      }),
    ).rejects.toThrow("not a supported XML sitemap");
  });
});
