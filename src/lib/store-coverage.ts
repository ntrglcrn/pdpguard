import { createHash } from "node:crypto";
import type { AuditScopeInput, AuditScopeSnapshot, CatalogCategory, CatalogItem, CatalogSummary } from "@/domain/saas";

/** One server-authoritative product policy. The worker renews its lease, but each PDP may take 45 seconds. */
export const STORE_COVERAGE_POLICY = {
  presets: [10, 25] as const,
  customMin: 1,
  absoluteMax: 25,
  maxCategoryIds: 100,
  strategy: "representative" as const,
  selectionSemantics: "representative_category_round_robin_v2" as const,
};

export class CoverageInputError extends Error {
  constructor(message: string) { super(message); this.name = "CoverageInputError"; }
}

export function coverageRequest(input: AuditScopeInput) {
  if (input.kind !== "coverage") {
    const requested = input.kind === "all" ? input.requestedCoverage ?? 10 : 10;
    if (requested !== "all" && (!Number.isInteger(requested) || requested < STORE_COVERAGE_POLICY.customMin || requested > STORE_COVERAGE_POLICY.absoluteMax)) throw new CoverageInputError(`Coverage must be a whole number from ${STORE_COVERAGE_POLICY.customMin} to ${STORE_COVERAGE_POLICY.absoluteMax}.`);
    return { categoryIds: input.kind === "category" ? [input.categoryId] : [], includeUncategorized: input.kind === "uncategorized", requested };
  }
  if (input.categoryIds.length > STORE_COVERAGE_POLICY.maxCategoryIds) throw new CoverageInputError(`Select no more than ${STORE_COVERAGE_POLICY.maxCategoryIds} categories.`);
  const categoryIds = [...new Set(input.categoryIds.map(String).filter(Boolean))].sort();
  if (input.selectionStrategy !== undefined && input.selectionStrategy !== STORE_COVERAGE_POLICY.strategy) throw new CoverageInputError("Unsupported selection strategy.");
  if (!categoryIds.length && !input.includeUncategorized) throw new CoverageInputError("Select at least one category or Uncategorized.");
  if (input.requestedCoverage !== "all" && (!Number.isInteger(input.requestedCoverage) || input.requestedCoverage < STORE_COVERAGE_POLICY.customMin || input.requestedCoverage > STORE_COVERAGE_POLICY.absoluteMax))
    throw new CoverageInputError(`Coverage must be a whole number from ${STORE_COVERAGE_POLICY.customMin} to ${STORE_COVERAGE_POLICY.absoluteMax}.`);
  return { categoryIds, includeUncategorized: input.includeUncategorized, requested: input.requestedCoverage };
}

export function coverageScope(input: AuditScopeInput, categoryNames: string[], matching: CatalogItem[], selected: CatalogItem[], catalogComplete: boolean, catalogIdentity: string | null): AuditScopeSnapshot {
  const criteria = coverageRequest(input);
  const identity = { categoryIds: criteria.categoryIds, includeUncategorized: criteria.includeUncategorized, requestedCoverage: criteria.requested, selectionStrategy: STORE_COVERAGE_POLICY.strategy, selected: selected.map((item) => [item.id, item.normalizedUrl]), catalogIdentity };
  return {
    kind: input.kind === "all" ? "all" : "coverage",
    categoryId: JSON.stringify({ ids: criteria.categoryIds, uncategorized: criteria.includeUncategorized, coverage: criteria.requested }),
    categoryName: categoryNames.join(", ") || (criteria.includeUncategorized ? "Uncategorized" : null),
    matchingPdpCount: matching.length,
    executionLimit: STORE_COVERAGE_POLICY.absoluteMax,
    selectedCatalogItemIds: selected.map((item) => item.id),
    selectionSemantics: STORE_COVERAGE_POLICY.selectionSemantics,
    catalogComplete,
    version: 2,
    categoryIds: criteria.categoryIds,
    categoryNames,
    includeUncategorized: criteria.includeUncategorized,
    requestedCoverage: criteria.requested,
    effectiveCoverage: selected.length,
    absoluteSafetyMax: STORE_COVERAGE_POLICY.absoluteMax,
    selectionStrategy: STORE_COVERAGE_POLICY.strategy,
    selectedNormalizedUrls: selected.map((item) => item.normalizedUrl),
    catalogIdentity,
    fingerprint: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
  };
}

export function matchingItems(items: CatalogItem[], categoryIds: string[], includeUncategorized: boolean) {
  const chosen = new Set(categoryIds);
  return items.filter((item) => item.active && (!chosen.size && !includeUncategorized || item.categoryIds.some((id) => chosen.has(id)) || includeUncategorized && !item.categoryIds.length));
}

export function selectCoverage(items: CatalogItem[], categories: CatalogCategory[], categoryIds: string[], requested: number | "all") {
  const count = Math.min(requested === "all" ? STORE_COVERAGE_POLICY.absoluteMax : requested, STORE_COVERAGE_POLICY.absoluteMax, items.length);
  const ordered = [...items].sort((a, b) => a.normalizedUrl.localeCompare(b.normalizedUrl) || a.id.localeCompare(b.id));
  if (!categoryIds.length) return ordered.slice(0, count);
  const byCategory = categoryIds.map((id) => ordered.filter((item) => item.categoryIds.includes(id)));
  const selected: CatalogItem[] = [];
  for (let index = 0; selected.length < count && byCategory.some((items) => index < items.length); index += 1)
    for (const candidates of byCategory) {
      const item = candidates[index];
      if (item && !selected.some((chosen) => chosen.id === item.id)) selected.push(item);
      if (selected.length === count) break;
    }
  for (const item of ordered) {
    if (selected.length === count) break;
    if (!selected.some((chosen) => chosen.id === item.id)) selected.push(item);
  }
  void categories;
  return selected;
}

export function summarizeCatalog(items: CatalogItem[], categories: CatalogCategory[], latestDiscoveryAt: string | null, complete: boolean): CatalogSummary {
  const active = items.filter((item) => item.active);
  const counts: Record<string, number> = {};
  for (const item of active) for (const id of item.categoryIds) counts[id] = (counts[id] ?? 0) + 1;
  return {
    activePdpCount: active.length,
    inactivePdpCount: items.length - active.length,
    categorizedActivePdpCount: active.filter((item) => item.categoryIds.length).length,
    uncategorizedActivePdpCount: active.filter((item) => !item.categoryIds.length).length,
    activeCategoryCount: categories.filter((category) => category.active).length,
    latestDiscoveryAt,
    complete,
    categoryActivePdpCounts: counts,
  };
}

export function coverageMetrics(matching: number, selected: number, completed: number) {
  const percent = (value: number, total: number) => total > 0 ? (value / total) * 100 : null;
  return { planned: percent(selected, matching), executed: percent(completed, matching), completion: percent(completed, selected) };
}

export function readScopeSnapshot(value: Partial<AuditScopeSnapshot>): AuditScopeSnapshot {
  const matchingKnown = Number.isInteger(value.matchingPdpCount) && Number(value.matchingPdpCount) >= 0;
  return {
    kind: value.kind ?? "all",
    categoryId: value.categoryId ?? null,
    categoryName: value.categoryName ?? null,
    matchingPdpCount: matchingKnown ? Number(value.matchingPdpCount) : 0,
    executionLimit: Number.isInteger(value.executionLimit) && Number(value.executionLimit) > 0 ? Number(value.executionLimit) : 5,
    selectedCatalogItemIds: Array.isArray(value.selectedCatalogItemIds) ? value.selectedCatalogItemIds.map(String) : [],
    selectionSemantics: value.selectionSemantics ?? "active_catalog_url_order_v1",
    catalogComplete: value.catalogComplete ?? true,
    ...(value.version === 2 ? value : {}),
    coverageKnown: value.coverageKnown ?? matchingKnown,
  };
}
