import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { AuditResult } from "@/domain/audit";
import type {
  ArtifactReference,
  AuditRun,
  AuditRunReport,
  AuthenticatedUser,
  Store,
  WorkerCapability,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/domain/saas";
import { validatePublicUrl, type DnsResolver } from "@/lib/url-safety";

const SESSION_COOKIE = "pdpguard_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_ARTIFACT_BYTES = 10 * 1_024 * 1_024;

export class AuthorizationError extends Error {
  constructor() {
    super("The requested resource was not found.");
    this.name = "AuthorizationError";
  }
}

export class WorkspaceService {
  private readonly database: DatabaseSync;

  // ponytail: SQLite is the single-node durable foundation; move the same
  // ownership queries to hosted SQL before horizontal workers are enabled.
  constructor(
    databasePath: string,
    private readonly resolver?: DnsResolver,
    private readonly maxArtifactBytes = MAX_ARTIFACT_BYTES,
  ) {
    if (databasePath !== ":memory:")
      mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    if (databasePath !== ":memory:") chmodSync(databasePath, 0o600);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close() {
    this.database.close();
  }

  createUser(userId: string) {
    const id = requiredId(userId);
    this.database
      .prepare("INSERT OR IGNORE INTO users (id) VALUES (?)")
      .run(id);
    return id;
  }

  /** Server-only: call after an external identity flow verifies the user. */
  issueSession(userId: string, ttlMs = SESSION_TTL_MS) {
    this.createUser(userId);
    const token = randomBytes(32).toString("base64url");
    const sessionId = tokenHash(token);
    this.database
      .prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      )
      .run(sessionId, userId, new Date(Date.now() + ttlMs).toISOString());
    return { token, cookie: sessionCookie(token, ttlMs) };
  }

  authenticateRequest(request: Request) {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((cookie) => cookie.trim().split("="))
      .find(([name]) => name === SESSION_COOKIE)?.[1];
    if (!token) throw new AuthorizationError();
    return this.authenticateSession(token);
  }

  authenticateSession(token: string): AuthenticatedUser {
    const sessionId = tokenHash(token);
    const session = this.database
      .prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?")
      .get(sessionId, new Date().toISOString()) as
      { user_id: string } | undefined;
    if (!session) throw new AuthorizationError();
    return { kind: "user", userId: session.user_id, sessionId };
  }

  revokeSession(principal: AuthenticatedUser) {
    this.requireAuthenticated(principal);
    this.database
      .prepare("DELETE FROM sessions WHERE id = ?")
      .run(principal.sessionId);
  }

  createWorkspace(principal: AuthenticatedUser, name: string) {
    this.requireAuthenticated(principal);
    const workspace: Workspace = {
      id: randomUUID(),
      name: requiredName(name),
      createdAt: new Date().toISOString(),
    };
    this.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)",
        )
        .run(workspace.id, workspace.name, workspace.createdAt);
      this.database
        .prepare(
          "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
        )
        .run(workspace.id, principal.userId);
    });
    return workspace;
  }

  addMember(
    principal: AuthenticatedUser,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = "member",
  ) {
    this.requireRole(principal, workspaceId, "owner");
    this.createUser(userId);
    this.database
      .prepare(
        "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)",
      )
      .run(workspaceId, requiredId(userId), role);
    return { workspaceId, userId, role } satisfies WorkspaceMember;
  }

  createStore(
    principal: AuthenticatedUser,
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
    this.database
      .prepare(
        "INSERT INTO stores (id, workspace_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(store.id, store.workspaceId, store.name, store.url, store.createdAt);
    return store;
  }

  async createAuditRun(
    principal: AuthenticatedUser,
    storeId: string,
    targetUrl: string,
  ) {
    const store = this.requireStore(principal, storeId);
    const run: AuditRun = {
      id: randomUUID(),
      workspaceId: store.workspaceId,
      storeId,
      targetUrl: (await validatePublicUrl(targetUrl, this.resolver)).href,
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      failureCategory: null,
      result: null,
    };
    const token = randomBytes(32).toString("base64url");
    this.database
      .prepare(
        `INSERT INTO audit_runs
          (id, workspace_id, store_id, target_url, status, created_at, worker_token_hash)
         VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
      )
      .run(
        run.id,
        run.workspaceId,
        run.storeId,
        run.targetUrl,
        run.createdAt,
        tokenHash(token),
      );
    return {
      run,
      worker: { kind: "worker", auditRunId: run.id, token } as const,
    };
  }

  startAuditRun(principal: WorkerCapability) {
    this.requireWorker(principal, "queued");
    const startedAt = new Date().toISOString();
    this.database
      .prepare(
        "UPDATE audit_runs SET status = 'running', started_at = ? WHERE id = ?",
      )
      .run(startedAt, principal.auditRunId);
    return this.readRun(principal.auditRunId);
  }

  completeAuditRun(
    principal: WorkerCapability,
    result: AuditResult,
    screenshot: { id: string; contents: Buffer },
  ) {
    const run = this.requireWorker(principal, "running");
    if (
      result.auditedUrl !== run.targetUrl ||
      result.screenshot.id !== screenshot.id
    )
      throw new AuthorizationError();
    if (screenshot.contents.byteLength > this.maxArtifactBytes)
      throw new Error("The artifact exceeds its size limit.");

    const completedAt = new Date().toISOString();
    const sha256 = createHash("sha256")
      .update(screenshot.contents)
      .digest("hex");
    this.transaction(() => {
      this.database
        .prepare(
          `UPDATE audit_runs
           SET status = 'completed', completed_at = ?, result_json = ?
           WHERE id = ? AND status = 'running'`,
        )
        .run(completedAt, JSON.stringify(withoutArtifacts(result)), run.id);
      const findingStatement = this.database.prepare(
        `INSERT INTO findings
          (id, audit_run_id, workspace_id, rule_id, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const finding of result.findings)
        findingStatement.run(
          finding.id,
          run.id,
          run.workspaceId,
          finding.ruleId,
          JSON.stringify(finding),
        );
      this.database
        .prepare(
          `INSERT INTO artifacts
            (id, audit_run_id, workspace_id, kind, content_type, byte_size, sha256, contents, created_at)
           VALUES (?, ?, ?, 'screenshot', 'image/png', ?, ?, ?, ?)`,
        )
        .run(
          screenshot.id,
          run.id,
          run.workspaceId,
          screenshot.contents.byteLength,
          sha256,
          screenshot.contents,
          completedAt,
        );
    });
    return this.readRun(run.id);
  }

  failAuditRun(
    principal: WorkerCapability,
    category: NonNullable<AuditRun["failureCategory"]>,
  ) {
    this.requireWorker(principal, "running");
    this.database
      .prepare(
        "UPDATE audit_runs SET status = 'failed', failure_category = ?, completed_at = ? WHERE id = ?",
      )
      .run(category, new Date().toISOString(), principal.auditRunId);
    return this.readRun(principal.auditRunId);
  }

  cancelAuditRun(principal: AuthenticatedUser, runId: string) {
    const run = this.requireRun(principal, runId);
    if (run.status !== "queued") throw new AuthorizationError();
    this.database
      .prepare(
        "UPDATE audit_runs SET status = 'cancelled', completed_at = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), run.id);
    return this.readRun(run.id);
  }

  listStores(principal: AuthenticatedUser, workspaceId: string) {
    this.requireMember(principal, workspaceId);
    return this.database
      .prepare(
        "SELECT * FROM stores WHERE workspace_id = ? ORDER BY created_at",
      )
      .all(workspaceId)
      .map(storeFromRow);
  }

  listAuditRuns(principal: AuthenticatedUser, storeId: string) {
    this.requireStore(principal, storeId);
    return this.database
      .prepare(
        "SELECT * FROM audit_runs WHERE store_id = ? ORDER BY created_at DESC",
      )
      .all(storeId)
      .map(runFromRow);
  }

  getAuditRun(principal: AuthenticatedUser, runId: string): AuditRunReport {
    const run = this.requireRun(principal, runId);
    const findings = this.database
      .prepare(
        "SELECT payload_json FROM findings WHERE audit_run_id = ? ORDER BY rowid",
      )
      .all(run.id)
      .map((row) => ({
        ...(JSON.parse(
          String(row.payload_json),
        ) as AuditResult["findings"][number]),
        auditRunId: run.id,
      }));
    const artifacts = this.database
      .prepare(
        `SELECT id, audit_run_id, kind, content_type, byte_size, sha256, created_at
         FROM artifacts WHERE audit_run_id = ?`,
      )
      .all(run.id)
      .map(artifactFromRow);
    return { ...run, findings, artifacts };
  }

  readArtifact(principal: AuthenticatedUser, artifactId: string) {
    this.requireAuthenticated(principal);
    const row = this.database
      .prepare(
        `SELECT a.* FROM artifacts a
         JOIN workspace_members m ON m.workspace_id = a.workspace_id
         JOIN audit_runs r ON r.id = a.audit_run_id AND r.workspace_id = a.workspace_id
         WHERE a.id = ? AND m.user_id = ?`,
      )
      .get(artifactId, principal.userId);
    if (!row) throw new AuthorizationError();
    return {
      reference: artifactFromRow(row),
      contents: Buffer.from(row.contents as Uint8Array),
    };
  }

  private requireAuthenticated(principal: AuthenticatedUser) {
    const row = this.database
      .prepare(
        "SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?",
      )
      .get(principal.sessionId, principal.userId, new Date().toISOString());
    if (!row) throw new AuthorizationError();
  }

  private requireMember(principal: AuthenticatedUser, workspaceId: string) {
    this.requireAuthenticated(principal);
    const member = this.database
      .prepare(
        "SELECT workspace_id, user_id, role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      )
      .get(workspaceId, principal.userId) as WorkspaceMember | undefined;
    if (!member) throw new AuthorizationError();
    return member;
  }

  private requireRole(
    principal: AuthenticatedUser,
    workspaceId: string,
    role: WorkspaceRole,
  ) {
    const member = this.requireMember(principal, workspaceId);
    if (member.role !== role) throw new AuthorizationError();
  }

  private requireStore(principal: AuthenticatedUser, storeId: string) {
    this.requireAuthenticated(principal);
    const row = this.database
      .prepare(
        `SELECT s.* FROM stores s
         JOIN workspace_members m ON m.workspace_id = s.workspace_id
         WHERE s.id = ? AND m.user_id = ?`,
      )
      .get(storeId, principal.userId);
    if (!row) throw new AuthorizationError();
    return storeFromRow(row);
  }

  private requireRun(principal: AuthenticatedUser, runId: string) {
    this.requireAuthenticated(principal);
    const row = this.database
      .prepare(
        `SELECT r.* FROM audit_runs r
         JOIN stores s ON s.id = r.store_id AND s.workspace_id = r.workspace_id
         JOIN workspace_members m ON m.workspace_id = r.workspace_id
         WHERE r.id = ? AND m.user_id = ?`,
      )
      .get(runId, principal.userId);
    if (!row) throw new AuthorizationError();
    return runFromRow(row);
  }

  private requireWorker(
    principal: WorkerCapability,
    status: AuditRun["status"],
  ) {
    const row = this.database
      .prepare(
        "SELECT * FROM audit_runs WHERE id = ? AND worker_token_hash = ? AND status = ?",
      )
      .get(principal.auditRunId, tokenHash(principal.token), status);
    if (!row) throw new AuthorizationError();
    return runFromRow(row);
  }

  private readRun(runId: string) {
    const row = this.database
      .prepare("SELECT * FROM audit_runs WHERE id = ?")
      .get(runId);
    if (!row) throw new AuthorizationError();
    return runFromRow(row);
  }

  private transaction<T>(operation: () => T) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        PRIMARY KEY (workspace_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS stores (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (id, workspace_id)
      );
      CREATE TABLE IF NOT EXISTS audit_runs (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        failure_category TEXT CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
        result_json TEXT,
        worker_token_hash TEXT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (id, workspace_id),
        FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT NOT NULL,
        audit_run_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (audit_run_id, id),
        FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT NOT NULL,
        audit_run_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind = 'screenshot'),
        content_type TEXT NOT NULL CHECK (content_type = 'image/png'),
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        sha256 TEXT NOT NULL,
        contents BLOB NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (id, workspace_id),
        FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS stores_workspace ON stores(workspace_id);
      CREATE INDEX IF NOT EXISTS runs_store ON audit_runs(store_id, created_at);
      CREATE INDEX IF NOT EXISTS artifacts_run ON artifacts(audit_run_id);
    `);
  }
}

function requiredId(value: string) {
  const id = value.trim();
  if (!id || id.length > 200) throw new Error("A valid ID is required.");
  return id;
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

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token: string, ttlMs: number) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=${Math.floor(ttlMs / 1_000)}`;
}

function withoutArtifacts(result: AuditResult): AuditRun["result"] {
  const { findings, screenshot, ...stored } = result;
  void findings;
  void screenshot;
  return stored;
}

function storeFromRow(row: Record<string, SQLInputValue>): Store {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    url: String(row.url),
    createdAt: String(row.created_at),
  };
}

function runFromRow(row: Record<string, SQLInputValue>): AuditRun {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    storeId: String(row.store_id),
    targetUrl: String(row.target_url),
    status: String(row.status) as AuditRun["status"],
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    failureCategory: row.failure_category
      ? (String(row.failure_category) as AuditRun["failureCategory"])
      : null,
    result: row.result_json
      ? (JSON.parse(String(row.result_json)) as NonNullable<AuditRun["result"]>)
      : null,
  };
}

function artifactFromRow(
  row: Record<string, SQLInputValue>,
): ArtifactReference {
  return {
    id: String(row.id),
    auditRunId: String(row.audit_run_id),
    kind: "screenshot",
    contentType: "image/png",
    byteSize: Number(row.byte_size),
    sha256: String(row.sha256),
    createdAt: String(row.created_at),
  };
}
