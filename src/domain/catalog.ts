export interface CatalogDiscoveryResult {
  sourceUrl: string;
  sourceType: "sitemap" | "category";
  pageUrls: string[];
  inspectedSources: number;
  truncated: boolean;
}
