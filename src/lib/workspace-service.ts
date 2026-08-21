import { randomUUID } from "node:crypto";

import type { AuditResult } from "@/domain/audit";
import type {
  ArtifactReference,
  AuditRun,
  AuditRunReport,
  SaaSPrincipal,
  Store,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/domain/saas";
import { validatePublicUrl, type DnsResolver } from "@/lib/url-safety";

export class AuthorizationError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "AuthorizationError";
  }
}

/**
 * Process-local persistence model for the SaaS boundary. A durable store and
 * authenticated principal provider replace this at hosted deployment time.
 */
export class WorkspaceService {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly members = new Map<string, WorkspaceMember[]>();
  private readonly stores = new Map<string, Store>();
  private readonly runs = new Map<string, AuditRun>();
  private readonly findings = new Map<string, AuditRunReport["findings"]>();
  private readonly artifacts = new Map<string, ArtifactReference[]>();

  constructor(private readonly resolver?: DnsResolver) {}

  createWorkspace(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    name: string,
  ) {
    const workspace: Workspace = {
      id: randomUUID(),
      name: requiredName(name),
      createdAt: new Date().toISOString(),
    };
    this.workspaces.set(workspace.id, workspace);
    this.members.set(workspace.id, [
      { workspaceId: workspace.id, userId: principal.userId, role: "owner" },
    ]);
    return workspace;
  }

  addMember(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = "member",
  ) {
    this.requireRole(principal, workspaceId, "owner");
    if (!userId) throw new Error("A member user ID is required.");
    const members = this.members.get(workspaceId) ?? [];
    const existing = members.find((member) => member.userId === userId);
    if (existing) return existing;
    const member = { workspaceId, userId, role };
    members.push(member);
    this.members.set(workspaceId, members);
    return member;
  }

  createStore(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    workspaceId: string,
    input: { name: string; url: string },
  ) {
    this.requireMember(principal, workspaceId);
    const store: Store = {
      id: randomUUID(),
      workspaceId,
      name: requiredName(input.name),
      url: requiredHttpUrl(input.url),
      createdAt: new Date().toISOString(),
    };
    this.stores.set(store.id, store);
    return store;
  }

  async createAuditRun(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    storeId: string,
    targetUrl: string,
  ) {
    const store = this.requireStore(principal, storeId);
    const target = await validatePublicUrl(targetUrl, this.resolver);
    const run: AuditRun = {
      id: randomUUID(),
      workspaceId: store.workspaceId,
      storeId: store.id,
      targetUrl: target.href,
      status: "queued",
      createdAt: new Date().toISOString(),
      completedAt: null,
      result: null,
    };
    this.runs.set(run.id, run);
    return run;
  }

  completeAuditRun(
    principal: Extract<SaaSPrincipal, { kind: "worker" }>,
    result: AuditResult,
  ) {
    const run = this.runs.get(principal.auditRunId);
    if (!run || run.status !== "queued") throw new AuthorizationError();
    const completedAt = new Date().toISOString();
    const completed: AuditRun = {
      ...run,
      status: "completed",
      completedAt,
      result: withoutArtifacts(result),
    };
    this.runs.set(run.id, completed);
    this.findings.set(
      run.id,
      result.findings.map((finding) => ({ ...finding, auditRunId: run.id })),
    );
    this.artifacts.set(run.id, [
      {
        id: result.screenshot.id,
        auditRunId: run.id,
        kind: "screenshot",
        contentType: "image/png",
      },
    ]);
    return completed;
  }

  listStores(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    workspaceId: string,
  ) {
    this.requireMember(principal, workspaceId);
    return [...this.stores.values()].filter(
      (store) => store.workspaceId === workspaceId,
    );
  }

  listAuditRuns(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    storeId: string,
  ) {
    const store = this.requireStore(principal, storeId);
    return [...this.runs.values()].filter((run) => run.storeId === store.id);
  }

  getAuditRun(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    runId: string,
  ): AuditRunReport {
    const run = this.runs.get(runId);
    if (!run) throw new AuthorizationError();
    this.requireStore(principal, run.storeId);
    return {
      ...run,
      findings: this.findings.get(run.id) ?? [],
      artifacts: this.artifacts.get(run.id) ?? [],
    };
  }

  private requireStore(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    storeId: string,
  ) {
    const store = this.stores.get(storeId);
    if (!store) throw new AuthorizationError();
    this.requireMember(principal, store.workspaceId);
    return store;
  }

  private requireMember(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    workspaceId: string,
  ) {
    if (!this.workspaces.has(workspaceId)) throw new AuthorizationError();
    const member = this.members
      .get(workspaceId)
      ?.find((candidate) => candidate.userId === principal.userId);
    if (!member) throw new AuthorizationError();
    return member;
  }

  private requireRole(
    principal: Extract<SaaSPrincipal, { kind: "user" }>,
    workspaceId: string,
    role: WorkspaceRole,
  ) {
    const member = this.requireMember(principal, workspaceId);
    if (member.role !== role) throw new AuthorizationError();
    return member;
  }
}

function requiredName(value: string) {
  const name = value.trim();
  if (!name || name.length > 120)
    throw new Error("Name must be 1–120 characters.");
  return name;
}

function requiredHttpUrl(value: string) {
  if (value.length > 2_048) throw new Error("The URL is too long.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP and HTTPS URLs are allowed.");
  if (url.username || url.password)
    throw new Error("URLs containing credentials are not allowed.");
  url.hash = "";
  return url.href;
}

function withoutArtifacts(result: AuditResult): AuditRun["result"] {
  const { findings, screenshot, ...stored } = result;
  void findings;
  void screenshot;
  return stored;
}
