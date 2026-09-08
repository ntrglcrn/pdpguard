import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { AuditResult } from "@/domain/audit";
import type { CatalogDiscoveryResult } from "@/lib/catalog-discovery";
import type { HostedArtifactMetadata } from "@/lib/postgres-workspace-service";
import { validatePublicUrl, type DnsResolver } from "@/lib/url-safety";
import { normalizedHref, requiredCategoryName } from "@/lib/workspace-contract";

export const WORKER_LEASE_MS = 90_000;
export const WORKER_MAX_ATTEMPTS = 2;
export type AuditJobType = "quick_audit" | "store_audit" | "catalog_discovery";
export interface AuditJob { id:string; workspaceId:string; runId:string; jobType:AuditJobType; status:"queued"|"running"|"completed"|"failed"; attempt:number; workerId:string|null; leaseExpiresAt:string|null; }
export interface JobInput { storeId:string; storeUrl:string; targetUrl?:string; items?:Array<{id:string;normalizedUrl:string}> }
export interface StoreOutcome { itemId:string; result?:AuditResult; artifact?:HostedArtifactMetadata; failureCategory?:"infrastructure"|"timeout"|"unsafe_url" }
export class LeaseLostError extends Error { constructor() { super("The job lease was lost."); this.name="LeaseLostError"; } }

/** Worker mutations pass through this one transaction and cannot outlive a lease. */
export class PostgresAuditJobs {
  constructor(private readonly pool:Pool, private readonly resolver?:DnsResolver) {}
  async claim(workerId:string, leaseMs=WORKER_LEASE_MS):Promise<AuditJob|null> {
    const db=await this.pool.connect(); try { await db.query("BEGIN");
      const exhausted=await db.query(`UPDATE audit_jobs SET status='failed',completed_at=clock_timestamp(),lease_expires_at=NULL,failure_category='infrastructure' WHERE status='running' AND lease_expires_at<=clock_timestamp() AND attempt >= $1 RETURNING audit_run_id,store_audit_run_id,discovery_store_id`,[WORKER_MAX_ATTEMPTS]);
      for(const row of exhausted.rows) {
        if(row.audit_run_id) await db.query("UPDATE audit_runs SET status='failed',completed_at=clock_timestamp(),failure_category='infrastructure' WHERE id=$1 AND status IN ('queued','running')",[row.audit_run_id]);
        if(row.store_audit_run_id) await db.query("UPDATE store_audit_runs SET status='failed',completed_at=clock_timestamp() WHERE id=$1 AND status IN ('queued','running')",[row.store_audit_run_id]);
        if(row.discovery_store_id) await db.query("UPDATE catalog_discoveries SET status='failed',completed_at=clock_timestamp(),failure_category='infrastructure' WHERE store_id=$1 AND status IN ('queued','running')",[row.discovery_store_id]);
      }
      const found=await db.query(`WITH candidate AS (SELECT id FROM audit_jobs WHERE (status='queued' AND available_at<=clock_timestamp()) OR (status='running' AND lease_expires_at<=clock_timestamp() AND attempt<$1) ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE audit_jobs j SET status='running',attempt=j.attempt+1,claimed_at=clock_timestamp(),lease_expires_at=clock_timestamp()+($2*interval '1 millisecond'),worker_id=$3,failure_category=NULL FROM candidate WHERE j.id=candidate.id RETURNING j.*`,[WORKER_MAX_ATTEMPTS,leaseMs,workerId]);
      await db.query("COMMIT"); return found.rows[0] ? fromRow(found.rows[0]) : null;
    } catch(e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  }
  async renew(job:AuditJob, leaseMs=WORKER_LEASE_MS) { return (await this.pool.query("UPDATE audit_jobs SET lease_expires_at=clock_timestamp()+($1*interval '1 millisecond') WHERE id=$2 AND status='running' AND worker_id=$3 AND attempt=$4 AND lease_expires_at>clock_timestamp()",[leaseMs,job.id,job.workerId,job.attempt])).rowCount===1; }
  async start(job:AuditJob):Promise<JobInput> { return this.fenced(job,async db=>{
    if(job.jobType==="quick_audit") { const run=(await db.query("UPDATE audit_runs SET status='running',started_at=coalesce(started_at,clock_timestamp()) WHERE id=$1 AND workspace_id=$2 AND status IN ('queued','running') RETURNING store_id,target_url",[job.runId,job.workspaceId])).rows[0]; const store=run&&(await db.query("SELECT url FROM stores WHERE id=$1 AND workspace_id=$2",[run.store_id,job.workspaceId])).rows[0]; if(!store) throw new LeaseLostError(); return {storeId:String(run.store_id),storeUrl:String(store.url),targetUrl:String(run.target_url)}; }
    if(job.jobType==="store_audit") { const parent=(await db.query("UPDATE store_audit_runs SET status='running',started_at=coalesce(started_at,clock_timestamp()) WHERE id=$1 AND workspace_id=$2 AND status IN ('queued','running') RETURNING store_id",[job.runId,job.workspaceId])).rows[0]; const store=parent&&(await db.query("SELECT url FROM stores WHERE id=$1 AND workspace_id=$2",[parent.store_id,job.workspaceId])).rows[0]; if(!store) throw new LeaseLostError(); const items=await db.query("SELECT id,normalized_url FROM store_audit_run_items WHERE store_audit_run_id=$1 ORDER BY position",[job.runId]); return {storeId:String(parent.store_id),storeUrl:String(store.url),items:items.rows.map(r=>({id:String(r.id),normalizedUrl:String(r.normalized_url)}))}; }
    const discovery=(await db.query("UPDATE catalog_discoveries SET status='running',started_at=coalesce(started_at,clock_timestamp()),completed_at=NULL,failure_category=NULL WHERE store_id=$1 AND workspace_id=$2 AND status IN ('queued','running') RETURNING store_id",[job.runId,job.workspaceId])).rows[0]; const store=discovery&&(await db.query("SELECT url FROM stores WHERE id=$1 AND workspace_id=$2",[job.runId,job.workspaceId])).rows[0]; if(!store) throw new LeaseLostError(); return {storeId:job.runId,storeUrl:String(store.url)};
  }); }
  async completeQuick(job:AuditJob,result:AuditResult,artifact:HostedArtifactMetadata) { assertArtifact(result,artifact); await this.fenced(job,async db=>{ const run=(await db.query("SELECT target_url FROM audit_runs WHERE id=$1 AND workspace_id=$2 AND status='running' FOR UPDATE",[job.runId,job.workspaceId])).rows[0]; if(!run||run.target_url!==result.auditedUrl) throw new LeaseLostError(); await persistAudit(db,job.workspaceId,job.runId,result,artifact); await this.finish(db,job); }); }
  async completeStore(job:AuditJob,outcomes:StoreOutcome[]) { await this.fenced(job,async db=>{ const parent=(await db.query("SELECT * FROM store_audit_runs WHERE id=$1 AND workspace_id=$2 AND status='running' FOR UPDATE",[job.runId,job.workspaceId])).rows[0]; if(!parent) throw new LeaseLostError(); for(const out of outcomes) { const item=(await db.query("SELECT * FROM store_audit_run_items WHERE id=$1 AND store_audit_run_id=$2 FOR UPDATE",[out.itemId,job.runId])).rows[0]; if(!item) throw new LeaseLostError(); if(out.result&&out.artifact) { assertArtifact(out.result,out.artifact); if(out.result.auditedUrl!==item.normalized_url) throw new LeaseLostError(); const runId=randomUUID(); await db.query("INSERT INTO audit_runs (id,workspace_id,store_id,target_url,status,created_at,started_at,completed_at) VALUES ($1,$2,$3,$4,'running',clock_timestamp(),clock_timestamp(),clock_timestamp())",[runId,job.workspaceId,parent.store_id,item.normalized_url]); await persistAudit(db,job.workspaceId,runId,out.result,out.artifact); await db.query("UPDATE store_audit_run_items SET audit_run_id=$1 WHERE id=$2",[runId,item.id]); } else await db.query("UPDATE store_audit_run_items SET failure_category=$1 WHERE id=$2",[out.failureCategory??"infrastructure",item.id]); }
    const count=(await db.query(`SELECT count(*) FILTER (WHERE r.status='completed')::int complete,count(*) FILTER (WHERE i.failure_category IS NOT NULL OR r.status='failed')::int failed FROM store_audit_run_items i LEFT JOIN audit_runs r ON r.id=i.audit_run_id WHERE i.store_audit_run_id=$1`,[job.runId])).rows[0];
    const issues=(await db.query(`SELECT count(DISTINCT f.rule_id) FILTER (WHERE f.payload_json->>'status'='failed')::int issues,count(DISTINCT f.rule_id) FILTER (WHERE f.payload_json->>'status'='failed' AND f.payload_json->>'severity'='critical')::int critical,count(DISTINCT f.rule_id) FILTER (WHERE f.payload_json->>'status'='failed' AND f.payload_json->>'severity'='warning')::int warning FROM store_audit_run_items i JOIN findings f ON f.audit_run_id=i.audit_run_id WHERE i.store_audit_run_id=$1`,[job.runId])).rows[0];
    const status=Number(count.complete)===Number(parent.selected_pdp_count)?"completed":Number(count.complete)?"completed_with_failures":"failed"; const summary={issueCount:Number(issues.issues),criticalCount:Number(issues.critical),warningCount:Number(issues.warning)}; await db.query("UPDATE store_audit_runs SET status=$1,completed_at=clock_timestamp(),completed_pdp_count=$2,failed_pdp_count=$3,summary_json=$4 WHERE id=$5",[status,count.complete,count.failed,summary,job.runId]); await this.finish(db,job); }); }
  async completeCatalog(job:AuditJob,result:CatalogDiscoveryResult) {
    const products:string[]=[]; let rejected=Math.max(0,result.productUrls.length-200);
    for(const candidate of [...new Set(result.productUrls)].slice(0,200)) {
      try { products.push((await validatePublicUrl(candidate,this.resolver)).href); } catch { rejected+=1; }
    }
    const categories:Array<{url:string;name:string;source:"root_page_link"|"category_page_link"}>=[];
    for(const candidate of result.categories.slice(0,30)) {
      try { categories.push({url:(await validatePublicUrl(candidate.url,this.resolver)).href,name:requiredCategoryName(candidate.name),source:candidate.source??"root_page_link"}); } catch { rejected+=1; }
    }
    await this.fenced(job,async db=>{
      const active=(await db.query("SELECT s.url FROM catalog_discoveries d JOIN stores s ON s.id=d.store_id AND s.workspace_id=d.workspace_id WHERE d.store_id=$1 AND d.workspace_id=$2 AND d.status='running' FOR UPDATE OF d",[job.runId,job.workspaceId])).rows[0];
      if(!active) throw new LeaseLostError(); const origin=new URL(String(active.url)).origin;
      const urls=products.filter(url=>{const allowed=new URL(url).origin===origin;if(!allowed) rejected+=1;return allowed;});
      if(!result.truncated) {
        await db.query("UPDATE catalog_items SET active=false WHERE store_id=$1",[job.runId]);
        await db.query("UPDATE catalog_categories SET active=false WHERE store_id=$1",[job.runId]);
        await db.query("DELETE FROM catalog_category_mappings WHERE store_id=$1",[job.runId]);
      }
      for(const url of urls) await db.query("INSERT INTO catalog_items (id,workspace_id,store_id,normalized_url,source,first_seen_at,last_seen_at,active) VALUES ($1,$2,$3,$4,'root_page_link',clock_timestamp(),clock_timestamp(),true) ON CONFLICT (store_id,normalized_url) DO UPDATE SET last_seen_at=clock_timestamp(),active=true",[randomUUID(),job.workspaceId,job.runId,url]);
      const categoryIds=new Map<string,string>();
      for(const category of categories) {
        if(new URL(category.url).origin!==origin) { rejected+=1; continue; }
        const path=new URL(category.url).pathname.replace(/\/$/,"")||"/";
        const row=await db.query("INSERT INTO catalog_categories (id,workspace_id,store_id,normalized_path,name,source,first_seen_at,last_seen_at,active) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp(),clock_timestamp(),true) ON CONFLICT (store_id,normalized_path) DO UPDATE SET name=excluded.name,source=excluded.source,last_seen_at=clock_timestamp(),active=true RETURNING id",[randomUUID(),job.workspaceId,job.runId,path,category.name,category.source]);
        categoryIds.set(category.url,String(row.rows[0].id));
      }
      for(const mapping of result.mappings) {
        let productUrl:string; let categoryUrl:string; try { productUrl=normalizedHref(mapping.productUrl); categoryUrl=normalizedHref(mapping.categoryUrl); } catch { continue; }
        const categoryId=categoryIds.get(categoryUrl); if(!categoryId||!urls.includes(productUrl)) continue;
        await db.query("INSERT INTO catalog_category_mappings (store_id,catalog_item_id,category_id) SELECT $1,i.id,$2 FROM catalog_items i WHERE i.store_id=$1 AND i.normalized_url=$3 ON CONFLICT DO NOTHING",[job.runId,categoryId,productUrl]);
      }
      await db.query("UPDATE catalog_discoveries SET status='succeeded',completed_at=clock_timestamp(),partial=$1,discovered_count=$2,rejected_count=$3,failure_category=NULL WHERE store_id=$4",[result.truncated,urls.length,rejected,job.runId]); await this.finish(db,job);
    });
  }
  async fail(job:AuditJob,category:"infrastructure"|"timeout"|"unsafe_url") { await this.fenced(job,async db=>{ if(job.jobType==="quick_audit") await db.query("UPDATE audit_runs SET status='failed',completed_at=clock_timestamp(),failure_category=$1 WHERE id=$2 AND status IN ('queued','running')",[category,job.runId]); else if(job.jobType==="store_audit") await db.query("UPDATE store_audit_runs SET status='failed',completed_at=clock_timestamp() WHERE id=$1 AND status IN ('queued','running')",[job.runId]); else await db.query("UPDATE catalog_discoveries SET status='failed',completed_at=clock_timestamp(),failure_category=$1 WHERE store_id=$2 AND status IN ('queued','running')",[category,job.runId]); await db.query("UPDATE audit_jobs SET status='failed',completed_at=clock_timestamp(),lease_expires_at=NULL,failure_category=$1 WHERE id=$2",[category,job.id]); }); }
  private async finish(db:PoolClient,job:AuditJob) { const done=await db.query("UPDATE audit_jobs SET status='completed',completed_at=clock_timestamp(),lease_expires_at=NULL WHERE id=$1 AND status='running' AND worker_id=$2 AND attempt=$3 AND lease_expires_at>clock_timestamp()",[job.id,job.workerId,job.attempt]); if(done.rowCount!==1) throw new LeaseLostError(); }
  private async fenced<T>(job:AuditJob,op:(db:PoolClient)=>Promise<T>):Promise<T> { const db=await this.pool.connect(); try { await db.query("BEGIN"); const fence=(await db.query("SELECT job_type,audit_run_id,store_audit_run_id,discovery_store_id FROM audit_jobs WHERE id=$1 AND workspace_id=$2 AND status='running' AND worker_id=$3 AND attempt=$4 AND lease_expires_at>clock_timestamp() FOR UPDATE",[job.id,job.workspaceId,job.workerId,job.attempt])).rows[0]; const target=fence&&(fence.job_type==="quick_audit"?fence.audit_run_id:fence.job_type==="store_audit"?fence.store_audit_run_id:fence.job_type==="catalog_discovery"?fence.discovery_store_id:null); if(!target||fence.job_type!==job.jobType||String(target)!==job.runId) throw new LeaseLostError(); const value=await op(db); await db.query("COMMIT"); return value; } catch(e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); } }
}
async function persistAudit(db:PoolClient,workspaceId:string,runId:string,result:AuditResult,artifact:HostedArtifactMetadata) { const saved={...result,screenshot:undefined}; await db.query("UPDATE audit_runs SET status='completed',completed_at=clock_timestamp(),result_json=$1 WHERE id=$2",[saved,runId]); for(const f of result.findings) await db.query("INSERT INTO findings (id,audit_run_id,workspace_id,rule_id,payload_json) VALUES ($1,$2,$3,$4,$5)",[f.id,runId,workspaceId,f.ruleId,f]); await db.query("INSERT INTO artifacts (id,audit_run_id,workspace_id,kind,content_type,byte_size,sha256,storage_key,status,created_at) VALUES ($1,$2,$3,'screenshot',$4,$5,$6,$7,'available',clock_timestamp())",[artifact.id,runId,workspaceId,artifact.contentType,artifact.byteSize,artifact.sha256,artifact.storageKey]); }
function fromRow(r:Record<string,unknown>):AuditJob { const type=r.job_type as AuditJobType; return {id:String(r.id),workspaceId:String(r.workspace_id),runId:String(type==="quick_audit"?r.audit_run_id:type==="store_audit"?r.store_audit_run_id:r.discovery_store_id),jobType:type,status:r.status as AuditJob["status"],attempt:Number(r.attempt),workerId:r.worker_id?String(r.worker_id):null,leaseExpiresAt:r.lease_expires_at?new Date(String(r.lease_expires_at)).toISOString():null}; }
function assertArtifact(result:AuditResult,artifact:HostedArtifactMetadata) { if(result.screenshot.id!==artifact.id||artifact.contentType!=="image/png"||artifact.byteSize<0||artifact.byteSize>10*1024*1024||!/^[a-f0-9]{64}$/i.test(artifact.sha256)||!/^artifacts\/[0-9a-f-]{36}$/i.test(artifact.storageKey)) throw new Error("Invalid hosted artifact metadata."); }
