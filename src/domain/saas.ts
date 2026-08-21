import type { AuditResult, Finding } from "@/domain/audit";

export type WorkspaceRole = "owner" | "member";
export type AuditRunStatus = "queued" | "completed";

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

export interface AuditRun {
  id: string;
  workspaceId: string;
  storeId: string;
  targetUrl: string;
  status: AuditRunStatus;
  createdAt: string;
  completedAt: string | null;
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
}

export interface AuditRunReport extends AuditRun {
  findings: StoredFinding[];
  artifacts: ArtifactReference[];
}

export type SaaSPrincipal =
  { kind: "user"; userId: string } | { kind: "worker"; auditRunId: string };
