import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import type { AuditResult } from "@/domain/audit";
import { LeaseLostError, PostgresAuditJobs } from "@/lib/hosted-jobs";
import { PostgresWorkspaceService, type HostedArtifactMetadata } from "@/lib/postgres-workspace-service";

const databaseUrl = process.env.PDP_GUARD_TEST_DATABASE_URL;
const schema = `pdpguard_worker_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let setupPool: Pool;
let workerAPool: Pool;
let workerBPool: Pool;
let service: PostgresWorkspaceService;
let workerA: PostgresAuditJobs;
let workerB: PostgresAuditJobs;
const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function result(url: string, screenshotId: string): AuditResult {
  const timestamp = new Date().toISOString();
  return {
    auditedUrl: url, finalUrl: url, startedAt: timestamp, finishedAt: timestamp, durationMs: 1,
    pageTitle: "Product", screenshot: { id: screenshotId, url: `/api/artifacts/${screenshotId}` },
    summary: { status: "passed", counts: { critical: 0, warning: 0, passed: 1 } },
    findings: [{ id: "title", ruleId: "page-title", title: "Title", description: "Present", severity: "info", status: "passed", evidence: ["Product"], recommendation: "None" }],
    metadata: { viewport: { width: 1440, height: 900 }, userAgent: "test", httpStatus: 200, redirectCount: 0, blockedRequestCount: 0 },
  };
}

function artifact(id: string): HostedArtifactMetadata {
  return { id, storageKey: `artifacts/${id}`, contentType: "image/png", byteSize: 3, sha256: "a".repeat(64) };
}

describe.skipIf(!databaseUrl)("hosted worker Postgres fencing", () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const options = `-c search_path=${schema}`;
    setupPool = new Pool({ connectionString: databaseUrl, options });
    workerAPool = new Pool({ connectionString: databaseUrl, options });
    workerBPool = new Pool({ connectionString: databaseUrl, options });
    for (const migration of ["0001_initial.sql", "0002_external_identities.sql"])
      await setupPool.query(await readFile(path.join(process.cwd(), "migrations", migration), "utf8"));
    service = new PostgresWorkspaceService(setupPool, resolver);
    workerA = new PostgresAuditJobs(workerAPool, resolver);
    workerB = new PostgresAuditJobs(workerBPool, resolver);
  });

  afterAll(async () => {
    await Promise.all([setupPool?.end(), workerAPool?.end(), workerBPool?.end()]);
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  async function queuedQuick(name: string) {
    const session = await service.issueSession(`worker-${name}`);
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, name);
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    return service.createAuditRun(principal, store.id, "https://example.com/products/one");
  }

  it("uses a lease as a real Postgres fence across independent workers", async () => {
    const created = await queuedQuick("lease fence");
    const claimedA = await workerA.claim("worker-a", 60_000);
    expect(claimedA).toMatchObject({ id: created.jobId, workerId: "worker-a", attempt: 1 });
    await workerA.start(claimedA!);
    await expect(workerB.claim("worker-b", 60_000)).resolves.toBeNull();

    await setupPool.query("UPDATE audit_jobs SET lease_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = $1", [created.jobId]);
    const claimedB = await workerB.claim("worker-b", 60_000);
    expect(claimedB).toMatchObject({ id: created.jobId, workerId: "worker-b", attempt: 2 });
    await expect(workerB.start(claimedB!)).resolves.toMatchObject({
      targetUrl: created.run.targetUrl,
    });

    expect(await workerA.renew(claimedA!)).toBe(false);
    expect(await workerB.renew({ ...claimedB!, workerId: "wrong-worker" })).toBe(false);
    expect(await workerB.renew({ ...claimedB!, attempt: 1 })).toBe(false);
    expect(await workerB.renew(claimedB!)).toBe(true);

    const unrelated = await queuedQuick("forged context target");
    const unrelatedArtifactId = randomUUID();
    await expect(workerB.completeQuick(
      { ...claimedB!, runId: unrelated.run.id },
      result(unrelated.run.targetUrl, unrelatedArtifactId),
      artifact(unrelatedArtifactId),
    )).rejects.toBeInstanceOf(LeaseLostError);
    expect((await setupPool.query("SELECT status FROM audit_runs WHERE id = $1", [unrelated.run.id])).rows[0].status).toBe("queued");
    await setupPool.query("DELETE FROM audit_jobs WHERE audit_run_id = $1", [unrelated.run.id]);
    await setupPool.query("DELETE FROM audit_runs WHERE id = $1", [unrelated.run.id]);
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = $1", [created.jobId]);
    expect(await workerB.renew(claimedB!)).toBe(false);
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at = clock_timestamp() + interval '1 minute' WHERE id = $1", [created.jobId]);

    const staleResult = result(created.run.targetUrl, randomUUID());
    await expect(workerA.completeQuick(claimedA!, staleResult, artifact(staleResult.screenshot.id))).rejects.toBeInstanceOf(LeaseLostError);
    await expect(workerA.fail(claimedA!, "infrastructure")).rejects.toBeInstanceOf(LeaseLostError);
    expect((await setupPool.query("SELECT status, result_json FROM audit_runs WHERE id = $1", [created.run.id])).rows[0]).toEqual({ status: "running", result_json: null });
    expect((await setupPool.query("SELECT count(*)::int AS count FROM findings WHERE audit_run_id = $1", [created.run.id])).rows[0].count).toBe(0);
    expect((await setupPool.query("SELECT count(*)::int AS count FROM artifacts WHERE audit_run_id = $1", [created.run.id])).rows[0].count).toBe(0);
    expect((await setupPool.query("SELECT status, worker_id, attempt FROM audit_jobs WHERE id = $1", [created.jobId])).rows[0]).toEqual({ status: "running", worker_id: "worker-b", attempt: 2 });

    const winning = result(created.run.targetUrl, randomUUID());
    await workerB.completeQuick(claimedB!, winning, artifact(winning.screenshot.id));
    expect((await setupPool.query("SELECT status FROM audit_runs WHERE id = $1", [created.run.id])).rows[0].status).toBe("completed");
    expect((await setupPool.query("SELECT status, attempt FROM audit_jobs WHERE id = $1", [created.jobId])).rows[0]).toEqual({ status: "completed", attempt: 2 });
    expect((await setupPool.query("SELECT count(*)::int AS count FROM findings WHERE audit_run_id = $1", [created.run.id])).rows[0].count).toBe(1);
    expect((await setupPool.query("SELECT count(*)::int AS count FROM artifacts WHERE audit_run_id = $1", [created.run.id])).rows[0].count).toBe(1);
  });

  it("exhausts expired leases once and rejects further claims", async () => {
    const created = await queuedQuick("max attempts");
    const first = await workerA.claim("first", 60_000);
    expect(first).toMatchObject({ id: created.jobId, attempt: 1 });
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = $1", [created.jobId]);
    const second = await workerB.claim("second", 60_000);
    expect(second).toMatchObject({ id: created.jobId, attempt: 2 });
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = $1", [created.jobId]);

    await expect(workerA.claim("third", 60_000)).resolves.toBeNull();
    expect((await setupPool.query("SELECT status, failure_category, attempt FROM audit_jobs WHERE id = $1", [created.jobId])).rows[0]).toEqual({ status: "failed", failure_category: "infrastructure", attempt: 2 });
    expect((await setupPool.query("SELECT status, failure_category FROM audit_runs WHERE id = $1", [created.run.id])).rows[0]).toEqual({ status: "failed", failure_category: "infrastructure" });
    await expect(workerB.claim("fourth", 60_000)).resolves.toBeNull();
  });

  it("rolls back every Store terminal mutation from a stale attempt", async () => {
    const session = await service.issueSession("worker-store-fence");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Store fence");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    await service.startCatalogDiscovery(principal, store.id);
    await service.completeCatalogDiscovery(principal, store.id, ["https://example.com/products/store"]);
    const created = await service.createStoreAuditRun(principal, store.id);
    const claimedA = await workerA.claim("store-a", 60_000);
    const inputA = await workerA.start(claimedA!);
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at=clock_timestamp()-interval '1 millisecond' WHERE id=$1", [created.jobId]);
    const claimedB = await workerB.claim("store-b", 60_000);
    await workerB.start(claimedB!);
    const stale = result(inputA.items![0].normalizedUrl, randomUUID());
    await expect(workerA.completeStore(claimedA!, [{ itemId: inputA.items![0].id, result: stale, artifact: artifact(stale.screenshot.id) }])).rejects.toBeInstanceOf(LeaseLostError);
    expect((await setupPool.query("SELECT status,completed_pdp_count FROM store_audit_runs WHERE id=$1", [created.run.id])).rows[0]).toEqual({ status: "running", completed_pdp_count: 0 });
    expect((await setupPool.query("SELECT audit_run_id FROM store_audit_run_items WHERE id=$1", [inputA.items![0].id])).rows[0].audit_run_id).toBeNull();
    expect((await setupPool.query("SELECT count(*)::int count FROM findings WHERE workspace_id=$1", [workspace.id])).rows[0].count).toBe(0);
    expect((await setupPool.query("SELECT count(*)::int count FROM artifacts WHERE workspace_id=$1", [workspace.id])).rows[0].count).toBe(0);
    const winning = result(inputA.items![0].normalizedUrl, randomUUID());
    await workerB.completeStore(claimedB!, [{ itemId: inputA.items![0].id, result: winning, artifact: artifact(winning.screenshot.id) }]);
    expect((await setupPool.query("SELECT status,completed_pdp_count FROM store_audit_runs WHERE id=$1", [created.run.id])).rows[0]).toEqual({ status: "completed", completed_pdp_count: 1 });
  });

  it("rolls back run, finding, artifact and job when terminal artifact insertion fails", async () => {
    const created = await queuedQuick("atomic rollback");
    const claimed = await workerA.claim("rollback-worker", 60_000);
    await workerA.start(claimed!);
    const forced = randomUUID();
    await setupPool.query(`ALTER TABLE artifacts ADD CONSTRAINT reject_forced_key CHECK (storage_key <> 'artifacts/${forced}') NOT VALID`);
    const output = result(created.run.targetUrl, forced);
    await expect(workerA.completeQuick(claimed!, output, artifact(forced))).rejects.toThrow();
    expect((await setupPool.query("SELECT status,result_json FROM audit_runs WHERE id=$1", [created.run.id])).rows[0]).toEqual({ status: "running", result_json: null });
    expect((await setupPool.query("SELECT count(*)::int count FROM findings WHERE audit_run_id=$1", [created.run.id])).rows[0].count).toBe(0);
    expect((await setupPool.query("SELECT count(*)::int count FROM artifacts WHERE audit_run_id=$1", [created.run.id])).rows[0].count).toBe(0);
    expect((await setupPool.query("SELECT status FROM audit_jobs WHERE id=$1", [created.jobId])).rows[0].status).toBe("running");
    await setupPool.query("ALTER TABLE artifacts DROP CONSTRAINT reject_forced_key");
    await workerA.completeQuick(claimed!, output, artifact(forced));
  });

  it("fences Catalog completion and lets only the reclaimed owner publish it", async () => {
    const session = await service.issueSession("worker-catalog-fence");
    const principal = await service.authenticateSession(session.token);
    const workspace = await service.createWorkspace(principal, "Catalog fence");
    const store = await service.createStore(principal, workspace.id, { url: "https://example.com" });
    await service.enqueueCatalogDiscovery(principal, store.id);
    const claimedA = await workerA.claim("catalog-a", 60_000);
    await workerA.start(claimedA!);
    await setupPool.query("UPDATE audit_jobs SET lease_expires_at=clock_timestamp()-interval '1 millisecond' WHERE id=$1", [claimedA!.id]);
    const claimedB = await workerB.claim("catalog-b", 60_000);
    await workerB.start(claimedB!);
    const discovery = {
      productUrls: ["https://example.com/products/catalog"],
      categories: [{ url: "https://example.com/collections/all", name: "All" }],
      mappings: [{ productUrl: "https://example.com/products/catalog", categoryUrl: "https://example.com/collections/all" }],
      truncated: false,
    };
    await expect(workerA.completeCatalog(claimedA!, discovery)).rejects.toBeInstanceOf(LeaseLostError);
    expect((await setupPool.query("SELECT status FROM catalog_discoveries WHERE store_id=$1", [store.id])).rows[0].status).toBe("running");
    await workerB.completeCatalog(claimedB!, discovery);
    expect((await setupPool.query("SELECT status FROM catalog_discoveries WHERE store_id=$1", [store.id])).rows[0].status).toBe("succeeded");
    expect((await setupPool.query("SELECT count(*)::int count FROM catalog_category_mappings WHERE store_id=$1", [store.id])).rows[0].count).toBe(1);
  });
});
