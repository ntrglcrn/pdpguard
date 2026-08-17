import type { AuditResult } from "@/domain/audit";

export interface CatalogDiscoveryResult {
  sourceUrl: string;
  sourceType: "sitemap" | "category";
  pageUrls: string[];
  inspectedSources: number;
  truncated: boolean;
}

export interface BatchAuditItem {
  url: string;
  result: AuditResult | null;
  error: string | null;
}

export interface BatchAuditResult {
  startedAt: string;
  finishedAt: string;
  items: BatchAuditItem[];
  counts: {
    completed: number;
    failed: number;
    critical: number;
    warning: number;
    passed: number;
  };
}

export function summarizeBatchItems(items: BatchAuditItem[]) {
  return {
    completed: items.filter((item) => item.result).length,
    failed: items.filter((item) => item.error).length,
    critical: items.filter((item) => item.result?.summary.status === "critical")
      .length,
    warning: items.filter((item) => item.result?.summary.status === "warning")
      .length,
    passed: items.filter((item) => item.result?.summary.status === "passed")
      .length,
  };
}
