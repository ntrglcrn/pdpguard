import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { AuditResult } from "@/domain/audit";
import { PostgresWorkspaceService } from "@/lib/postgres-workspace-service";
import { AuthorizationError } from "@/lib/workspace-contract";

const databaseUrl = process.env.PDP_GUARD_TEST_DATABASE_URL;
const schema = `pdpguard_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;
let service: PostgresWorkspaceService;
const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function auditResult(url: string, screenshotId: string, failed = false): AuditResult {
  const timestamp = new Date().toISOString();
  return {
    auditedUrl: url,
    finalUrl: url,
    startedAt: timestamp,
    finishedAt: timestamp,
    durationMs: 1,
    pageTitle: "Product",
    screenshot: { id: screenshotId, url: `/artifacts/${screenshotId}` },
    summary: { status: failed ? "warning" : "passed", counts: { critical: 0, warning: failed ? 1 : 0, passed: failed ? 0 : 1 } },
    findings: [{ id: "title", ruleId: "page-title", title: "Title", description: "Title check", severity: failed ? "warning" : "info", status: failed ? "failed" : "passed", evidence: ["Product"], recommendation: "Add a title." }],
    metadata: { viewport: { width: 1440, height: 900 }, userAgent: "test", httpStatus: 200, redirectCount: 0, blockedRequestCount: 0 },
  };
}

function artifact(id: string) {
  return { id, storageKey: `private/${id}`, contentType: "image/png" as const, byteSize: 3, sha256: "a".repeat(64) };
}

describe.skipIf(!databaseUrl)("PostgresWorkspaceService", () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    for (const migration of ["0001_initial.sql", "0002_external_identities.sql"])
      await pool.query(await readFile(path.join(process.cwd(), "migrations", migration), "utf8"));
    service = new PostgresWorkspaceService(pool, resolver);
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it("persists external identity and session lifecycle", async () => {
    const userId = await service.findOrCreateExternalUser("auth0", "subject-1");
    expect(userId).toBe("auth0:subject-1");
    await expect(service.findOrCreateExternalUser("auth0", "subject-1")).resolves.toBe(userId);

    const session = await service.issueSession(userId);
    const principal = await service.authenticateSession(session.token);
    expect(principal).toMatchObject({ userId });
    await service.revokeSession(principal);
    await expect(service.authenticateSession(session.token)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("preserves workspace and Store tenant isolation", async () => {
    const ownerSession = await service.issueSession("owner");
    const otherSession = await service.issueSession("other");
    const owner = await service.authenticateSession(ownerSession.token);
    const other = await service.authenticateSession(otherSession.token);
    const workspace = await service.createWorkspace(owner, "Acme");
    const store = await service.createStore(owner, workspace.id, { url: "https://example.com" });

    await expect(service.listWorkspaces(owner)).resolves.toEqual([workspace]);
    await expect(service.getStore(owner, store.id)).resolves.toEqual(store);
    await expect(service.listStores(owner, workspace.id)).resolves.toEqual([store]);
    await expect(service.getWorkspaceMembership(other, workspace.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service.getStore(other, store.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rolls back workspace creation when the membership write fails", async () => {
    const session = await service.issueSession("rollback-owner");
    const principal = await service.authenticateSession(session.token);
    await pool.query("ALTER TABLE workspace_members ADD CONSTRAINT reject_owner CHECK (role <> 'owner') NOT VALID");
    await expect(service.createWorkspace(principal, "Never committed")).rejects.toThrow();
    expect((await pool.query("SELECT 1 FROM workspaces WHERE name = 'Never committed'")).rowCount).toBe(0);
    await pool.query("ALTER TABLE workspace_members DROP CONSTRAINT reject_owner");
  });

  it("reads catalog state and category relations with Postgres JSON/boolean semantics", async () => {
    const session = await service.issueSession("catalog-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Catalog");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    await service.startCatalogDiscovery(principal, store.id);
    const catalog = await service.completeCatalogDiscovery(principal, store.id, {
      productUrls: ["https://example.com/products/one", "https://other.example/products/rejected"],
      categories: [{ url: "https://example.com/collections/all", name: "All" }],
      mappings: [{ productUrl: "https://example.com/products/one", categoryUrl: "https://example.com/collections/all" }],
      truncated: false,
    });
    expect(catalog).toMatchObject({
      discovery: { status: "succeeded", partial: false },
      items: [{ active: true }],
      categories: [{ active: true }],
    });
    expect(catalog.items[0].categoryIds).toEqual([catalog.categories[0].id]);
    const firstSeenAt = catalog.items[0].firstSeenAt;
    await service.startCatalogDiscovery(principal, store.id);
    const empty = await service.completeCatalogDiscovery(principal, store.id, []);
    expect(empty.items[0]).toMatchObject({ active: false, firstSeenAt });
  });

  it("atomically creates a Quick Audit run and durable job", async () => {
    const session = await service.issueSession("run-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Runs");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    const created = await service.createAuditRun(principal, store.id, "https://example.com/products/one");
    expect((await pool.query("SELECT status FROM audit_runs WHERE id = $1", [created.run.id])).rows[0]).toEqual({ status: "queued" });
    expect((await pool.query("SELECT status, job_type FROM audit_jobs WHERE id = $1", [created.jobId])).rows[0]).toEqual({ status: "queued", job_type: "quick_audit" });

    await pool.query("ALTER TABLE audit_jobs ADD CONSTRAINT reject_quick CHECK (job_type <> 'quick_audit') NOT VALID");
    await expect(service.createAuditRun(principal, store.id, "https://example.com/products/two")).rejects.toThrow();
    expect((await pool.query("SELECT 1 FROM audit_runs WHERE target_url = 'https://example.com/products/two'")).rowCount).toBe(0);
    await pool.query("ALTER TABLE audit_jobs DROP CONSTRAINT reject_quick");
  });

  it("reads findings and artifact metadata through workspace authorization", async () => {
    const ownerSession = await service.issueSession("artifact-owner");
    const otherSession = await service.issueSession("artifact-other");
    const owner = await service.authenticateSession(ownerSession.token);
    const other = await service.authenticateSession(otherSession.token);
    const workspace = await service.createWorkspace(owner, "Artifacts");
    const store = await service.createStore(owner, workspace.id, { url: "https://example.com" });
    const { run } = await service.createAuditRun(owner, store.id, "https://example.com/products/artifact");
    const finding = { id: "title", ruleId: "page-title", title: "Title", description: "Present", severity: "info", status: "passed", evidence: ["Product"], recommendation: "None" };
    const artifactId = randomUUID();
    await pool.query("INSERT INTO findings (id, audit_run_id, workspace_id, rule_id, payload_json) VALUES ($1, $2, $3, $4, $5)", [finding.id, run.id, workspace.id, finding.ruleId, finding]);
    await pool.query(
      `INSERT INTO artifacts (id, audit_run_id, workspace_id, kind, content_type, byte_size, sha256, storage_key, status, created_at)
       VALUES ($1, $2, $3, 'screenshot', 'image/png', 3, 'abc', 'private/key', 'available', now())`,
      [artifactId, run.id, workspace.id],
    );
    await expect(service.getAuditRun(owner, run.id)).resolves.toMatchObject({ findings: [{ ruleId: "page-title" }], artifacts: [{ id: artifactId }] });
    await expect(service.readArtifactMetadata(owner, artifactId)).resolves.toMatchObject({ storageKey: "private/key" });
    await expect(service.readArtifactMetadata(other, artifactId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("enforces Quick Audit transitions and commits result metadata atomically", async () => {
    const session = await service.issueSession("lifecycle-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Lifecycle");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    const created = await service.createAuditRun(principal, store.id, "https://example.com/products/complete");
    await expect(service.startAuditRun(created.worker)).resolves.toMatchObject({ status: "running" });
    await expect(service.startAuditRun(created.worker)).rejects.toBeInstanceOf(AuthorizationError);
    const screenshotId = randomUUID();
    await expect(service.completeAuditRun(created.worker, auditResult(created.run.targetUrl, screenshotId), artifact(screenshotId))).resolves.toMatchObject({ status: "completed" });
    await expect(service.failAuditRun(created.worker, "infrastructure")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service.getAuditRun(principal, created.run.id)).resolves.toMatchObject({ status: "completed", findings: [{ ruleId: "page-title" }], artifacts: [{ id: screenshotId }] });

    const failed = await service.createAuditRun(principal, store.id, "https://example.com/products/failed");
    await service.startAuditRun(failed.worker);
    await expect(service.failAuditRun(failed.worker, "timeout")).resolves.toMatchObject({ status: "failed", failureCategory: "timeout" });
    const cancelled = await service.createAuditRun(principal, store.id, "https://example.com/products/cancelled");
    await expect(service.cancelAuditRun(principal, cancelled.run.id)).resolves.toMatchObject({ status: "cancelled" });
    await expect(service.startAuditRun(cancelled.worker)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("authorizes pending artifact metadata mutations by run workspace", async () => {
    const ownerSession = await service.issueSession("artifact-mutation-owner");
    const otherSession = await service.issueSession("artifact-mutation-other");
    const owner = await service.authenticateSession(ownerSession.token);
    const other = await service.authenticateSession(otherSession.token);
    const workspace = await service.createWorkspace(owner, "Artifact mutations");
    const store = await service.createStore(owner, workspace.id, { url: "https://example.com" });
    const { run } = await service.createAuditRun(owner, store.id, "https://example.com/products/pending-artifact");
    const metadata = artifact(randomUUID());
    await service.createArtifactMetadata(owner, run.id, metadata);
    await expect(service.readArtifactMetadata(owner, metadata.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service.markArtifactAvailable(other, metadata.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service.markArtifactAvailable(owner, metadata.id)).resolves.toMatchObject({ storageKey: metadata.storageKey });
    await expect(service.readArtifactMetadata(owner, metadata.id)).resolves.toMatchObject({ storageKey: metadata.storageKey });
    await expect(service.deleteArtifactMetadata(other, metadata.id)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(service.deleteArtifactMetadata(owner, metadata.id)).resolves.toEqual({ storageKey: metadata.storageKey });
  });

  it("atomically snapshots a bounded Store Audit and enqueues one parent job", async () => {
    const session = await service.issueSession("store-run-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Store Runs");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    const itemId = randomUUID();
    await pool.query(
      `INSERT INTO catalog_discoveries (store_id, workspace_id, status, started_at, completed_at, discovered_count, rejected_count, partial)
       VALUES ($1, $2, 'succeeded', now(), now(), 1, 0, false)`, [store.id, workspace.id],
    );
    await pool.query(
      `INSERT INTO catalog_items (id, workspace_id, store_id, normalized_url, source, first_seen_at, last_seen_at, active)
       VALUES ($1, $2, $3, 'https://example.com/products/store-run', 'root_page_link', now(), now(), true)`,
      [itemId, workspace.id, store.id],
    );
    const created = await service.createStoreAuditRun(principal, store.id);
    expect(created.run).toMatchObject({ status: "queued", selectedPdpCount: 1, scope: { selectedCatalogItemIds: [itemId], catalogComplete: true } });
    expect((await pool.query("SELECT job_type, store_audit_run_id FROM audit_jobs WHERE id = $1", [created.jobId])).rows[0]).toEqual({ job_type: "store_audit", store_audit_run_id: created.run.id });
    await expect(service.listStoreAuditRuns(principal, store.id)).resolves.toMatchObject([{ id: created.run.id, status: "queued" }]);
  });

  it("ports Store Audit child lifecycle, report aggregation, and Monitoring", async () => {
    const session = await service.issueSession("monitoring-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Monitoring");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    await service.startCatalogDiscovery(principal, store.id);
    await service.completeCatalogDiscovery(principal, store.id, ["https://example.com/products/monitored"]);

    const finishStoreRun = async () => {
      const parent = await service.createStoreAuditRun(principal, store.id);
      await service.startStoreAuditRun(principal, parent.run.id);
      const child = await service.createAuditRun(principal, store.id, parent.items[0].normalizedUrl);
      await service.linkStoreAuditRunItem(principal, parent.run.id, parent.items[0].id, child.run.id);
      await service.startAuditRun(child.worker);
      const screenshotId = randomUUID();
      await service.completeAuditRun(child.worker, auditResult(child.run.targetUrl, screenshotId, true), artifact(screenshotId));
      return service.completeStoreAuditRun(principal, parent.run.id);
    };

    const baseline = await finishStoreRun();
    expect(baseline).toMatchObject({ status: "completed", completedPdpCount: 1, failedPdpCount: 0, issues: [{ ruleId: "page-title", lifecycle: "new" }] });
    const current = await finishStoreRun();
    expect(current).toMatchObject({ status: "completed", issues: [{ ruleId: "page-title", lifecycle: "unchanged" }] });
    await expect(service.getStoreAuditRun(principal, current.id)).resolves.toMatchObject({ items: [{ auditRunId: expect.any(String) }], summary: { warningCount: 1 } });
    await expect(service.listMonitoringTargets(principal, store.id)).resolves.toMatchObject([{ lastConfirmed: { id: current.id } }]);
    await expect(service.getMonitoringReport(principal, store.id, current.id)).resolves.toMatchObject({ baseline: { id: baseline.id }, lastConfirmed: { id: current.id }, comparisonPredecessor: { id: baseline.id }, changes: { unchanged: 1 }, currentIssues: [{ ruleId: "page-title", history: [{ lifecycle: "new" }, { lifecycle: "unchanged" }] }] });
    await expect(service.monitoringScopeInput(principal, store.id, current.id)).resolves.toEqual({ kind: "all" });

    const partial = await service.createStoreAuditRun(principal, store.id);
    await service.startStoreAuditRun(principal, partial.run.id);
    await service.recordStoreAuditItemFailure(principal, partial.run.id, partial.items[0].id, "infrastructure");
    await expect(service.failStoreAuditRun(principal, partial.run.id)).resolves.toMatchObject({ status: "failed", failedPdpCount: 1 });
    await expect(service.getMonitoringReport(principal, store.id, partial.run.id)).resolves.toMatchObject({ latestAttempt: { id: partial.run.id, status: "failed" }, lastConfirmed: { id: current.id } });
  });

  it("keeps incomplete legacy Monitoring scope rows readable", async () => {
    const session = await service.issueSession("legacy-monitoring-owner");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Legacy Monitoring");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    const runId = randomUUID();
    await pool.query(
      `INSERT INTO store_audit_runs
        (id, workspace_id, store_id, status, selection_mode, selection_signature,
         ruleset_version, scope_snapshot_json, selected_pdp_count,
         completed_pdp_count, failed_pdp_count, started_at, completed_at)
       VALUES ($1,$2,$3,'failed','automatic_bounded_active_catalog_v1','legacy',
         'store-audit-v1',$4,1,0,1,now(),now())`,
      [runId, workspace.id, store.id, { executionLimit: "invalid" }],
    );
    await expect(service.listMonitoringTargets(principal, store.id)).resolves.toMatchObject([{
      referenceRunId: runId,
      scope: { kind: "all", executionLimit: 5, selectedCatalogItemIds: [], catalogComplete: true },
    }]);
  });
});
