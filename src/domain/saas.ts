import type { AuditResult, Finding } from "@/domain/audit";

export type WorkspaceRole = "owner" | "member";
export type AuditRunStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";
export type CatalogDiscoveryStatus =
  "not_started" | "running" | "succeeded" | "failed";
export type StoreAuditRunStatus =
  | "running"
  | "completed"
  | "completed_with_failures"
  | "failed";
export type IssueLifecycle = "new" | "unchanged" | "resolved" | "regressed";

export interface AuthenticatedUser {
  kind: "user";
  userId: string;
  sessionId: string;
}

export interface WorkerCapability {
  kind: "worker";
  auditRunId: string;
  token: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface Store {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  workspaceId: string;
  storeId: string;
  normalizedUrl: string;
  source: "root_page_link";
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
  categoryIds: string[];
}

export interface CatalogCategory {
  id: string;
  workspaceId: string;
  storeId: string;
  normalizedPath: string;
  name: string;
  source: "root_page_link" | "category_page_link";
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
}

export interface CatalogCategoryMapping {
  catalogItemId: string;
  categoryId: string;
}

export type AuditScopeInput =
  | { kind: "all" }
  | { kind: "category"; categoryId: string }
  | { kind: "uncategorized" };

export interface AuditScopeSnapshot {
  kind: AuditScopeInput["kind"];
  categoryId: string | null;
  categoryName: string | null;
  matchingPdpCount: number;
  executionLimit: number;
  selectedCatalogItemIds: string[];
  selectionSemantics: "active_catalog_url_order_v1";
  catalogComplete: boolean;
}

export interface CatalogDiscovery {
  storeId: string;
  status: CatalogDiscoveryStatus;
  startedAt: string | null;
  completedAt: string | null;
  failureCategory: "infrastructure" | "timeout" | "unsafe_url" | null;
  discoveredCount: number;
  rejectedCount: number;
  partial: boolean;
}

export interface StoreCatalog {
  discovery: CatalogDiscovery;
  items: CatalogItem[];
  categories: CatalogCategory[];
  categoryMappings: CatalogCategoryMapping[];
}

export interface AuditRun {
  id: string;
  workspaceId: string;
  storeId: string;
  targetUrl: string;
  status: AuditRunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCategory: "infrastructure" | "timeout" | "unsafe_url" | null;
  result: Omit<AuditResult, "findings" | "screenshot"> | null;
}

export interface StoredFinding extends Finding {
  auditRunId: string;
}

export interface ArtifactReference {
  id: string;
  auditRunId: string;
  kind: "screenshot";
  contentType: "image/png";
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface AuditRunReport extends AuditRun {
  findings: StoredFinding[];
  artifacts: ArtifactReference[];
}

export interface StoreAuditSummary {
  issueCount: number;
  criticalCount: number;
  warningCount: number;
}

export interface StoreAuditRun {
  id: string;
  workspaceId: string;
  storeId: string;
  status: StoreAuditRunStatus;
  selectionMode: "automatic_bounded_active_catalog_v1";
  selectionSignature: string;
  rulesetVersion: string;
  scope: AuditScopeSnapshot;
  selectedPdpCount: number;
  completedPdpCount: number;
  failedPdpCount: number;
  startedAt: string;
  completedAt: string | null;
  summary: StoreAuditSummary | null;
}

export interface StoreAuditRunItem {
  id: string;
  storeAuditRunId: string;
  catalogItemId: string;
  normalizedUrl: string;
  position: number;
  auditRunId: string | null;
  failureCategory: AuditRun["failureCategory"];
}

export interface StoreIssueAffectedPdp {
  catalogItemId: string;
  normalizedUrl: string;
  auditRunId: string;
  pageTitle: string;
  finding: StoredFinding;
  artifacts: ArtifactReference[];
}

export interface StoreIssue {
  ruleId: string;
  severity: Finding["severity"];
  title: string;
  affectedPdpCount: number;
  auditedPdpCount: number;
  lifecycle: IssueLifecycle | null;
  affectedPdps: StoreIssueAffectedPdp[];
}

export interface StoreAuditRunReport extends StoreAuditRun {
  items: StoreAuditRunItem[];
  issues: StoreIssue[];
}
