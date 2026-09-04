import "server-only";

import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type AuditJobStatus = "queued" | "running" | "completed" | "failed";

export interface AuditJob {
  id: string;
  workspaceId: string;
  runId: string;
  jobType: "quick_audit";
  status: AuditJobStatus;
  attempt: number;
  availableAt: string;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  workerId: string | null;
  completedAt: string | null;
  failureCategory: string | null;
}

export class PostgresAuditJobs {
  constructor(private readonly pool: Pool) {}

  async enqueue(runId: string) {
    const job = {
      id: randomUUID(), runId, jobType: "quick_audit" as const, availableAt: new Date().toISOString(),
    };
    const result = await this.pool.query(
      `INSERT INTO audit_jobs (id, workspace_id, audit_run_id, job_type, status, attempt, available_at)
       SELECT $1, workspace_id, id, $2, 'queued', 0, $3 FROM audit_runs WHERE id = $4`,
      [job.id, job.jobType, job.availableAt, job.runId],
    );
    if (result.rowCount !== 1) throw new Error("The audit run does not exist.");
    return job.id;
  }

  /** One transaction: a valid lease can belong to only one worker. */
  async claim(workerId: string, leaseMs: number): Promise<AuditJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE audit_jobs SET status = 'failed', completed_at = now(),
           lease_expires_at = NULL, failure_category = 'infrastructure'
         WHERE status = 'running' AND lease_expires_at <= now() AND attempt >= 2`,
      );
      const row = await client.query(
        `WITH candidate AS (
           SELECT id FROM audit_jobs
           WHERE (status = 'queued' AND available_at <= now())
              OR (status = 'running' AND lease_expires_at <= now() AND attempt < 2)
           ORDER BY available_at, created_at, id
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE audit_jobs j SET status = 'running', attempt = j.attempt + 1,
           claimed_at = now(), lease_expires_at = now() + ($1 * interval '1 millisecond'),
           worker_id = $2, failure_category = NULL
         FROM candidate WHERE j.id = candidate.id RETURNING j.*`,
        [leaseMs, workerId],
      );
      await client.query("COMMIT");
      return row.rows[0] ? auditJobFromRow(row.rows[0]) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async complete(id: string, workerId: string, attempt: number) {
    const result = await this.pool.query(
      `UPDATE audit_jobs SET status = 'completed', completed_at = now(), lease_expires_at = NULL
       WHERE id = $1 AND status = 'running' AND worker_id = $2 AND attempt = $3
         AND lease_expires_at > now()`, [id, workerId, attempt],
    );
    return result.rowCount === 1;
  }

  async fail(id: string, workerId: string, attempt: number, failureCategory: string) {
    const result = await this.pool.query(
      `UPDATE audit_jobs SET status = 'failed', completed_at = now(), lease_expires_at = NULL, failure_category = $4
       WHERE id = $1 AND status = 'running' AND worker_id = $2 AND attempt = $3
         AND lease_expires_at > now()`, [id, workerId, attempt, failureCategory],
    );
    return result.rowCount === 1;
  }
}

function auditJobFromRow(row: Record<string, unknown>): AuditJob {
  const iso = (value: unknown) => value ? new Date(String(value)).toISOString() : null;
  return { id: String(row.id), workspaceId: String(row.workspace_id), runId: String(row.audit_run_id), jobType: "quick_audit", status: row.status as AuditJobStatus, attempt: Number(row.attempt), availableAt: iso(row.available_at)!, claimedAt: iso(row.claimed_at), leaseExpiresAt: iso(row.lease_expires_at), workerId: row.worker_id ? String(row.worker_id) : null, completedAt: iso(row.completed_at), failureCategory: row.failure_category ? String(row.failure_category) : null };
}
