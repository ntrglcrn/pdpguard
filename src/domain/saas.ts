import type { AuditResult, Finding } from "@/domain/audit";

export type WorkspaceRole = "owner" | "member";
export type AuditRunStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

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
