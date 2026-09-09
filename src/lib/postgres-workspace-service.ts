import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { AuditResult } from "@/domain/audit";
import type {
  ArtifactReference,
  AuditScopeInput,
  AuditScopeSnapshot,
  AuditRun,
  AuditRunReport,
  AuthenticatedUser,
  CatalogDiscovery,
  CatalogCategory,
  CatalogItem,
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
import { validatePublicUrl, type DnsResolver } from "@/lib/url-safety";
import {
  AuthorizationError,
  CatalogDiscoveryDeadlineError,
  EmptyStoreCatalogError,
  normalizedHref,
  requiredCategoryName,
  requiredId,
  requiredName,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionCookie,
  STORE_AUDIT_RULESET_VERSION,
  UnsafeStoreTargetError,
  validateBeforeDeadline,
} from "@/lib/workspace-contract";
import { coverageRequest, coverageScope, matchingItems, readScopeSnapshot, selectCoverage, summarizeCatalog } from "@/lib/store-coverage";

export interface HostedArtifactMetadata {
  id: string;
  storageKey: string;
  contentType: "image/png";
  byteSize: number;
  sha256: string;
}

type ArtifactPrincipal = AuthenticatedUser | WorkerCapability;

type Database = Pick<Pool | PoolClient, "query">;

export class PostgresWorkspaceService {
  constructor(
    private readonly database: Database,
    private readonly resolver?: DnsResolver,
  ) {}

  async transaction<T>(operation: (service: PostgresWorkspaceService) => Promise<T>) {
    if (!("connect" in this.database))
      return operation(this);
    const client = await (this.database as Pool).connect();
    try {
      await client.query("BEGIN");
      const result = await operation(new PostgresWorkspaceService(client, this.resolver));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createUser(userId: string) {
    const id = requiredId(userId);
    await this.database.query("INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    return id;
  }

  async findOrCreateExternalUser(provider: string, subject: string) {
    const normalizedProvider = requiredId(provider);
    const normalizedSubject = requiredId(subject);
    return this.transaction(async (service) => {
      const existing = await service.database.query<{ user_id: string }>(
        "SELECT user_id FROM external_identities WHERE provider = $1 AND subject = $2",
        [normalizedProvider, normalizedSubject],
      );
      if (existing.rows[0]) return existing.rows[0].user_id;
      const userId = `${normalizedProvider}:${normalizedSubject}`;
      await service.createUser(userId);
      await service.database.query(
        `INSERT INTO external_identities (provider, subject, user_id, created_at)
         VALUES ($1, $2, $3, now()) ON CONFLICT (provider, subject) DO NOTHING`,
        [normalizedProvider, normalizedSubject, userId],
      );
      const identity = await service.database.query<{ user_id: string }>(
        "SELECT user_id FROM external_identities WHERE provider = $1 AND subject = $2",
        [normalizedProvider, normalizedSubject],
      );
      return identity.rows[0].user_id;
    });
  }

  async issueSession(userId: string, ttlMs = SESSION_TTL_MS, options: { secureCookie?: boolean } = {}) {
    await this.createUser(userId);
    const token = randomBytes(32).toString("base64url");
    const sessionId = tokenHash(token);
    await this.database.query(
      "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
      [sessionId, userId, new Date(Date.now() + ttlMs)],
    );
    return { token, cookie: sessionCookie(token, ttlMs, options.secureCookie ?? true) };
  }

  async authenticateRequest(request: Request) {
    const token = request.headers.get("cookie")?.split(";").map((cookie) => cookie.trim().split("=")).find(([name]) => name === SESSION_COOKIE_NAME)?.[1];
    if (!token) throw new AuthorizationError();
    return this.authenticateSession(token);
  }

  async authenticateSession(token: string): Promise<AuthenticatedUser> {
    const sessionId = tokenHash(token);
    const result = await this.database.query<{ user_id: string }>(
      "SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()", [sessionId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return { kind: "user", userId: result.rows[0].user_id, sessionId };
  }

  async revokeSession(principal: AuthenticatedUser) {
    await this.requireAuthenticated(principal);
    await this.database.query("DELETE FROM sessions WHERE id = $1", [principal.sessionId]);
  }

  async createWorkspace(principal: AuthenticatedUser, name: string) {
    await this.requireAuthenticated(principal);
    const workspace: Workspace = { id: randomUUID(), name: requiredName(name), createdAt: new Date().toISOString() };
    return this.transaction(async (service) => {
      await service.database.query("INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, $3)", [workspace.id, workspace.name, workspace.createdAt]);
      await service.database.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [workspace.id, principal.userId]);
      return workspace;
    });
  }

  async listWorkspaces(principal: AuthenticatedUser) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query(
      `SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = $1 ORDER BY w.created_at`, [principal.userId],
    );
    return result.rows.map(workspaceFromRow);
  }

  async getWorkspaceMembership(principal: AuthenticatedUser, workspaceId: string) {
    return this.requireMember(principal, workspaceId);
  }

  async addMember(principal: AuthenticatedUser, workspaceId: string, userId: string, role: WorkspaceRole = "member") {
    await this.requireRole(principal, workspaceId, "owner");
    const id = await this.createUser(userId);
    await this.database.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`, [workspaceId, id, role],
    );
    return { workspaceId, userId: id, role } satisfies WorkspaceMember;
  }

  async createStore(principal: AuthenticatedUser, workspaceId: string, input: { name?: string; url: string }) {
    await this.requireMember(principal, workspaceId);
    const url = await validatePublicUrl(input.url, this.resolver);
    const store: Store = { id: randomUUID(), workspaceId, name: requiredName(input.name?.trim() || url.hostname), url: url.origin, createdAt: new Date().toISOString() };
    await this.database.query(
      "INSERT INTO stores (id, workspace_id, name, url, created_at) VALUES ($1, $2, $3, $4, $5)",
      [store.id, store.workspaceId, store.name, store.url, store.createdAt],
    );
    return store;
  }

  async getStore(principal: AuthenticatedUser, storeId: string) {
    return this.requireStore(principal, storeId);
  }

  async listStores(principal: AuthenticatedUser, workspaceId: string) {
    await this.requireMember(principal, workspaceId);
    const result = await this.database.query("SELECT * FROM stores WHERE workspace_id = $1 ORDER BY created_at", [workspaceId]);
    return result.rows.map(storeFromRow);
  }

  async getStoreCatalog(principal: AuthenticatedUser, storeId: string): Promise<StoreCatalog> {
    await this.requireStore(principal, storeId);
    const [discovery, items, categories, mappings, summary, categoryCounts] = await Promise.all([
      this.database.query("SELECT * FROM catalog_discoveries WHERE store_id = $1", [storeId]),
      this.database.query(
        `SELECT i.*, COALESCE(array_agg(m.category_id ORDER BY m.category_id)
          FILTER (WHERE m.category_id IS NOT NULL), '{}') AS category_ids
         FROM catalog_items i LEFT JOIN catalog_category_mappings m ON m.catalog_item_id = i.id
         WHERE i.store_id = $1 GROUP BY i.id ORDER BY i.active DESC, i.normalized_url`, [storeId],
      ),
      this.database.query("SELECT * FROM catalog_categories WHERE store_id = $1 ORDER BY active DESC, name, id", [storeId]),
      this.database.query("SELECT catalog_item_id, category_id FROM catalog_category_mappings WHERE store_id = $1", [storeId]),
      this.database.query(`SELECT COUNT(*) FILTER (WHERE i.active)::integer AS active_count, COUNT(*) FILTER (WHERE NOT i.active)::integer AS inactive_count, COUNT(*) FILTER (WHERE i.active AND EXISTS (SELECT 1 FROM catalog_category_mappings m WHERE m.catalog_item_id=i.id))::integer AS categorized_count, COUNT(*) FILTER (WHERE i.active AND NOT EXISTS (SELECT 1 FROM catalog_category_mappings m WHERE m.catalog_item_id=i.id))::integer AS uncategorized_count FROM catalog_items i WHERE i.store_id=$1`, [storeId]),
      this.database.query(`SELECT m.category_id, COUNT(DISTINCT i.id)::integer AS active_count FROM catalog_category_mappings m JOIN catalog_items i ON i.id=m.catalog_item_id WHERE m.store_id=$1 AND i.active GROUP BY m.category_id`, [storeId]),
    ]);
    const state: CatalogDiscovery = discovery.rows[0] ? discoveryFromRow(discovery.rows[0]) : {
        storeId, status: "not_started", startedAt: null, completedAt: null,
        failureCategory: null, discoveredCount: 0, rejectedCount: 0, partial: false,
      };
    const catalogItems = items.rows.map(catalogItemFromRow);
    const catalogCategories = categories.rows.map(catalogCategoryFromRow);
    const computed = summarizeCatalog(catalogItems, catalogCategories, state.completedAt, state.status === "succeeded" && !state.partial);
    const totals = summary.rows[0];
    const counts = Object.fromEntries(categoryCounts.rows.map((row) => [String(row.category_id), Number(row.active_count)]));
    return { discovery: state, items: catalogItems, categories: catalogCategories, categoryMappings: mappings.rows.map((row) => ({ catalogItemId: String(row.catalog_item_id), categoryId: String(row.category_id) })), summary: { ...computed, activePdpCount: Number(totals?.active_count ?? 0), inactivePdpCount: Number(totals?.inactive_count ?? 0), categorizedActivePdpCount: Number(totals?.categorized_count ?? 0), uncategorizedActivePdpCount: Number(totals?.uncategorized_count ?? 0), categoryActivePdpCounts: counts } };
  }

  async startCatalogDiscovery(principal: AuthenticatedUser, storeId: string) {
    const store = await this.requireStore(principal, storeId);
    await this.database.query(
      `INSERT INTO catalog_discoveries
        (store_id, workspace_id, status, started_at, discovered_count, rejected_count)
       VALUES ($1, $2, 'running', now(), 0, 0)
       ON CONFLICT (store_id) DO UPDATE SET status = 'running', started_at = excluded.started_at,
         completed_at = NULL, failure_category = NULL, discovered_count = 0, rejected_count = 0`,
      [store.id, store.workspaceId],
    );
    return store;
  }

  /** Production web only creates durable discovery work; Chromium is worker-owned. */
  async enqueueCatalogDiscovery(principal: AuthenticatedUser, storeId: string) {
    const store = await this.requireStore(principal, storeId);
    await this.transaction(async (service) => {
      await service.database.query(
        `INSERT INTO catalog_discoveries (store_id, workspace_id, status, partial)
         VALUES ($1,$2,'queued',false)
         ON CONFLICT (store_id) DO UPDATE SET status='queued', started_at=NULL, completed_at=NULL,
           failure_category=NULL, partial=false
         WHERE catalog_discoveries.status IN ('not_started','succeeded','failed')`,
        [store.id, store.workspaceId],
      );
      const discovery = await service.database.query(
        "SELECT status FROM catalog_discoveries WHERE store_id = $1", [store.id],
      );
      if (discovery.rows[0]?.status !== "queued") throw new AuthorizationError();
      await service.database.query(
        `INSERT INTO audit_jobs (id, workspace_id, discovery_store_id, job_type, status, attempt, available_at, created_at)
         VALUES ($1,$2,$3,'catalog_discovery','queued',0,clock_timestamp(),clock_timestamp())
         ON CONFLICT (discovery_store_id) DO UPDATE SET status='queued', attempt=0,
           available_at=clock_timestamp(), claimed_at=NULL, lease_expires_at=NULL, worker_id=NULL,
           completed_at=NULL, failure_category=NULL
         WHERE audit_jobs.status IN ('completed','failed')`,
        [randomUUID(), store.workspaceId, store.id],
      );
    });
    return this.getStoreCatalog(principal, store.id);
  }

  async completeCatalogDiscovery(
    principal: AuthenticatedUser,
    storeId: string,
    candidateUrls: string[] | CatalogDiscoveryResult,
    deadline = Number.POSITIVE_INFINITY,
  ) {
    const store = await this.requireStore(principal, storeId);
    const discovery = Array.isArray(candidateUrls)
      ? { productUrls: candidateUrls, categories: [], mappings: [], truncated: false }
      : candidateUrls;
    const normalizedUrls = new Set<string>();
    let rejectedCount = Math.max(0, discovery.productUrls.length - 200);
    for (const candidate of discovery.productUrls.slice(0, 200)) {
      try {
        if (new URL(candidate).origin !== store.url) {
          rejectedCount += 1;
          continue;
        }
        normalizedUrls.add(
          (await validateBeforeDeadline(candidate, this.resolver, deadline)).href,
        );
      } catch (error) {
        if (error instanceof CatalogDiscoveryDeadlineError) throw error;
        rejectedCount += 1;
      }
    }
    const completedAt = new Date().toISOString();
    await this.transaction(async (service) => {
      await service.database.query(
        "UPDATE catalog_items SET active = false WHERE store_id = $1",
        [store.id],
      );
      for (const normalizedUrl of normalizedUrls)
        await service.database.query(
          `INSERT INTO catalog_items
            (id, workspace_id, store_id, normalized_url, source, first_seen_at, last_seen_at, active)
           VALUES ($1,$2,$3,$4,'root_page_link',$5,$5,true)
           ON CONFLICT (store_id, normalized_url) DO UPDATE SET
             last_seen_at = excluded.last_seen_at, active = true`,
          [randomUUID(), store.workspaceId, store.id, normalizedUrl, completedAt],
        );
      await service.database.query(
        "UPDATE catalog_categories SET active = false WHERE store_id = $1",
        [store.id],
      );
      const categoryByUrl = new Map<string, string>();
      for (const candidate of discovery.categories.slice(0, 30)) {
        try {
          const url = new URL(candidate.url);
          if (url.origin !== store.url) {
            rejectedCount += 1;
            continue;
          }
          const identity = url.pathname.replace(/\/$/, "") || "/";
          const upserted = await service.database.query<{ id: string }>(
            `INSERT INTO catalog_categories
              (id, workspace_id, store_id, normalized_path, name, source, first_seen_at, last_seen_at, active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,true)
             ON CONFLICT (store_id, normalized_path) DO UPDATE SET
               name = excluded.name, source = excluded.source,
               last_seen_at = excluded.last_seen_at, active = true
             RETURNING id`,
            [
              randomUUID(),
              store.workspaceId,
              store.id,
              identity,
              requiredCategoryName(candidate.name),
              candidate.source ?? "root_page_link",
              completedAt,
            ],
          );
          categoryByUrl.set(url.href, upserted.rows[0].id);
        } catch {
          rejectedCount += 1;
        }
      }
      await service.database.query(
        "DELETE FROM catalog_category_mappings WHERE store_id = $1",
        [store.id],
      );
      for (const mapping of discovery.mappings) {
        const categoryId = categoryByUrl.get(normalizedHref(mapping.categoryUrl));
        if (!categoryId) continue;
        const item = await service.database.query<{ id: string }>(
          "SELECT id FROM catalog_items WHERE store_id = $1 AND normalized_url = $2",
          [store.id, normalizedHref(mapping.productUrl)],
        );
        if (item.rows[0])
          await service.database.query(
            `INSERT INTO catalog_category_mappings
              (store_id, catalog_item_id, category_id) VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`,
            [store.id, item.rows[0].id, categoryId],
          );
      }
      const updated = await service.database.query(
        `UPDATE catalog_discoveries SET status = 'succeeded', completed_at = $1,
           failure_category = NULL, discovered_count = $2, rejected_count = $3,
           partial = $4 WHERE store_id = $5 AND status = 'running'`,
        [completedAt, normalizedUrls.size, rejectedCount, discovery.truncated, store.id],
      );
      if (updated.rowCount !== 1) throw new AuthorizationError();
    });
    return this.getStoreCatalog(principal, store.id);
  }

  async failCatalogDiscovery(principal: AuthenticatedUser, storeId: string, category: NonNullable<CatalogDiscovery["failureCategory"]>) {
    await this.requireStore(principal, storeId);
    await this.database.query(
      `UPDATE catalog_discoveries SET status = 'failed', completed_at = now(), failure_category = $1
       WHERE store_id = $2`, [category, storeId],
    );
    return this.getStoreCatalog(principal, storeId);
  }

  async createAuditRun(principal: AuthenticatedUser, storeId: string, targetUrl: string) {
    const store = await this.requireStore(principal, storeId);
    const target = await validatePublicUrl(targetUrl, this.resolver);
    if (target.origin !== new URL(store.url).origin) throw new UnsafeStoreTargetError();
    const run: AuditRun = { id: randomUUID(), workspaceId: store.workspaceId, storeId, targetUrl: target.href, status: "queued", createdAt: new Date().toISOString(), startedAt: null, completedAt: null, failureCategory: null, result: null };
    const jobId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    await this.transaction(async (service) => {
      await service.database.query(
        `INSERT INTO audit_runs
          (id, workspace_id, store_id, target_url, status, created_at, worker_token_hash)
         VALUES ($1, $2, $3, $4, 'queued', $5, $6)`,
        [run.id, run.workspaceId, run.storeId, run.targetUrl, run.createdAt, tokenHash(token)],
      );
      await service.database.query(
        `INSERT INTO audit_jobs
          (id, workspace_id, audit_run_id, job_type, status, attempt, available_at, created_at)
         VALUES ($1, $2, $3, 'quick_audit', 'queued', 0, now(), now())`,
        [jobId, run.workspaceId, run.id],
      );
    });
    return {
      run,
      jobId,
      worker: { kind: "worker", auditRunId: run.id, token } as const,
    };
  }

  async startAuditRun(principal: WorkerCapability) {
    await this.requireWorker(principal, "queued");
    const result = await this.database.query(
      `UPDATE audit_runs SET status = 'running', started_at = now()
       WHERE id = $1 AND worker_token_hash = $2 AND status = 'queued' RETURNING *`,
      [principal.auditRunId, tokenHash(principal.token)],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return runFromRow(result.rows[0]);
  }

  async completeAuditRun(
    principal: WorkerCapability,
    result: AuditResult,
    artifact: HostedArtifactMetadata,
  ) {
    const run = await this.requireWorker(principal, "running");
    if (result.auditedUrl !== run.targetUrl || result.screenshot.id !== artifact.id)
      throw new AuthorizationError();
    validateArtifactMetadata(artifact);
    return this.transaction(async (service) => {
      const updated = await service.database.query(
        `UPDATE audit_runs SET status = 'completed', completed_at = now(), result_json = $1
         WHERE id = $2 AND worker_token_hash = $3 AND status = 'running' RETURNING *`,
        [withoutArtifacts(result), run.id, tokenHash(principal.token)],
      );
      if (!updated.rows[0]) throw new AuthorizationError();
      await service.database.query("DELETE FROM findings WHERE audit_run_id = $1", [run.id]);
      for (const finding of result.findings)
        await service.database.query(
          `INSERT INTO findings (id, audit_run_id, workspace_id, rule_id, payload_json)
           VALUES ($1,$2,$3,$4,$5)`,
          [finding.id, run.id, run.workspaceId, finding.ruleId, finding],
        );
      await service.database.query(
        `INSERT INTO artifacts
          (id, audit_run_id, workspace_id, kind, content_type, byte_size, sha256,
           storage_key, status, created_at)
         VALUES ($1,$2,$3,'screenshot',$4,$5,$6,$7,'available',now())`,
        [artifact.id, run.id, run.workspaceId, artifact.contentType, artifact.byteSize, artifact.sha256, artifact.storageKey],
      );
      return runFromRow(updated.rows[0]);
    });
  }

  async failAuditRun(
    principal: WorkerCapability,
    category: NonNullable<AuditRun["failureCategory"]>,
  ) {
    await this.requireWorker(principal, "running");
    const result = await this.database.query(
      `UPDATE audit_runs SET status = 'failed', failure_category = $1, completed_at = now()
       WHERE id = $2 AND worker_token_hash = $3 AND status = 'running' RETURNING *`,
      [category, principal.auditRunId, tokenHash(principal.token)],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return runFromRow(result.rows[0]);
  }

  async cancelAuditRun(principal: AuthenticatedUser, runId: string) {
    const run = await this.requireRun(principal, runId);
    if (run.status !== "queued") throw new AuthorizationError();
    const result = await this.database.query(
      `UPDATE audit_runs SET status = 'cancelled', completed_at = now()
       WHERE id = $1 AND status = 'queued' RETURNING *`,
      [run.id],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return runFromRow(result.rows[0]);
  }

  async listAuditRuns(principal: AuthenticatedUser, storeId: string) {
    await this.requireStore(principal, storeId);
    const result = await this.database.query(
      `SELECT r.* FROM audit_runs r WHERE r.store_id = $1 AND NOT EXISTS (
         SELECT 1 FROM store_audit_run_items i WHERE i.audit_run_id = r.id
       ) ORDER BY r.created_at DESC`, [storeId],
    );
    return result.rows.map(runFromRow);
  }

  async getAuditRun(principal: AuthenticatedUser, runId: string): Promise<AuditRunReport> {
    const run = await this.requireRun(principal, runId);
    const [findings, artifacts] = await Promise.all([
      this.database.query("SELECT payload_json FROM findings WHERE audit_run_id = $1 ORDER BY id", [run.id]),
      this.database.query(
        `SELECT id, audit_run_id, kind, content_type, byte_size, sha256, created_at
         FROM artifacts WHERE audit_run_id = $1 AND status = 'available'`, [run.id],
      ),
    ]);
    return {
      ...run,
      findings: findings.rows.map((row) => ({ ...jsonValue(row.payload_json), auditRunId: run.id })),
      artifacts: artifacts.rows.map(artifactFromRow),
    } as AuditRunReport;
  }

  async readArtifactMetadata(principal: AuthenticatedUser, artifactId: string) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query(
      `SELECT a.* FROM artifacts a
       JOIN workspace_members m ON m.workspace_id = a.workspace_id
       JOIN audit_runs r ON r.id = a.audit_run_id AND r.workspace_id = a.workspace_id
       WHERE a.id = $1 AND a.status = 'available' AND m.user_id = $2`,
      [artifactId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return { reference: artifactFromRow(result.rows[0]), storageKey: String(result.rows[0].storage_key) };
  }

  async createArtifactMetadata(
    principal: ArtifactPrincipal,
    runId: string,
    artifact: HostedArtifactMetadata,
  ) {
    const run = await this.requireArtifactRun(principal, runId);
    validateArtifactMetadata(artifact);
    await this.database.query(
      `INSERT INTO artifacts
        (id, audit_run_id, workspace_id, kind, content_type, byte_size, sha256,
         storage_key, status, created_at)
       VALUES ($1,$2,$3,'screenshot',$4,$5,$6,$7,'pending',now())`,
      [artifact.id, run.id, run.workspaceId, artifact.contentType, artifact.byteSize, artifact.sha256, artifact.storageKey],
    );
    return artifact.id;
  }

  async markArtifactAvailable(principal: ArtifactPrincipal, artifactId: string) {
    const artifact = await this.requireArtifact(principal, artifactId);
    const result = await this.database.query(
      `UPDATE artifacts SET status = 'available'
       WHERE id = $1 AND audit_run_id = $2 AND status = 'pending' RETURNING *`,
      [artifactId, artifact.audit_run_id],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return { reference: artifactFromRow(result.rows[0]), storageKey: String(result.rows[0].storage_key) };
  }

  async deleteArtifactMetadata(principal: ArtifactPrincipal, artifactId: string) {
    const artifact = await this.requireArtifact(principal, artifactId);
    const result = await this.database.query(
      "DELETE FROM artifacts WHERE id = $1 AND audit_run_id = $2 RETURNING storage_key",
      [artifactId, artifact.audit_run_id],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return { storageKey: String(result.rows[0].storage_key) };
  }

  async createStoreAuditRun(principal: AuthenticatedUser, storeId: string, input: AuditScopeInput = { kind: "all" }) {
    const store = await this.requireStore(principal, storeId);
    const catalog = await this.getStoreCatalog(principal, storeId);
    const criteria = coverageRequest(input);
    const activeCategories = new Map(catalog.categories.filter((category) => category.active).map((category) => [category.id, category]));
    if (criteria.categoryIds.some((id) => !activeCategories.has(id))) throw new AuthorizationError();
    const matching = input.kind === "all" ? catalog.items.filter((item) => item.active) : matchingItems(catalog.items, criteria.categoryIds, criteria.includeUncategorized);
    const selected = selectCoverage(matching, catalog.categories, criteria.categoryIds, criteria.requested);
    if (!selected.length) throw new Error("Discover active product pages before running a Store Audit.");
    const categoryNames = criteria.categoryIds.map((id) => activeCategories.get(id)!.name);
    const scope = coverageScope(input, categoryNames, matching, selected, catalog.summary.complete, catalog.summary.latestDiscoveryAt);
    const startedAt = new Date().toISOString();
    const run: StoreAuditRun = { id: randomUUID(), workspaceId: store.workspaceId, storeId, status: "queued", selectionMode: "automatic_bounded_active_catalog_v1", selectionSignature: createHash("sha256").update(JSON.stringify({ scope, selected: selected.map((item) => [item.id, item.normalizedUrl]), ruleset: STORE_AUDIT_RULESET_VERSION })).digest("hex"), rulesetVersion: STORE_AUDIT_RULESET_VERSION, scope, selectedPdpCount: selected.length, completedPdpCount: 0, failedPdpCount: 0, startedAt, completedAt: null, summary: null };
    const items: StoreAuditRunItem[] = selected.map((item, position) => ({ id: randomUUID(), storeAuditRunId: run.id, catalogItemId: item.id, normalizedUrl: item.normalizedUrl, position, auditRunId: null, failureCategory: null }));
    const jobId = randomUUID();
    await this.transaction(async (service) => {
      await service.database.query(
        `INSERT INTO store_audit_runs
          (id, workspace_id, store_id, status, selection_mode, selection_signature, ruleset_version,
           scope_snapshot_json, selected_pdp_count, completed_pdp_count, failed_pdp_count, started_at)
         VALUES ($1,$2,$3,'queued',$4,$5,$6,$7,$8,0,0,$9)`,
        [run.id, run.workspaceId, run.storeId, run.selectionMode, run.selectionSignature, run.rulesetVersion, run.scope, run.selectedPdpCount, run.startedAt],
      );
      for (const item of items)
        await service.database.query(
          `INSERT INTO store_audit_run_items
            (id, store_audit_run_id, workspace_id, store_id, catalog_item_id, normalized_url, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [item.id, run.id, run.workspaceId, run.storeId, item.catalogItemId, item.normalizedUrl, item.position],
        );
      await service.database.query(
        `INSERT INTO audit_jobs
          (id, workspace_id, store_audit_run_id, job_type, status, attempt, available_at, created_at)
         VALUES ($1,$2,$3,'store_audit','queued',0,now(),now())`, [jobId, run.workspaceId, run.id],
      );
    });
    return { run, items, jobId };
  }

  async listStoreAuditRuns(principal: AuthenticatedUser, storeId: string) {
    await this.requireStore(principal, storeId);
    const result = await this.database.query("SELECT * FROM store_audit_runs WHERE store_id = $1 ORDER BY started_at DESC, id DESC", [storeId]);
    return result.rows.map(storeAuditRunFromRow);
  }

  async listMonitoringTargets(
    principal: AuthenticatedUser,
    storeId: string,
  ): Promise<MonitoringTargetSummary[]> {
    await this.requireStore(principal, storeId);
    const latest = await this.database.query(
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY COALESCE(scope_snapshot_json->>'kind', 'all'),
             COALESCE(scope_snapshot_json->>'categoryId', ''),
             COALESCE(scope_snapshot_json->>'selectionSemantics', 'active_catalog_url_order_v1'),
             CASE WHEN scope_snapshot_json->>'executionLimit' ~ '^[0-9]{1,9}$'
               THEN (scope_snapshot_json->>'executionLimit')::integer ELSE 5 END
           ORDER BY started_at DESC, id DESC
         ) AS position FROM store_audit_runs WHERE store_id = $1
       ) runs WHERE position = 1 ORDER BY started_at DESC, id DESC LIMIT 30`,
      [storeId],
    );
    return Promise.all(latest.rows.map(async (row) => {
      const run = storeAuditRunFromRow(row);
      const confirmed = await this.database.query(
        `SELECT * FROM store_audit_runs WHERE store_id = $1 AND status = 'completed'
         AND COALESCE(scope_snapshot_json->>'kind', 'all') = $2
         AND COALESCE(scope_snapshot_json->>'categoryId', '') = $3
         AND COALESCE(scope_snapshot_json->>'selectionSemantics', 'active_catalog_url_order_v1') = $4
         AND CASE WHEN scope_snapshot_json->>'executionLimit' ~ '^[0-9]{1,9}$'
           THEN (scope_snapshot_json->>'executionLimit')::integer ELSE 5 END = $5
         ORDER BY started_at DESC, id DESC LIMIT 1`,
        [storeId, run.scope.kind, run.scope.categoryId ?? "", run.scope.selectionSemantics, run.scope.executionLimit],
      );
      const lastConfirmed = confirmed.rows[0]
        ? storeAuditRunFromRow(confirmed.rows[0])
        : null;
      return {
        referenceRunId: run.id,
        scope: run.scope,
        latestAttempt: run,
        lastConfirmed: lastConfirmed && this.isConfirmedRun(lastConfirmed) ? lastConfirmed : null,
      };
    }));
  }

  async getMonitoringReport(
    principal: AuthenticatedUser,
    storeId: string,
    referenceRunId: string,
  ): Promise<MonitoringReport> {
    await this.requireStore(principal, storeId);
    const reference = await this.requireStoreAuditRun(principal, referenceRunId);
    if (reference.storeId !== storeId) throw new AuthorizationError();
    const scopeValues = [
      storeId,
      reference.scope.kind,
      reference.scope.categoryId ?? "",
      reference.scope.selectionSemantics,
      reference.scope.executionLimit,
    ];
    const historyResult = await this.database.query(
      `SELECT * FROM store_audit_runs WHERE store_id = $1
       AND COALESCE(scope_snapshot_json->>'kind', 'all') = $2
       AND COALESCE(scope_snapshot_json->>'categoryId', '') = $3
       AND COALESCE(scope_snapshot_json->>'selectionSemantics', 'active_catalog_url_order_v1') = $4
       AND CASE WHEN scope_snapshot_json->>'executionLimit' ~ '^[0-9]{1,9}$'
         THEN (scope_snapshot_json->>'executionLimit')::integer ELSE 5 END = $5
       ORDER BY started_at DESC, id DESC LIMIT 20`,
      scopeValues,
    );
    const history = historyResult.rows.map(storeAuditRunFromRow);
    const latestAttempt = history[0];
    if (!latestAttempt) throw new AuthorizationError();
    const lastConfirmed = history.find((run) => this.isConfirmedRun(run)) ?? null;
    let comparableHistory: StoreAuditRun[] = [];
    if (lastConfirmed) {
      const comparable = await this.database.query(
        `SELECT * FROM store_audit_runs WHERE store_id = $1 AND status = 'completed'
         AND selection_signature = $2 AND ruleset_version = $3
         AND started_at <= (SELECT started_at FROM store_audit_runs WHERE id = $4)
         ORDER BY started_at DESC, id DESC LIMIT 20`,
        [storeId, lastConfirmed.selectionSignature, lastConfirmed.rulesetVersion, lastConfirmed.id],
      );
      comparableHistory = comparable.rows.map(storeAuditRunFromRow).reverse();
    }
    const baselineResult = await this.database.query(
      `SELECT * FROM store_audit_runs WHERE store_id = $1
       AND COALESCE(scope_snapshot_json->>'kind', 'all') = $2
       AND COALESCE(scope_snapshot_json->>'categoryId', '') = $3
       AND COALESCE(scope_snapshot_json->>'selectionSemantics', 'active_catalog_url_order_v1') = $4
       AND CASE WHEN scope_snapshot_json->>'executionLimit' ~ '^[0-9]{1,9}$'
         THEN (scope_snapshot_json->>'executionLimit')::integer ELSE 5 END = $5
       AND status = 'completed' ORDER BY started_at ASC, id ASC LIMIT 1`,
      scopeValues,
    );
    const baseline = baselineResult.rows[0]
      ? storeAuditRunFromRow(baselineResult.rows[0])
      : null;
    const comparisonPredecessor = comparableHistory.length > 1
      ? comparableHistory[comparableHistory.length - 2]
      : null;
    const currentIssues = lastConfirmed
      ? await this.monitoringIssues(lastConfirmed, comparableHistory, comparisonPredecessor)
      : [];
    const comparedIssues = lastConfirmed && comparisonPredecessor
      ? await this.storeIssues(lastConfirmed)
      : [];
    const changes = comparisonPredecessor ? {
      new: comparedIssues.filter((issue) => issue.lifecycle === "new").length,
      unchanged: comparedIssues.filter((issue) => issue.lifecycle === "unchanged").length,
      resolved: comparedIssues.filter((issue) => issue.lifecycle === "resolved").length,
      regressed: comparedIssues.filter((issue) => issue.lifecycle === "regressed").length,
    } : null;
    const categoryActive = latestAttempt.scope.kind !== "category" || Boolean((await this.database.query(
      "SELECT 1 FROM catalog_categories WHERE id = $1 AND store_id = $2 AND active = true",
      [latestAttempt.scope.categoryId, storeId],
    )).rows[0]);
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

  async monitoringScopeInput(
    principal: AuthenticatedUser,
    storeId: string,
    referenceRunId: string,
  ): Promise<AuditScopeInput> {
    const report = await this.getMonitoringReport(principal, storeId, referenceRunId);
    if (!report.canRunCheck) throw new EmptyStoreCatalogError();
    if (report.scope.kind === "category") return { kind: "category", categoryId: report.scope.categoryId! };
    if (report.scope.kind === "coverage") return { kind: "coverage", categoryIds: report.scope.categoryIds ?? [], includeUncategorized: report.scope.includeUncategorized ?? false, requestedCoverage: report.scope.requestedCoverage ?? report.scope.executionLimit };
    return { kind: report.scope.kind };
  }

  async startStoreAuditRun(principal: AuthenticatedUser, storeAuditRunId: string) {
    const run = await this.requireStoreAuditRun(principal, storeAuditRunId);
    if (run.status !== "queued") throw new AuthorizationError();
    const result = await this.database.query(
      `UPDATE store_audit_runs SET status = 'running', started_at = now()
       WHERE id = $1 AND status = 'queued' RETURNING *`,
      [run.id],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return storeAuditRunFromRow(result.rows[0]);
  }

  async linkStoreAuditRunItem(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
    itemId: string,
    auditRunId: string,
  ) {
    const parent = await this.requireStoreAuditRun(principal, storeAuditRunId);
    if (parent.status !== "running") throw new AuthorizationError();
    const result = await this.database.query(
      `UPDATE store_audit_run_items SET audit_run_id = $1
       WHERE id = $2 AND store_audit_run_id = $3 AND workspace_id = $4
         AND store_id = $5 AND audit_run_id IS NULL
         AND EXISTS (SELECT 1 FROM audit_runs r WHERE r.id = $1
           AND r.workspace_id = $4 AND r.store_id = $5)`,
      [auditRunId, itemId, parent.id, parent.workspaceId, parent.storeId],
    );
    if (result.rowCount !== 1) throw new AuthorizationError();
  }

  async recordStoreAuditItemFailure(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
    itemId: string,
    category: NonNullable<AuditRun["failureCategory"]>,
  ) {
    const parent = await this.requireStoreAuditRun(principal, storeAuditRunId);
    if (parent.status !== "running") throw new AuthorizationError();
    const result = await this.database.query(
      `UPDATE store_audit_run_items SET failure_category = $1
       WHERE id = $2 AND store_audit_run_id = $3 AND failure_category IS NULL`,
      [category, itemId, parent.id],
    );
    if (result.rowCount !== 1) throw new AuthorizationError();
    return this.refreshStoreAuditProgress(parent.id);
  }

  async refreshStoreAuditProgress(storeAuditRunId: string) {
    const result = await this.database.query(
      `WITH counts AS (
         SELECT COUNT(*) FILTER (WHERE r.status = 'completed')::integer AS completed,
                COUNT(*) FILTER (WHERE i.failure_category IS NOT NULL OR r.status = 'failed')::integer AS failed
         FROM store_audit_run_items i LEFT JOIN audit_runs r ON r.id = i.audit_run_id
         WHERE i.store_audit_run_id = $1
       )
       UPDATE store_audit_runs s SET completed_pdp_count = counts.completed,
         failed_pdp_count = counts.failed FROM counts
       WHERE s.id = $1 AND s.status = 'running' RETURNING s.*`,
      [storeAuditRunId],
    );
    if (!result.rows[0]) return this.readStoreAuditRun(storeAuditRunId);
    return storeAuditRunFromRow(result.rows[0]);
  }

  async completeStoreAuditRun(principal: AuthenticatedUser, storeAuditRunId: string) {
    const authorized = await this.requireStoreAuditRun(principal, storeAuditRunId);
    if (authorized.status !== "running") throw new AuthorizationError();
    await this.transaction(async (service) => {
      const run = await service.refreshStoreAuditProgress(storeAuditRunId);
      const status = run.completedPdpCount === run.selectedPdpCount
        ? "completed"
        : run.completedPdpCount > 0
          ? "completed_with_failures"
          : "failed";
      const issueRows = await service.issueRows(run.id);
      const failed = issueRows.filter((row) => String(jsonValue<Record<string, unknown>>(row.payload_json).status) === "failed");
      const summary = {
        issueCount: new Set(failed.map((row) => String(row.rule_id))).size,
        criticalCount: new Set(failed.filter((row) => jsonValue<Record<string, unknown>>(row.payload_json).severity === "critical").map((row) => String(row.rule_id))).size,
        warningCount: new Set(failed.filter((row) => jsonValue<Record<string, unknown>>(row.payload_json).severity === "warning").map((row) => String(row.rule_id))).size,
      };
      const result = await service.database.query(
        `UPDATE store_audit_runs SET status = $1, completed_at = now(), summary_json = $2
         WHERE id = $3 AND status = 'running'`,
        [status, summary, run.id],
      );
      if (result.rowCount !== 1) throw new AuthorizationError();
    });
    return this.getStoreAuditRun(principal, storeAuditRunId);
  }

  async failStoreAuditRun(principal: AuthenticatedUser, storeAuditRunId: string) {
    const authorized = await this.requireStoreAuditRun(principal, storeAuditRunId);
    if (authorized.status !== "running") return authorized;
    await this.transaction(async (service) => {
      await service.database.query(
        `UPDATE store_audit_run_items i SET failure_category = 'infrastructure'
         WHERE i.store_audit_run_id = $1 AND i.failure_category IS NULL
           AND NOT EXISTS (SELECT 1 FROM audit_runs r
             WHERE r.id = i.audit_run_id AND r.status = 'completed')`,
        [storeAuditRunId],
      );
      const run = await service.refreshStoreAuditProgress(storeAuditRunId);
      const status = run.completedPdpCount === run.selectedPdpCount
        ? "completed"
        : run.completedPdpCount > 0
          ? "completed_with_failures"
          : "failed";
      const result = await service.database.query(
        `UPDATE store_audit_runs SET status = $1, completed_at = now()
         WHERE id = $2 AND status = 'running'`, [status, run.id],
      );
      if (result.rowCount !== 1) throw new AuthorizationError();
    });
    return this.readStoreAuditRun(storeAuditRunId);
  }

  async getStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ): Promise<StoreAuditRunReport> {
    const run = await this.requireStoreAuditRun(principal, storeAuditRunId);
    const items = await this.database.query(
      `SELECT * FROM store_audit_run_items
       WHERE store_audit_run_id = $1 ORDER BY position`,
      [run.id],
    );
    return {
      ...run,
      items: items.rows.map(storeAuditRunItemFromRow),
      issues: await this.storeIssues(run),
    };
  }

  private async requireAuthenticated(principal: AuthenticatedUser) {
    const result = await this.database.query(
      "SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()",
      [principal.sessionId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
  }

  private async requireMember(principal: AuthenticatedUser, workspaceId: string) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query<WorkspaceMember & QueryResultRow>(
      `SELECT workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return result.rows[0];
  }

  private async requireRole(principal: AuthenticatedUser, workspaceId: string, role: WorkspaceRole) {
    const member = await this.requireMember(principal, workspaceId);
    if (member.role !== role) throw new AuthorizationError();
  }

  private async requireStore(principal: AuthenticatedUser, storeId: string) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query(
      `SELECT s.* FROM stores s JOIN workspace_members m ON m.workspace_id = s.workspace_id
       WHERE s.id = $1 AND m.user_id = $2`, [storeId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return storeFromRow(result.rows[0]);
  }

  private async requireRun(principal: AuthenticatedUser, runId: string) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query(
      `SELECT r.* FROM audit_runs r JOIN stores s ON s.id = r.store_id AND s.workspace_id = r.workspace_id
       JOIN workspace_members m ON m.workspace_id = r.workspace_id
       WHERE r.id = $1 AND m.user_id = $2`, [runId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return runFromRow(result.rows[0]);
  }

  private async requireArtifactRun(principal: ArtifactPrincipal, runId: string) {
    if (principal.kind === "worker") {
      if (principal.auditRunId !== runId) throw new AuthorizationError();
      return this.requireWorker(principal, "running");
    }
    return this.requireRun(principal, runId);
  }

  private async requireArtifact(principal: ArtifactPrincipal, artifactId: string) {
    const result = await this.database.query(
      "SELECT * FROM artifacts WHERE id = $1",
      [artifactId],
    );
    const artifact = result.rows[0];
    if (!artifact) throw new AuthorizationError();
    await this.requireArtifactRun(principal, String(artifact.audit_run_id));
    return artifact;
  }

  private async requireStoreAuditRun(
    principal: AuthenticatedUser,
    storeAuditRunId: string,
  ) {
    await this.requireAuthenticated(principal);
    const result = await this.database.query(
      `SELECT r.* FROM store_audit_runs r
       JOIN stores s ON s.id = r.store_id AND s.workspace_id = r.workspace_id
       JOIN workspace_members m ON m.workspace_id = r.workspace_id
       WHERE r.id = $1 AND m.user_id = $2`,
      [storeAuditRunId, principal.userId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return storeAuditRunFromRow(result.rows[0]);
  }

  private async readStoreAuditRun(storeAuditRunId: string) {
    const result = await this.database.query(
      "SELECT * FROM store_audit_runs WHERE id = $1",
      [storeAuditRunId],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return storeAuditRunFromRow(result.rows[0]);
  }

  private async issueRows(storeAuditRunId: string) {
    const result = await this.database.query(
      `SELECT f.payload_json, f.rule_id, i.catalog_item_id,
              i.normalized_url, i.audit_run_id, r.result_json
       FROM store_audit_run_items i
       JOIN audit_runs r ON r.id = i.audit_run_id AND r.status = 'completed'
       JOIN findings f ON f.audit_run_id = r.id
       WHERE i.store_audit_run_id = $1
         AND f.payload_json->>'status' = 'failed'
       ORDER BY i.position, f.id`,
      [storeAuditRunId],
    );
    return result.rows;
  }

  private async aggregateIssues(
    sourceRunId: string,
    auditedPdpCount: number,
    lifecycle: StoreIssue["lifecycle"],
  ) {
    const issues = new Map<string, StoreIssue>();
    for (const row of await this.issueRows(sourceRunId)) {
      const finding = {
        ...jsonValue<AuditResult["findings"][number]>(row.payload_json),
        auditRunId: String(row.audit_run_id),
      };
      const issue = issues.get(finding.ruleId) ?? {
        ruleId: finding.ruleId,
        severity: finding.severity,
        title: finding.title,
        affectedPdpCount: 0,
        auditedPdpCount,
        lifecycle,
        affectedPdps: [],
      };
      const artifacts = await this.database.query(
        `SELECT id, audit_run_id, kind, content_type, byte_size, sha256, created_at
         FROM artifacts WHERE audit_run_id = $1 AND status = 'available'`,
        [row.audit_run_id],
      );
      issue.affectedPdps.push({
        catalogItemId: String(row.catalog_item_id),
        normalizedUrl: String(row.normalized_url),
        auditRunId: String(row.audit_run_id),
        pageTitle: row.result_json
          ? String(jsonValue<Record<string, unknown>>(row.result_json).pageTitle ?? "")
          : "",
        finding,
        artifacts: artifacts.rows.map(artifactFromRow),
      });
      issue.affectedPdpCount = issue.affectedPdps.length;
      issues.set(finding.ruleId, issue);
    }
    return issues;
  }

  private async storeIssues(run: StoreAuditRun): Promise<StoreIssue[]> {
    const current = await this.aggregateIssues(
      run.id,
      run.completedPdpCount,
      run.status === "completed" ? "new" : null,
    );
    if (run.status !== "completed" || !run.scope.catalogComplete)
      return [...current.values()];
    const previousResult = await this.database.query(
      `SELECT * FROM store_audit_runs
       WHERE store_id = $1 AND id <> $2 AND status = 'completed'
         AND selection_signature = $3 AND ruleset_version = $4
         AND started_at <= (SELECT started_at FROM store_audit_runs WHERE id = $5)
       ORDER BY started_at DESC, id DESC LIMIT 1`,
      [run.storeId, run.id, run.selectionSignature, run.rulesetVersion, run.id],
    );
    if (!previousResult.rows[0]) return [...current.values()];
    const previous = storeAuditRunFromRow(previousResult.rows[0]);
    const priorIssues = await this.aggregateIssues(
      previous.id,
      run.completedPdpCount,
      "new",
    );
    for (const issue of current.values()) {
      if (priorIssues.has(issue.ruleId)) {
        issue.lifecycle = "unchanged";
        continue;
      }
      const appearedBefore = await this.database.query(
        `SELECT 1 FROM store_audit_runs sr
         JOIN store_audit_run_items i ON i.store_audit_run_id = sr.id
         JOIN findings f ON f.audit_run_id = i.audit_run_id
         WHERE sr.store_id = $1 AND sr.status = 'completed'
           AND sr.selection_signature = $2 AND sr.ruleset_version = $3
           AND sr.started_at < (SELECT started_at FROM store_audit_runs WHERE id = $4)
           AND f.rule_id = $5
           AND f.payload_json->>'status' = 'failed' LIMIT 1`,
        [run.storeId, run.selectionSignature, run.rulesetVersion, previous.id, issue.ruleId],
      );
      issue.lifecycle = appearedBefore.rows[0] ? "regressed" : "new";
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

  private async monitoringIssues(
    current: StoreAuditRun,
    comparableHistory: StoreAuditRun[],
    comparisonPredecessor: StoreAuditRun | null,
  ): Promise<MonitoringIssue[]> {
    const issues = (await this.storeIssues(current))
      .filter((issue) => issue.affectedPdpCount > 0)
      .map((issue) => ({ ...issue, lifecycle: comparisonPredecessor ? issue.lifecycle : null }));
    const ruleSets = new Map(await Promise.all(
      comparableHistory.map(async (run) => [run.id, await this.issueRuleIds(run.id)] as const),
    ));
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
          ? previouslyAffected ? "unchanged" : wasAffected ? "regressed" : "new"
          : "resolved";
        wasAffected ||= affected;
        previouslyAffected = affected;
        return [{ runId: run.id, completedAt: run.completedAt!, lifecycle }];
      });
      return { ...issue, firstSeenAt, lastSeenAt, history };
    });
  }

  private async issueRuleIds(storeAuditRunId: string) {
    const result = await this.database.query(
      `SELECT DISTINCT f.rule_id FROM store_audit_run_items i
       JOIN audit_runs r ON r.id = i.audit_run_id AND r.status = 'completed'
       JOIN findings f ON f.audit_run_id = r.id
       WHERE i.store_audit_run_id = $1 AND f.payload_json->>'status' = 'failed'`,
      [storeAuditRunId],
    );
    return new Set(result.rows.map((row) => String(row.rule_id)));
  }

  private async requireWorker(
    principal: WorkerCapability,
    status: AuditRun["status"],
  ) {
    const result = await this.database.query(
      `SELECT * FROM audit_runs
       WHERE id = $1 AND worker_token_hash = $2 AND status = $3`,
      [principal.auditRunId, tokenHash(principal.token), status],
    );
    if (!result.rows[0]) throw new AuthorizationError();
    return runFromRow(result.rows[0]);
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function validateArtifactMetadata(artifact: HostedArtifactMetadata) {
  requiredId(artifact.id);
  if (
    artifact.contentType !== "image/png" ||
    artifact.byteSize < 0 ||
    artifact.byteSize > 10 * 1024 * 1024 ||
    !/^[a-f\d]{64}$/i.test(artifact.sha256) ||
    !artifact.storageKey.trim()
  ) throw new Error("Invalid artifact metadata.");
}

function iso(value: unknown) {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function workspaceFromRow(row: QueryResultRow): Workspace {
  return { id: String(row.id), name: String(row.name), createdAt: iso(row.created_at) };
}

function storeFromRow(row: QueryResultRow): Store {
  return { id: String(row.id), workspaceId: String(row.workspace_id), name: String(row.name), url: String(row.url), createdAt: iso(row.created_at) };
}

function discoveryFromRow(row: QueryResultRow): CatalogDiscovery {
  return { storeId: String(row.store_id), status: String(row.status) as CatalogDiscovery["status"], startedAt: row.started_at ? iso(row.started_at) : null, completedAt: row.completed_at ? iso(row.completed_at) : null, failureCategory: row.failure_category ? String(row.failure_category) as CatalogDiscovery["failureCategory"] : null, discoveredCount: Number(row.discovered_count), rejectedCount: Number(row.rejected_count), partial: Boolean(row.partial) };
}

function catalogItemFromRow(row: QueryResultRow): CatalogItem {
  return { id: String(row.id), workspaceId: String(row.workspace_id), storeId: String(row.store_id), normalizedUrl: String(row.normalized_url), source: "root_page_link", firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), active: Boolean(row.active), categoryIds: Array.isArray(row.category_ids) ? row.category_ids.map(String) : [] };
}

function catalogCategoryFromRow(row: QueryResultRow): CatalogCategory {
  return { id: String(row.id), workspaceId: String(row.workspace_id), storeId: String(row.store_id), normalizedPath: String(row.normalized_path), name: String(row.name), source: String(row.source) as CatalogCategory["source"], firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at), active: Boolean(row.active) };
}

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function runFromRow(row: QueryResultRow): AuditRun {
  return { id: String(row.id), workspaceId: String(row.workspace_id), storeId: String(row.store_id), targetUrl: String(row.target_url), status: String(row.status) as AuditRun["status"], createdAt: iso(row.created_at), startedAt: row.started_at ? iso(row.started_at) : null, completedAt: row.completed_at ? iso(row.completed_at) : null, failureCategory: row.failure_category ? String(row.failure_category) as AuditRun["failureCategory"] : null, result: row.result_json ? jsonValue(row.result_json) : null };
}

function artifactFromRow(row: QueryResultRow): ArtifactReference {
  return { id: String(row.id), auditRunId: String(row.audit_run_id), kind: "screenshot", contentType: "image/png", byteSize: Number(row.byte_size), sha256: String(row.sha256), createdAt: iso(row.created_at) };
}

function withoutArtifacts(result: AuditResult): AuditRun["result"] {
  const { findings, screenshot, ...stored } = result;
  void findings;
  void screenshot;
  return stored;
}

function storeAuditRunFromRow(row: QueryResultRow): StoreAuditRun {
  return { id: String(row.id), workspaceId: String(row.workspace_id), storeId: String(row.store_id), status: String(row.status) as StoreAuditRun["status"], selectionMode: "automatic_bounded_active_catalog_v1", selectionSignature: String(row.selection_signature), rulesetVersion: String(row.ruleset_version), scope: scopeFromRow(row), selectedPdpCount: Number(row.selected_pdp_count), completedPdpCount: Number(row.completed_pdp_count), failedPdpCount: Number(row.failed_pdp_count), startedAt: row.started_at ? iso(row.started_at) : new Date(0).toISOString(), completedAt: row.completed_at ? iso(row.completed_at) : null, summary: row.summary_json ? jsonValue(row.summary_json) : null };
}

function scopeFromRow(row: QueryResultRow): AuditScopeSnapshot {
  const scope = row.scope_snapshot_json
    ? jsonValue<Partial<AuditScopeSnapshot>>(row.scope_snapshot_json)
    : {};
  return readScopeSnapshot(scope);
}

function storeAuditRunItemFromRow(row: QueryResultRow): StoreAuditRunItem {
  return { id: String(row.id), storeAuditRunId: String(row.store_audit_run_id), catalogItemId: String(row.catalog_item_id), normalizedUrl: String(row.normalized_url), position: Number(row.position), auditRunId: row.audit_run_id ? String(row.audit_run_id) : null, failureCategory: row.failure_category ? String(row.failure_category) as StoreAuditRunItem["failureCategory"] : null };
}
