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
  CatalogDiscovery,
  CatalogCategory,
  CatalogItem,
  AuditScopeInput,
  AuditScopeSnapshot,
  MonitoringIssue,
  MonitoringReport,
  MonitoringTargetSummary,
  Store,
  StoreAuditRun,
  StoreAuditRunItem,
  StoreAuditRunReport,
  StoreIssue,
  StoreCatalog,
  WorkerCapability,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "@/domain/saas";
import type { CatalogDiscoveryResult } from "@/lib/catalog-discovery";
import {
  validatePublicUrl,
  type DnsResolver,
} from "@/lib/url-safety";
import {
  AuthorizationError,
  CatalogDiscoveryDeadlineError,
  EmptyStoreCatalogError,
  normalizedHref,
  requiredId,
  requiredCategoryName,
  requiredName,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookie,
  STORE_AUDIT_MAX_PDPS,
  STORE_AUDIT_RULESET_VERSION,
  UnsafeStoreTargetError,
  validateBeforeDeadline,
} from "@/lib/workspace-contract";

export {
  AuthorizationError,
  CatalogDiscoveryDeadlineError,
  EmptyStoreCatalogError,
  SESSION_COOKIE_NAME,
  UnsafeStoreTargetError,
  STORE_AUDIT_MAX_PDPS,
  STORE_AUDIT_RULESET_VERSION,
} from "@/lib/workspace-contract";

const MAX_ARTIFACT_BYTES = 10 * 1_024 * 1_024;

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
  issueSession(
    userId: string,
    ttlMs = SESSION_TTL_MS,
    options: { secureCookie?: boolean } = {},
  ) {
    this.createUser(userId);
    const token = randomBytes(32).toString("base64url");
    const sessionId = tokenHash(token);
    this.database
      .prepare(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      )
      .run(sessionId, userId, new Date(Date.now() + ttlMs).toISOString());
    return {
      token,
      cookie: sessionCookie(token, ttlMs, options.secureCookie ?? true),
    };
  }

  authenticateRequest(request: Request) {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((cookie) => cookie.trim().split("="))
      .find(([name]) => name === SESSION_COOKIE_NAME)?.[1];
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

  listWorkspaces(principal: AuthenticatedUser) {
    this.requireAuthenticated(principal);
    return this.database
      .prepare(
        `SELECT w.* FROM workspaces w
         JOIN workspace_members m ON m.workspace_id = w.id
         WHERE m.user_id = ? ORDER BY w.created_at`,
      )
      .all(principal.userId)
      .map(workspaceFromRow);
  }

  getWorkspaceMembership(principal: AuthenticatedUser, workspaceId: string) {
    return this.requireMember(principal, workspaceId);
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

  async createStore(
    principal: AuthenticatedUser,
    workspaceId: string,
    input: { name?: string; url: string },
  ) {
    this.requireMember(principal, workspaceId);
    const url = await validatePublicUrl(input.url, this.resolver);
    const store: Store = {
      id: randomUUID(),
      workspaceId,
      name: requiredName(input.name?.trim() || url.hostname),
      url: url.origin,
      createdAt: new Date().toISOString(),
    };
    this.database
      .prepare(
        "INSERT INTO stores (id, workspace_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(store.id, store.workspaceId, store.name, store.url, store.createdAt);
    return store;
  }

  getStore(principal: AuthenticatedUser, storeId: string) {
    return this.requireStore(principal, storeId);
  }

  getStoreCatalog(principal: AuthenticatedUser, storeId: string): StoreCatalog {
    this.requireStore(principal, storeId);
    const discoveryRow = this.database
      .prepare("SELECT * FROM catalog_discoveries WHERE store_id = ?")
      .get(storeId);
    const items = this.database
      .prepare(
        `SELECT * FROM catalog_items
         WHERE store_id = ? ORDER BY active DESC, normalized_url`,
      )
      .all(storeId)
      .map((row) => catalogItemFromRow(row, this.categoryIdsForItem(String(row.id))));
    const categories = this.database.prepare("SELECT * FROM catalog_categories WHERE store_id = ? ORDER BY active DESC, name, id").all(storeId).map(catalogCategoryFromRow);
    const categoryMappings = this.database.prepare("SELECT catalog_item_id, category_id FROM catalog_category_mappings WHERE store_id = ?").all(storeId).map((row) => ({ catalogItemId: String(row.catalog_item_id), categoryId: String(row.category_id) }));
    return {
      discovery: discoveryRow
        ? catalogDiscoveryFromRow(discoveryRow)
        : {
            storeId,
            status: "not_started",
            startedAt: null,
            completedAt: null,
            failureCategory: null,
            discoveredCount: 0,
            rejectedCount: 0,
            partial: false,
          },
      items,
      categories,
      categoryMappings,
    };
  }

  startCatalogDiscovery(principal: AuthenticatedUser, storeId: string) {
    const store = this.requireStore(principal, storeId);
    const startedAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO catalog_discoveries
          (store_id, workspace_id, status, started_at, discovered_count, rejected_count)
         VALUES (?, ?, 'running', ?, 0, 0)
         ON CONFLICT(store_id) DO UPDATE SET
           status = 'running', started_at = excluded.started_at,
           completed_at = NULL, failure_category = NULL,
           discovered_count = 0, rejected_count = 0`,
      )
      .run(store.id, store.workspaceId, startedAt);
    return store;
  }

  async completeCatalogDiscovery(
    principal: AuthenticatedUser,
    storeId: string,
    candidateUrls: string[] | CatalogDiscoveryResult,
    deadline = Number.POSITIVE_INFINITY,
  ) {
    const store = this.requireStore(principal, storeId);
    const discovery = Array.isArray(candidateUrls) ? { productUrls: candidateUrls, categories: [], mappings: [], truncated: false } : candidateUrls;
    const normalizedUrls = new Set<string>();
    let rejectedCount = 0;

    const boundedCandidates = discovery.productUrls.slice(0, 200);
    rejectedCount += discovery.productUrls.length - boundedCandidates.length;
    for (const candidate of boundedCandidates) {
      try {
        // Reject a foreign origin before DNS work; same-origin URLs still pass
        // the full public-network validation below.
        if (new URL(candidate).origin !== store.url) {
          rejectedCount += 1;
          continue;
        }
        const url = await validateBeforeDeadline(
          candidate,
          this.resolver,
          deadline,
        );
        normalizedUrls.add(url.href);
      } catch (error) {
        if (error instanceof CatalogDiscoveryDeadlineError) throw error;
        rejectedCount += 1;
      }
    }

    const completedAt = new Date().toISOString();
    this.transaction(() => {
      this.database
        .prepare("UPDATE catalog_items SET active = 0 WHERE store_id = ?")
        .run(store.id);
      const upsert = this.database.prepare(
        `INSERT INTO catalog_items
          (id, workspace_id, store_id, normalized_url, source, first_seen_at, last_seen_at, active)
         VALUES (?, ?, ?, ?, 'root_page_link', ?, ?, 1)
         ON CONFLICT(store_id, normalized_url) DO UPDATE SET
           last_seen_at = excluded.last_seen_at, active = 1`,
      );
      for (const normalizedUrl of normalizedUrls)
        upsert.run(
          randomUUID(),
          store.workspaceId,
          store.id,
          normalizedUrl,
          completedAt,
          completedAt,
        );
      this.database.prepare("UPDATE catalog_categories SET active = 0 WHERE store_id = ?").run(store.id);
      const categoryByUrl = new Map<string, string>();
      const categoryUpsert = this.database.prepare(`INSERT INTO catalog_categories (id, workspace_id, store_id, normalized_path, name, source, first_seen_at, last_seen_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(store_id, normalized_path) DO UPDATE SET name = excluded.name, source = excluded.source, last_seen_at = excluded.last_seen_at, active = 1`);
      for (const candidate of discovery.categories.slice(0, 30)) {
        try {
          const url = new URL(candidate.url);
          if (url.origin !== store.url) { rejectedCount += 1; continue; }
          const identity = url.pathname.replace(/\/$/, "") || "/";
          const existing = this.database.prepare("SELECT id FROM catalog_categories WHERE store_id = ? AND normalized_path = ?").get(store.id, identity) as { id: string } | undefined;
          const id = existing?.id ?? randomUUID();
          categoryUpsert.run(id, store.workspaceId, store.id, identity, requiredCategoryName(candidate.name), candidate.source ?? "root_page_link", completedAt, completedAt);
          categoryByUrl.set(url.href, id);
        } catch { rejectedCount += 1; }
      }
      this.database.prepare("DELETE FROM catalog_category_mappings WHERE store_id = ?").run(store.id);
      const mappingInsert = this.database.prepare("INSERT OR IGNORE INTO catalog_category_mappings (store_id, catalog_item_id, category_id) VALUES (?, ?, ?)");
      for (const mapping of discovery.mappings) {
        const categoryId = categoryByUrl.get(normalizedHref(mapping.categoryUrl));
        const item = this.database.prepare("SELECT id FROM catalog_items WHERE store_id = ? AND normalized_url = ?").get(store.id, normalizedHref(mapping.productUrl)) as { id: string } | undefined;
        if (categoryId && item) mappingInsert.run(store.id, item.id, categoryId);
      }
      this.database
        .prepare(
          `UPDATE catalog_discoveries
           SET status = 'succeeded', completed_at = ?, failure_category = NULL,
               discovered_count = ?, rejected_count = ?, partial = ?
           WHERE store_id = ?`,
        )
        .run(completedAt, normalizedUrls.size, rejectedCount, discovery.truncated ? 1 : 0, store.id);
    });
    return this.getStoreCatalog(principal, store.id);
  }

  failCatalogDiscovery(
    principal: AuthenticatedUser,
    storeId: string,
    category: NonNullable<CatalogDiscovery["failureCategory"]>,
  ) {
    this.requireStore(principal, storeId);
    this.database
      .prepare(
        `UPDATE catalog_discoveries
         SET status = 'failed', completed_at = ?, failure_category = ?
         WHERE store_id = ?`,
      )
      .run(new Date().toISOString(), category, storeId);
    return this.getStoreCatalog(principal, storeId);
  }

  async createAuditRun(
    principal: AuthenticatedUser,
    storeId: string,
    targetUrl: string,
  ) {
    const store = this.requireStore(principal, storeId);
    const target = await validatePublicUrl(targetUrl, this.resolver);
    if (target.origin !== new URL(store.url).origin)
      throw new UnsafeStoreTargetError();
    const run: AuditRun = {
      id: randomUUID(),
      workspaceId: store.workspaceId,
      storeId,
      targetUrl: target.href,
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
        `SELECT r.* FROM audit_runs r
         WHERE r.store_id = ? AND NOT EXISTS (
           SELECT 1 FROM store_audit_run_items i WHERE i.audit_run_id = r.id
         ) ORDER BY r.created_at DESC`,
      )
      .all(storeId)
      .map(runFromRow);
  }

  createStoreAuditRun(principal: AuthenticatedUser, storeId: string, input: AuditScopeInput = { kind: "all" }) {
    const store = this.requireStore(principal, storeId);
    const scopeKind = input.kind;
    const categoryId = input.kind === "category" ? input.categoryId : null;
    const category = categoryId ? this.database.prepare("SELECT * FROM catalog_categories WHERE id = ? AND store_id = ? AND active = 1").get(categoryId, storeId) : undefined;
    if (categoryId && !category) throw new AuthorizationError();
    const matching = this.database.prepare(
      `SELECT i.id, i.normalized_url FROM catalog_items i
       WHERE i.store_id = ? AND i.active = 1 AND (
         ? = 'all' OR (? = 'category' AND EXISTS (SELECT 1 FROM catalog_category_mappings m WHERE m.catalog_item_id = i.id AND m.category_id = ?))
         OR (? = 'uncategorized' AND NOT EXISTS (SELECT 1 FROM catalog_category_mappings m WHERE m.catalog_item_id = i.id))
       ) ORDER BY i.normalized_url, i.id`,
    ).all(storeId, scopeKind, scopeKind, categoryId ?? "", scopeKind) as Record<string, SQLInputValue>[];
    const selected = matching.slice(0, STORE_AUDIT_MAX_PDPS);
    if (!selected.length) throw new EmptyStoreCatalogError();
    const catalogDiscovery = this.database.prepare("SELECT status, partial FROM catalog_discoveries WHERE store_id = ?").get(storeId) as { status?: string; partial?: number } | undefined;
    const scope: AuditScopeSnapshot = { kind: scopeKind, categoryId, categoryName: category ? String(category.name) : null, matchingPdpCount: matching.length, executionLimit: STORE_AUDIT_MAX_PDPS, selectedCatalogItemIds: selected.map((item) => String(item.id)), selectionSemantics: "active_catalog_url_order_v1", catalogComplete: catalogDiscovery?.status === "succeeded" && !catalogDiscovery.partial };

    const startedAt = new Date().toISOString();
    const run: StoreAuditRun = {
      id: randomUUID(),
      workspaceId: store.workspaceId,
      storeId,
      status: "running",
      selectionMode: "automatic_bounded_active_catalog_v1",
      selectionSignature: createHash("sha256").update(JSON.stringify({ scope, selected: selected.map((item) => [item.id, item.normalized_url]), ruleset: STORE_AUDIT_RULESET_VERSION })).digest("hex"),
      rulesetVersion: STORE_AUDIT_RULESET_VERSION,
      scope,
      selectedPdpCount: selected.length,
      completedPdpCount: 0,
      failedPdpCount: 0,
      startedAt,
      completedAt: null,
      summary: null,
    };
    const items: StoreAuditRunItem[] = selected.map((item, position) => ({
      id: randomUUID(),
      storeAuditRunId: run.id,
      catalogItemId: String(item.id),
      normalizedUrl: String(item.normalized_url),
      position,
      auditRunId: null,
      failureCategory: null,
    }));
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO store_audit_runs
            (id, workspace_id, store_id, status, selection_mode, selection_signature,
             ruleset_version, scope_snapshot_json, selected_pdp_count, completed_pdp_count,
             failed_pdp_count, started_at)
           VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, 0, 0, ?)`,
        )
        .run(
          run.id,
          run.workspaceId,
          run.storeId,
          run.selectionMode,
          run.selectionSignature,
          run.rulesetVersion,
          JSON.stringify(run.scope),
          run.selectedPdpCount,
          run.startedAt,
        );
      const insert = this.database.prepare(
        `INSERT INTO store_audit_run_items
          (id, store_audit_run_id, workspace_id, store_id, catalog_item_id,
           normalized_url, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of items)
        insert.run(
          item.id,
          run.id,
          run.workspaceId,
          run.storeId,
          item.catalogItemId,
          item.normalizedUrl,
          item.position,
        );
    });
    return { run, items };
  }

  linkStoreAuditRunItem(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
    itemId: string,
    auditRunId: string,
  ) {
    const parent = this.requireStoreAuditRun(principal, storeAuditRunId);
    if (parent.status !== "running") throw new AuthorizationError();
    const result = this.database
      .prepare(
        `UPDATE store_audit_run_items SET audit_run_id = ?
         WHERE id = ? AND store_audit_run_id = ? AND workspace_id = ?
           AND store_id = ? AND audit_run_id IS NULL
           AND EXISTS (
             SELECT 1 FROM audit_runs r
             WHERE r.id = ? AND r.workspace_id = ? AND r.store_id = ?
           )`,
      )
      .run(
        auditRunId,
        itemId,
        parent.id,
        parent.workspaceId,
        parent.storeId,
        auditRunId,
        parent.workspaceId,
        parent.storeId,
      );
    if (result.changes !== 1) throw new AuthorizationError();
  }

  recordStoreAuditItemFailure(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
    itemId: string,
    category: NonNullable<AuditRun["failureCategory"]>,
  ) {
    const parent = this.requireStoreAuditRun(principal, storeAuditRunId);
    if (parent.status !== "running") throw new AuthorizationError();
    const result = this.database
      .prepare(
        `UPDATE store_audit_run_items SET failure_category = ?
         WHERE id = ? AND store_audit_run_id = ? AND failure_category IS NULL`,
      )
      .run(category, itemId, parent.id);
    if (result.changes !== 1) throw new AuthorizationError();
    return this.refreshStoreAuditProgress(parent.id);
  }

  refreshStoreAuditProgress(storeAuditRunId: string) {
    const counts = this.database
      .prepare(
        `SELECT
           SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN i.failure_category IS NOT NULL OR r.status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM store_audit_run_items i
         LEFT JOIN audit_runs r ON r.id = i.audit_run_id
         WHERE i.store_audit_run_id = ?`,
      )
      .get(storeAuditRunId) as Record<string, SQLInputValue>;
    this.database
      .prepare(
        `UPDATE store_audit_runs SET completed_pdp_count = ?, failed_pdp_count = ?
         WHERE id = ? AND status = 'running'`,
      )
      .run(Number(counts.completed ?? 0), Number(counts.failed ?? 0), storeAuditRunId);
    return this.readStoreAuditRun(storeAuditRunId);
  }

  completeStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ) {
    let run = this.requireStoreAuditRun(principal, storeAuditRunId);
    if (run.status !== "running") throw new AuthorizationError();
    run = this.refreshStoreAuditProgress(run.id);
    const status =
      run.completedPdpCount === run.selectedPdpCount
        ? "completed"
        : run.completedPdpCount > 0
          ? "completed_with_failures"
          : "failed";
    const issueRows = this.issueRows(run.id);
    const summary = {
      issueCount: new Set(issueRows.map((row) => String(row.rule_id))).size,
      criticalCount: new Set(
        issueRows
          .filter((row) => JSON.parse(String(row.payload_json)).severity === "critical")
          .map((row) => String(row.rule_id)),
      ).size,
      warningCount: new Set(
        issueRows
          .filter((row) => JSON.parse(String(row.payload_json)).severity === "warning")
          .map((row) => String(row.rule_id)),
      ).size,
    };
    this.database
      .prepare(
        `UPDATE store_audit_runs
         SET status = ?, completed_at = ?, summary_json = ? WHERE id = ?`,
      )
      .run(status, new Date().toISOString(), JSON.stringify(summary), run.id);
    return this.getStoreAuditRun(principal, run.id);
  }

  failStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ) {
    let run = this.requireStoreAuditRun(principal, storeAuditRunId);
    if (run.status !== "running") return run;
    this.database
      .prepare(
        `UPDATE store_audit_run_items SET failure_category = 'infrastructure'
         WHERE store_audit_run_id = ? AND failure_category IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM audit_runs r
             WHERE r.id = store_audit_run_items.audit_run_id
               AND r.status = 'completed'
           )`,
      )
      .run(run.id);
    run = this.refreshStoreAuditProgress(run.id);
    const status =
      run.completedPdpCount === run.selectedPdpCount
        ? "completed"
        : run.completedPdpCount > 0
          ? "completed_with_failures"
          : "failed";
    this.database
      .prepare(
        `UPDATE store_audit_runs SET status = ?, completed_at = ?
         WHERE id = ? AND status = 'running'`,
      )
      .run(status, new Date().toISOString(), run.id);
    return this.readStoreAuditRun(run.id);
  }

  listStoreAuditRuns(principal: AuthenticatedUser, storeId: string) {
    this.requireStore(principal, storeId);
    return this.database
      .prepare(
        "SELECT * FROM store_audit_runs WHERE store_id = ? ORDER BY started_at DESC, id DESC",
      )
      .all(storeId)
      .map(storeAuditRunFromRow);
  }

  listMonitoringTargets(
    principal: AuthenticatedUser,
    storeId: string,
  ): MonitoringTargetSummary[] {
    this.requireStore(principal, storeId);
    const runs = this.database
      .prepare(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY COALESCE(json_extract(scope_snapshot_json, '$.kind'), 'all'),
             COALESCE(json_extract(scope_snapshot_json, '$.categoryId'), ''),
             COALESCE(json_extract(scope_snapshot_json, '$.selectionSemantics'), 'active_catalog_url_order_v1'),
             COALESCE(json_extract(scope_snapshot_json, '$.executionLimit'), 5)
             ORDER BY started_at DESC, id DESC
           ) AS position FROM store_audit_runs WHERE store_id = ?
         ) WHERE position = 1 ORDER BY started_at DESC, id DESC LIMIT 30`,
      )
      .all(storeId)
      .map(storeAuditRunFromRow);
    const targets = new Map<string, MonitoringTargetSummary>();
    for (const run of runs) {
      const key = this.monitoringScopeKey(run);
      const target = targets.get(key);
      if (!target) {
        const confirmed = this.database.prepare(
          `SELECT * FROM store_audit_runs WHERE store_id = ? AND status = 'completed'
           AND COALESCE(json_extract(scope_snapshot_json, '$.kind'), 'all') = ?
           AND COALESCE(json_extract(scope_snapshot_json, '$.categoryId'), '') = ?
           AND COALESCE(json_extract(scope_snapshot_json, '$.selectionSemantics'), 'active_catalog_url_order_v1') = ?
           AND COALESCE(json_extract(scope_snapshot_json, '$.executionLimit'), 5) = ?
           ORDER BY started_at DESC, id DESC LIMIT 1`,
        ).get(storeId, run.scope.kind, run.scope.categoryId ?? "", run.scope.selectionSemantics, run.scope.executionLimit);
        targets.set(key, {
          referenceRunId: run.id,
          scope: run.scope,
          latestAttempt: run,
          lastConfirmed: confirmed && storeAuditRunFromRow(confirmed).scope.catalogComplete ? storeAuditRunFromRow(confirmed) : null,
        });
      } else if (!target.lastConfirmed && this.isConfirmedRun(run)) {
        target.lastConfirmed = run;
      }
    }
    return [...targets.values()];
  }

  getMonitoringReport(
    principal: AuthenticatedUser,
    storeId: string,
    referenceRunId: string,
  ): MonitoringReport {
    this.requireStore(principal, storeId);
    const reference = this.requireStoreAuditRun(principal, referenceRunId);
    if (reference.storeId !== storeId) throw new AuthorizationError();
    const scopeWhere = `store_id = ? AND COALESCE(json_extract(scope_snapshot_json, '$.kind'), 'all') = ?
      AND COALESCE(json_extract(scope_snapshot_json, '$.categoryId'), '') = ?
      AND COALESCE(json_extract(scope_snapshot_json, '$.selectionSemantics'), 'active_catalog_url_order_v1') = ?
      AND COALESCE(json_extract(scope_snapshot_json, '$.executionLimit'), 5) = ?`;
    const scopeValues = [storeId, reference.scope.kind, reference.scope.categoryId ?? "", reference.scope.selectionSemantics, reference.scope.executionLimit] as const;
    const history = this.database
      .prepare(
        `SELECT * FROM store_audit_runs WHERE ${scopeWhere}
         ORDER BY started_at DESC, id DESC LIMIT 50`,
      )
      .all(...scopeValues)
      .map(storeAuditRunFromRow)
      .slice(0, 20);
    const latestAttempt = history[0];
    if (!latestAttempt) throw new AuthorizationError();
    const lastConfirmed = history.find((run) => this.isConfirmedRun(run)) ?? null;
    const comparableHistory = lastConfirmed
      ? this.database
          .prepare(
            `SELECT * FROM store_audit_runs WHERE store_id = ?
             AND status = 'completed' AND selection_signature = ? AND ruleset_version = ?
             AND started_at <= ? ORDER BY started_at DESC, id DESC LIMIT 20`,
          )
          .all(
            storeId,
            lastConfirmed.selectionSignature,
            lastConfirmed.rulesetVersion,
            lastConfirmed.startedAt,
          )
          .map(storeAuditRunFromRow).reverse()
      : [];
    const baselineRow = this.database.prepare(
      `SELECT * FROM store_audit_runs WHERE ${scopeWhere} AND status = 'completed'
       ORDER BY started_at ASC, id ASC LIMIT 1`,
    ).get(...scopeValues);
    const baseline = baselineRow ? storeAuditRunFromRow(baselineRow) : null;
    const comparisonPredecessor =
      comparableHistory.length > 1
        ? comparableHistory[comparableHistory.length - 2]
        : null;
    const currentIssues = lastConfirmed
      ? this.monitoringIssues(lastConfirmed, comparableHistory, comparisonPredecessor)
      : [];
    const comparedIssues =
      lastConfirmed && comparisonPredecessor
        ? this.storeIssues(lastConfirmed)
        : [];
    const changes = comparisonPredecessor
      ? {
          new: comparedIssues.filter((issue) => issue.lifecycle === "new").length,
          unchanged: comparedIssues.filter((issue) => issue.lifecycle === "unchanged").length,
          resolved: comparedIssues.filter((issue) => issue.lifecycle === "resolved").length,
          regressed: comparedIssues.filter((issue) => issue.lifecycle === "regressed").length,
        }
      : null;
    const categoryActive =
      latestAttempt.scope.kind !== "category" ||
      Boolean(
        this.database
          .prepare(
            "SELECT 1 FROM catalog_categories WHERE id = ? AND store_id = ? AND active = 1",
          )
          .get(latestAttempt.scope.categoryId, storeId),
      );
    return {
      scope: latestAttempt.scope,
      canRunCheck: categoryActive,
      latestAttempt,
      lastConfirmed,
      baseline,
      comparisonPredecessor,
      comparisonUnavailable: Boolean(lastConfirmed && !comparisonPredecessor && baseline?.id !== lastConfirmed.id),
      changes,
      currentIssues,
      history,
    };
  }

  monitoringScopeInput(
    principal: AuthenticatedUser,
    storeId: string,
    referenceRunId: string,
  ): AuditScopeInput {
    const report = this.getMonitoringReport(principal, storeId, referenceRunId);
    if (!report.canRunCheck) throw new EmptyStoreCatalogError();
    return report.scope.kind === "category"
      ? { kind: "category", categoryId: report.scope.categoryId! }
      : { kind: report.scope.kind };
  }

  getStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ): StoreAuditRunReport {
    const run = this.requireStoreAuditRun(principal, storeAuditRunId);
    const items = this.database
      .prepare(
        "SELECT * FROM store_audit_run_items WHERE store_audit_run_id = ? ORDER BY position",
      )
      .all(run.id)
      .map(storeAuditRunItemFromRow);
    return { ...run, items, issues: this.storeIssues(run) };
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

  private requireStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ) {
    this.requireAuthenticated(principal);
    const row = this.database
      .prepare(
        `SELECT r.* FROM store_audit_runs r
         JOIN stores s ON s.id = r.store_id AND s.workspace_id = r.workspace_id
         JOIN workspace_members m ON m.workspace_id = r.workspace_id
         WHERE r.id = ? AND m.user_id = ?`,
      )
      .get(storeAuditRunId, principal.userId);
    if (!row) throw new AuthorizationError();
    return storeAuditRunFromRow(row);
  }

  private readStoreAuditRun(storeAuditRunId: string) {
    const row = this.database
      .prepare("SELECT * FROM store_audit_runs WHERE id = ?")
      .get(storeAuditRunId);
    if (!row) throw new AuthorizationError();
    return storeAuditRunFromRow(row);
  }

  private categoryIdsForItem(catalogItemId: string) {
    return this.database.prepare("SELECT category_id FROM catalog_category_mappings WHERE catalog_item_id = ? ORDER BY category_id").all(catalogItemId).map((row) => String(row.category_id));
  }

  private issueRows(storeAuditRunId: string) {
    return this.database
      .prepare(
        `SELECT f.payload_json, f.rule_id, i.catalog_item_id,
                i.normalized_url, i.audit_run_id, r.result_json
         FROM store_audit_run_items i
         JOIN audit_runs r ON r.id = i.audit_run_id AND r.status = 'completed'
         JOIN findings f ON f.audit_run_id = r.id
         WHERE i.store_audit_run_id = ?
           AND json_extract(f.payload_json, '$.status') = 'failed'
         ORDER BY i.position, f.rowid`,
      )
      .all(storeAuditRunId) as Record<string, SQLInputValue>[];
  }

  private storeIssues(run: StoreAuditRun): StoreIssue[] {
    const aggregate = (sourceRunId: string, auditedPdpCount: number) => {
      const issues = new Map<string, StoreIssue>();
      for (const row of this.issueRows(sourceRunId)) {
        const finding = {
          ...(JSON.parse(String(row.payload_json)) as AuditResult["findings"][number]),
          auditRunId: String(row.audit_run_id),
        };
        const issue = issues.get(finding.ruleId) ?? {
          ruleId: finding.ruleId,
          severity: finding.severity,
          title: finding.title,
          affectedPdpCount: 0,
          auditedPdpCount,
          lifecycle: run.status === "completed" ? ("new" as const) : null,
          affectedPdps: [],
        };
        issue.affectedPdps.push({
          catalogItemId: String(row.catalog_item_id),
          normalizedUrl: String(row.normalized_url),
          auditRunId: String(row.audit_run_id),
          pageTitle: row.result_json
            ? String(JSON.parse(String(row.result_json)).pageTitle ?? "")
            : "",
          finding,
          artifacts: this.database
            .prepare(
              `SELECT id, audit_run_id, kind, content_type, byte_size, sha256, created_at
               FROM artifacts WHERE audit_run_id = ?`,
            )
            .all(String(row.audit_run_id))
            .map(artifactFromRow),
        });
        issue.affectedPdpCount = issue.affectedPdps.length;
        issues.set(finding.ruleId, issue);
      }
      return issues;
    };

    const current = aggregate(run.id, run.completedPdpCount);
    if (run.status !== "completed" || !run.scope.catalogComplete)
      return [...current.values()];
    const previousRow = this.database
      .prepare(
        `SELECT * FROM store_audit_runs
         WHERE store_id = ? AND id <> ? AND status = 'completed'
           AND selection_signature = ? AND ruleset_version = ?
           AND started_at <= ?
         ORDER BY started_at DESC, id DESC LIMIT 1`,
      )
      .get(
        run.storeId,
        run.id,
        run.selectionSignature,
        run.rulesetVersion,
        run.startedAt,
      );
    if (!previousRow) return [...current.values()];
    const previous = storeAuditRunFromRow(previousRow);
    const priorIssues = aggregate(previous.id, run.completedPdpCount);
    for (const issue of current.values()) {
      if (priorIssues.has(issue.ruleId)) issue.lifecycle = "unchanged";
      else {
        const appearedBefore = this.database
          .prepare(
            `SELECT 1 FROM store_audit_runs sr
             JOIN store_audit_run_items i ON i.store_audit_run_id = sr.id
             JOIN findings f ON f.audit_run_id = i.audit_run_id
             WHERE sr.store_id = ? AND sr.status = 'completed'
               AND sr.selection_signature = ? AND sr.ruleset_version = ?
               AND sr.started_at < ? AND f.rule_id = ?
               AND json_extract(f.payload_json, '$.status') = 'failed' LIMIT 1`,
          )
          .get(
            run.storeId,
            run.selectionSignature,
            run.rulesetVersion,
            previous.startedAt,
            issue.ruleId,
          );
        issue.lifecycle = appearedBefore ? "regressed" : "new";
      }
    }
    for (const [ruleId, issue] of priorIssues)
      if (!current.has(ruleId)) {
        issue.lifecycle = "resolved";
        issue.auditedPdpCount = run.completedPdpCount;
        issue.affectedPdpCount = 0;
        issue.affectedPdps = [];
        current.set(ruleId, issue);
      }
    return [...current.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  private isConfirmedRun(run: StoreAuditRun) {
    return run.status === "completed" && run.scope.catalogComplete;
  }

  private monitoringScopeKey(run: StoreAuditRun) {
    return JSON.stringify({
      kind: run.scope.kind,
      categoryId: run.scope.categoryId,
      selectionSemantics: run.scope.selectionSemantics,
      executionLimit: run.scope.executionLimit,
    });
  }

  private monitoringIssues(
    current: StoreAuditRun,
    comparableHistory: StoreAuditRun[],
    comparisonPredecessor: StoreAuditRun | null,
  ): MonitoringIssue[] {
    const issues = this.storeIssues(current)
      .filter((issue) => issue.affectedPdpCount > 0)
      .map((issue) => ({ ...issue, lifecycle: comparisonPredecessor ? issue.lifecycle : null }));
    const ruleSets = new Map(
      comparableHistory.map((run) => [run.id, this.issueRuleIds(run.id)]),
    );
    return issues.map((issue) => {
      let previouslyAffected = false;
      let wasAffected = false;
      let firstSeenAt: string | null = null;
      let lastSeenAt: string | null = null;
      const history = comparableHistory.flatMap((run) => {
        const affected = ruleSets.get(run.id)?.has(issue.ruleId) ?? false;
        if (!affected && !wasAffected) return [];
        if (!affected && !previouslyAffected) return [];
        if (affected) {
          firstSeenAt ??= run.completedAt;
          lastSeenAt = run.completedAt;
        }
        const lifecycle: MonitoringIssue["history"][number]["lifecycle"] = affected
          ? previouslyAffected
            ? "unchanged"
            : wasAffected
              ? "regressed"
              : "new"
          : "resolved";
        wasAffected ||= affected;
        previouslyAffected = affected;
        return [{ runId: run.id, completedAt: run.completedAt!, lifecycle }];
      });
      return { ...issue, firstSeenAt, lastSeenAt, history };
    });
  }

  private issueRuleIds(storeAuditRunId: string) {
    return new Set(
      this.database
        .prepare(
          `SELECT DISTINCT f.rule_id FROM store_audit_run_items i
           JOIN audit_runs r ON r.id = i.audit_run_id AND r.status = 'completed'
           JOIN findings f ON f.audit_run_id = r.id
           WHERE i.store_audit_run_id = ?
             AND json_extract(f.payload_json, '$.status') = 'failed'`,
        )
        .all(storeAuditRunId)
        .map((row) => String(row.rule_id)),
    );
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
      CREATE TABLE IF NOT EXISTS catalog_discoveries (
        store_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        failure_category TEXT CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
        discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
        rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
        partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1)),
        PRIMARY KEY (store_id),
        FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS catalog_items (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source = 'root_page_link'),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        PRIMARY KEY (id),
        UNIQUE (store_id, normalized_url),
        FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS store_audit_runs (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_failures', 'failed')),
        selection_mode TEXT NOT NULL CHECK (selection_mode = 'automatic_bounded_active_catalog_v1'),
        selection_signature TEXT NOT NULL,
        ruleset_version TEXT NOT NULL,
        scope_snapshot_json TEXT,
        selected_pdp_count INTEGER NOT NULL CHECK (selected_pdp_count BETWEEN 1 AND 5),
        completed_pdp_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_pdp_count >= 0),
        failed_pdp_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_pdp_count >= 0),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT,
        PRIMARY KEY (id),
        UNIQUE (id, workspace_id),
        FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS store_audit_run_items (
        id TEXT NOT NULL,
        store_audit_run_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        catalog_item_id TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0 AND position < 5),
        audit_run_id TEXT,
        failure_category TEXT CHECK (failure_category IN ('infrastructure', 'timeout', 'unsafe_url')),
        PRIMARY KEY (id),
        UNIQUE (store_audit_run_id, position),
        UNIQUE (store_audit_run_id, catalog_item_id),
        UNIQUE (audit_run_id),
        FOREIGN KEY (store_audit_run_id, workspace_id) REFERENCES store_audit_runs(id, workspace_id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
        FOREIGN KEY (audit_run_id, workspace_id) REFERENCES audit_runs(id, workspace_id)
      );
      CREATE TABLE IF NOT EXISTS catalog_categories (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        normalized_path TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('root_page_link', 'category_page_link')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        UNIQUE (store_id, normalized_path),
        FOREIGN KEY (store_id, workspace_id) REFERENCES stores(id, workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS catalog_category_mappings (
        store_id TEXT NOT NULL,
        catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
        PRIMARY KEY (catalog_item_id, category_id)
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
      CREATE INDEX IF NOT EXISTS catalog_items_store ON catalog_items(store_id, active);
      CREATE INDEX IF NOT EXISTS catalog_categories_store ON catalog_categories(store_id, active);
      CREATE INDEX IF NOT EXISTS catalog_category_mappings_category ON catalog_category_mappings(category_id, catalog_item_id);
      CREATE INDEX IF NOT EXISTS store_audit_runs_store ON store_audit_runs(store_id, started_at);
      CREATE INDEX IF NOT EXISTS store_audit_items_parent ON store_audit_run_items(store_audit_run_id, position);
    `);
    const columns = (table: string) => this.database.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
    if (!columns("catalog_discoveries").includes("partial")) this.database.exec("ALTER TABLE catalog_discoveries ADD COLUMN partial INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1))");
    if (!columns("store_audit_runs").includes("scope_snapshot_json")) this.database.exec("ALTER TABLE store_audit_runs ADD COLUMN scope_snapshot_json TEXT");
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
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

function workspaceFromRow(row: Record<string, SQLInputValue>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
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

function catalogDiscoveryFromRow(
  row: Record<string, SQLInputValue>,
): CatalogDiscovery {
  return {
    storeId: String(row.store_id),
    status: String(row.status) as CatalogDiscovery["status"],
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    failureCategory: row.failure_category
      ? (String(row.failure_category) as CatalogDiscovery["failureCategory"])
      : null,
    discoveredCount: Number(row.discovered_count),
    rejectedCount: Number(row.rejected_count),
    partial: Number(row.partial ?? 0) === 1,
  };
}

function catalogItemFromRow(row: Record<string, SQLInputValue>, categoryIds: string[] = []): CatalogItem {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    storeId: String(row.store_id),
    normalizedUrl: String(row.normalized_url),
    source: "root_page_link",
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    active: Number(row.active) === 1,
    categoryIds,
  };
}

function catalogCategoryFromRow(row: Record<string, SQLInputValue>): CatalogCategory {
  return { id: String(row.id), workspaceId: String(row.workspace_id), storeId: String(row.store_id), normalizedPath: String(row.normalized_path), name: String(row.name), source: String(row.source) as CatalogCategory["source"], firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at), active: Number(row.active) === 1 };
}

function storeAuditRunFromRow(
  row: Record<string, SQLInputValue>,
): StoreAuditRun {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    storeId: String(row.store_id),
    status: String(row.status) as StoreAuditRun["status"],
    selectionMode: "automatic_bounded_active_catalog_v1",
    selectionSignature: String(row.selection_signature),
    rulesetVersion: String(row.ruleset_version),
    scope: row.scope_snapshot_json ? JSON.parse(String(row.scope_snapshot_json)) as AuditScopeSnapshot : { kind: "all", categoryId: null, categoryName: null, matchingPdpCount: Number(row.selected_pdp_count), executionLimit: STORE_AUDIT_MAX_PDPS, selectedCatalogItemIds: [], selectionSemantics: "active_catalog_url_order_v1", catalogComplete: true },
    selectedPdpCount: Number(row.selected_pdp_count),
    completedPdpCount: Number(row.completed_pdp_count),
    failedPdpCount: Number(row.failed_pdp_count),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    summary: row.summary_json
      ? (JSON.parse(String(row.summary_json)) as NonNullable<StoreAuditRun["summary"]>)
      : null,
  };
}

function storeAuditRunItemFromRow(
  row: Record<string, SQLInputValue>,
): StoreAuditRunItem {
  return {
    id: String(row.id),
    storeAuditRunId: String(row.store_audit_run_id),
    catalogItemId: String(row.catalog_item_id),
    normalizedUrl: String(row.normalized_url),
    position: Number(row.position),
    auditRunId: row.audit_run_id ? String(row.audit_run_id) : null,
    failureCategory: row.failure_category
      ? (String(row.failure_category) as StoreAuditRunItem["failureCategory"])
      : null,
  };
}
