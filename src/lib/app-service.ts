import "server-only";

import path from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthenticatedUser, AuditScopeInput } from "@/domain/saas";
import {
  executeCatalogStoreAudit,
  executeQuickAudit,
} from "@/lib/audit-execution";
import { executeCatalogDiscovery } from "@/lib/catalog-discovery";
import {
  AuthorizationError,
  SESSION_COOKIE_NAME,
  WorkspaceService,
} from "@/lib/workspace-service";
import { hostedRuntimeConfig } from "@/lib/hosted-runtime-config";

let service: WorkspaceService | undefined;

export function getWorkspaceService() {
  // Validate before constructing the local adapter. A hosted adapter replaces
  // this local service; production must never open .runtime/pdpguard.sqlite.
  if (hostedRuntimeConfig())
    throw new Error("The Postgres WorkspaceService adapter has not been configured.");
  return (service ??= new WorkspaceService(
    path.join(process.cwd(), ".runtime", "pdpguard.sqlite"),
  ));
}

export async function getPrincipal(nextPath = "/stores") {
  const principal = await getExistingPrincipal();
  if (principal) return principal;
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

export async function getExistingPrincipal() {
  const service = getWorkspaceService();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return undefined;
  try {
    return service.authenticateSession(token);
  } catch (error) {
    if (error instanceof AuthorizationError) return undefined;
    throw error;
  }
}

export async function getAppContext(nextPath = "/stores") {
  const service = getWorkspaceService();
  const principal = await getPrincipal(nextPath);
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect("/account/access");
  return { workspace };
}

export async function listStoresForApp() {
  const service = getWorkspaceService();
  const principal = await getPrincipal("/stores");
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect("/account/access");
  return { workspace, stores: service.listStores(principal, workspace.id) };
}

export async function getStoreForApp(storeId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}`);
  try {
    const store = service.getStore(principal, storeId);
    return {
      store,
      runs: service.listAuditRuns(principal, store.id),
      storeAuditRuns: service.listStoreAuditRuns(principal, store.id),
      catalog: service.getStoreCatalog(principal, store.id),
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getStoreCatalogForApp(storeId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/catalog`);
  try {
    const store = service.getStore(principal, storeId);
    return { store, catalog: service.getStoreCatalog(principal, store.id) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getMonitoringForApp(storeId: string, referenceRunId?: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/monitoring`);
  try {
    const store = service.getStore(principal, storeId);
    const targets = service.listMonitoringTargets(principal, store.id);
    const target = referenceRunId
      ? targets.find((item) => item.referenceRunId === referenceRunId)
      : targets[0];
    return { store, targets, report: target ? service.getMonitoringReport(principal, store.id, target.referenceRunId) : null };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getRunForApp(runId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/runs/${runId}`);
  try {
    const run = service.getAuditRun(principal, runId);
    return { run, store: service.getStore(principal, run.storeId) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function getStoreAuditRunForApp(storeAuditRunId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal("/stores");
  try {
    const run = service.getStoreAuditRun(principal, storeAuditRunId);
    return { run, store: service.getStore(principal, run.storeId) };
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function createStoreForApp(input: { name?: string; url: string }) {
  const service = getWorkspaceService();
  const principal = await getPrincipal("/stores/new");
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect("/account/access");
  return service.createStore(principal, workspace.id, input);
}

export async function executeAuditForApp(storeId: string, targetUrl: string) {
  const service = getWorkspaceService();
  return executeQuickAudit(
    service,
    await getPrincipal(`/stores/${storeId}/runs/new`),
    storeId,
    targetUrl,
  );
}

export async function executeStoreAuditForApp(storeId: string, scope: AuditScopeInput = { kind: "all" }) {
  const service = getWorkspaceService();
  return executeCatalogStoreAudit(
    service,
    await getPrincipal(`/stores/${storeId}`),
    storeId,
    scope,
  );
}

export async function executeMonitoringCheckForApp(storeId: string, referenceRunId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}/monitoring?run=${encodeURIComponent(referenceRunId)}`);
  return executeCatalogStoreAudit(
    service,
    principal,
    storeId,
    service.monitoringScopeInput(principal, storeId, referenceRunId),
  );
}

export async function discoverCatalogForApp(storeId: string) {
  const service = getWorkspaceService();
  return executeCatalogDiscovery(
    service,
    await getPrincipal(`/stores/${storeId}/catalog`),
    storeId,
  );
}

export function authenticateAppRequest(request: Request): AuthenticatedUser {
  return getWorkspaceService().authenticateRequest(request);
}
