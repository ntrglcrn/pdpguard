import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";

import { PlaywrightAuditRunner, AuditTimeoutError } from "@/lib/audit/engine";
import { S3ArtifactStore, type ArtifactStore } from "@/lib/artifact-store";
import { PlaywrightCatalogDiscoveryRunner, CatalogDiscoveryTimeoutError } from "@/lib/catalog-discovery";
import { WORKER_LEASE_MS, PostgresAuditJobs, type AuditJob, type StoreOutcome } from "@/lib/hosted-jobs";
import { hostedRuntimeConfig } from "@/lib/hosted-runtime-config";
import { UnsafeUrlError } from "@/lib/url-safety";

class MemoryScreenshots {
  private readonly bytes = new Map<string, Buffer>();
  async save(contents: Buffer) { const id = randomUUID(); this.bytes.set(id, Buffer.from(contents)); return { id, url: `/api/artifacts/${id}` }; }
  async read(id: string) { return this.bytes.get(id) ?? null; }
}
type Failure = "infrastructure" | "timeout" | "unsafe_url";
const category = (error: unknown): Failure => error instanceof UnsafeUrlError ? "unsafe_url" : error instanceof AuditTimeoutError || error instanceof CatalogDiscoveryTimeoutError ? "timeout" : "infrastructure";

async function audit(url: string, objects: ArtifactStore) {
  const screenshots = new MemoryScreenshots();
  const result = await new PlaywrightAuditRunner(screenshots).run(url);
  const contents = await screenshots.read(result.screenshot.id);
  if (!contents) throw new Error("The audit screenshot was not captured.");
  const storageKey = await objects.put(contents, "image/png");
  return { result, artifact: { id: result.screenshot.id, storageKey, contentType: "image/png" as const, byteSize: contents.byteLength, sha256: createHash("sha256").update(contents).digest("hex") } };
}

async function execute(job: AuditJob, jobs: PostgresAuditJobs, objects: ArtifactStore) {
  const input = await jobs.start(job);
  const renewal = setInterval(() => { void jobs.renew(job); }, Math.floor(WORKER_LEASE_MS / 3));
  try {
    if (job.jobType === "quick_audit") {
      const output = await audit(input.targetUrl!, objects);
      try { await jobs.completeQuick(job, output.result, output.artifact); } catch (error) { await objects.delete(output.artifact.storageKey).catch(() => undefined); throw error; }
      return;
    }
    if (job.jobType === "catalog_discovery") { await jobs.completeCatalog(job, await new PlaywrightCatalogDiscoveryRunner().discover(input.storeUrl)); return; }
    const outcomes: StoreOutcome[] = [];
    for (const item of input.items ?? []) {
      try { const output = await audit(item.normalizedUrl, objects); outcomes.push({ itemId: item.id, ...output }); }
      catch (error) { outcomes.push({ itemId: item.id, failureCategory: category(error) }); }
    }
    try { await jobs.completeStore(job, outcomes); } catch (error) {
      await Promise.all(outcomes.flatMap((item) => item.artifact ? [objects.delete(item.artifact.storageKey).catch(() => undefined)] : [])); throw error;
    }
  } catch (error) { await jobs.fail(job, category(error)).catch(() => undefined); }
  finally { clearInterval(renewal); }
}

export async function runWorker() {
  const config = hostedRuntimeConfig(process.env, "worker");
  if (!config) throw new Error("Worker requires production hosted runtime configuration.");
  const pool = new Pool({ connectionString: config.databaseUrl });
  const jobs = new PostgresAuditJobs(pool); const objects = new S3ArtifactStore(config);
  try { for (;;) { const job = await jobs.claim(config.workerId!, WORKER_LEASE_MS); if (!job) { await new Promise((resolve) => setTimeout(resolve, 500)); continue; } await execute(job, jobs, objects); } }
  finally { await pool.end(); }
}
