import "server-only";

import path from "node:path";
import { Pool } from "pg";
import { PostgresWorkspaceService } from "@/lib/postgres-workspace-service";
import type { WorkspaceService } from "@/lib/workspace-service";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthenticatedUser, AuditScopeInput } from "@/domain/saas";
import {
  AuthorizationError,
  SESSION_COOKIE_NAME,
} from "@/lib/workspace-contract";
import { hostedRuntimeConfig } from "@/lib/hosted-runtime-config";

let service: WorkspaceService | PostgresWorkspaceService | undefined;

export async function getWorkspaceService() {
  const config = hostedRuntimeConfig();
  if (process.env.NODE_ENV === "production") {
    if (!config) throw new Error("Hosted runtime is unavailable during the build.");
    return (service ??= new PostgresWorkspaceService(new Pool({ connectionString: config.databaseUrl })));
  }
  if (!service) {
    const { WorkspaceService } = await import("@/lib/workspace-service");
    service = new WorkspaceService(path.join(process.cwd(), ".runtime", "pdpguard.sqlite"));
  }
  return service;
}

export async function getPrincipal(nextPath = "/stores") {
  const principal = await getExistingPrincipal();
  if (principal) return principal;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function getExistingPrincipal() {
  const service = await getWorkspaceService();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;
  try {
    return await service.authenticateSession(token);
  } catch (error) {
    if (error instanceof AuthorizationError) return undefined;
    throw error;
  }
}

export async function getAppContext(nextPath = "/stores") {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(nextPath);
  const workspace = (await service.listWorkspaces(principal))[0];
  if (!workspace) redirect("/account/access");
  return { workspace };
}

export async function listStoresForApp() {
  const service = await getWorkspaceService();
  const principal = await getPrincipal("/stores");
  const workspace = (await service.listWorkspaces(principal))[0];
  if (!workspace) redirect("/account/access");
  return { workspace, stores: await service.listStores(principal, workspace.id) };
}

export async function getStoreForApp(storeId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}`);
  try {
    const store = await service.getStore(principal, storeId);
    return {
      store,
      runs: await service.listAuditRuns(principal, store.id),
      storeAuditRuns: await service.listStoreAuditRuns(principal, store.id),
      catalog: await service.getStoreCatalog(principal, store.id),
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getStoreCatalogForApp(storeId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/catalog`);
  try {
    const store = await service.getStore(principal, storeId);
    return { store, catalog: await service.getStoreCatalog(principal, store.id) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getMonitoringForApp(storeId: string, referenceRunId?: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/monitoring`);
  try {
    const store = await service.getStore(principal, storeId);
    const targets = await service.listMonitoringTargets(principal, store.id);
    const target = referenceRunId
      ? targets.find((item) => item.referenceRunId === referenceRunId)
      : targets[0];
    return { store, targets, report: target ? await service.getMonitoringReport(principal, store.id, target.referenceRunId) : null };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getRunForApp(runId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/runs/${runId}`);
  try {
    const run = await service.getAuditRun(principal, runId);
    return { run, store: await service.getStore(principal, run.storeId) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getStoreAuditRunForApp(storeAuditRunId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal("/stores");
  try {
    const run = await service.getStoreAuditRun(principal, storeAuditRunId);
    return { run, store: await service.getStore(principal, run.storeId) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function createStoreForApp(input: { name?: string; url: string }) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal("/stores/new");
  const workspace = (await service.listWorkspaces(principal))[0];
  if (!workspace) redirect("/account/access");
  return service.createStore(principal, workspace.id, input);
}

export async function executeAuditForApp(storeId: string, targetUrl: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/runs/new`);
  if (service instanceof PostgresWorkspaceService)
    return (await service.createAuditRun(principal, storeId, targetUrl)).run;
  if (process.env.NODE_ENV === "production") throw new Error("Local execution is unavailable in production.");
  const { executeQuickAudit } = await import("@/lib/audit-execution");
  return executeQuickAudit(service, principal, storeId, targetUrl);
}

export async function executeStoreAuditForApp(storeId: string, scope: AuditScopeInput = { kind: "all" }) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}`);
  if (service instanceof PostgresWorkspaceService)
    return (await service.createStoreAuditRun(principal, storeId, scope)).run;
  if (process.env.NODE_ENV === "production") throw new Error("Local execution is unavailable in production.");
  const { executeCatalogStoreAudit } = await import("@/lib/audit-execution");
  return executeCatalogStoreAudit(service, principal, storeId, scope);
}

export async function executeMonitoringCheckForApp(storeId: string, referenceRunId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/monitoring`);
  return executeStoreAuditForApp(storeId, await service.monitoringScopeInput(principal, storeId, referenceRunId));
}

export async function discoverCatalogForApp(storeId: string) {
  const service = await getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/catalog`);
  if (service instanceof PostgresWorkspaceService) {
    await service.enqueueCatalogDiscovery(principal, storeId);
    return service.getStoreCatalog(principal, storeId);
  }
  if (process.env.NODE_ENV === "production") throw new Error("Local execution is unavailable in production.");
  const { executeCatalogDiscovery } = await import("@/lib/catalog-discovery");
  return executeCatalogDiscovery(service, principal, storeId);
}

export async function authenticateAppRequest(request: Request): Promise<AuthenticatedUser> {
  return (await getWorkspaceService()).authenticateRequest(request);
}
