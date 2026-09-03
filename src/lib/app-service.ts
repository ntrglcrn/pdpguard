import "server-only";

import path from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthenticatedUser } from "@/domain/saas";
import { executeStoreAudit } from "@/lib/audit-execution";
import { executeCatalogDiscovery } from "@/lib/catalog-discovery";
import {
  AuthorizationError,
  SESSION_COOKIE_NAME,
  WorkspaceService,
} from "@/lib/workspace-service";

let service: WorkspaceService | undefined;

export function getWorkspaceService() {
  return (service ??= new WorkspaceService(
    path.join(process.cwd(), ".runtime", "pdpguard.sqlite"),
  ));
}

export async function getPrincipal(nextPath = "/stores") {
  const service = getWorkspaceService();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect(bootstrapUrl(nextPath));
  try {
    return service.authenticateSession(token);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect(bootstrapUrl(nextPath));
    throw error;
  }
}

export async function getAppContext(nextPath = "/stores") {
  const service = getWorkspaceService();
  const principal = await getPrincipal(nextPath);
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect(bootstrapUrl(nextPath));
  return { workspace };
}

export async function listStoresForApp() {
  const service = getWorkspaceService();
  const principal = await getPrincipal("/stores");
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect(bootstrapUrl("/stores"));
  return { workspace, stores: service.listStores(principal, workspace.id) };
}

export async function getStoreForApp(storeId: string) {
  const service = getWorkspaceService();
  const principal = await getPrincipal(`/stores/${storeId}`);
  try {
    const store = service.getStore(principal, storeId);
    return { store, runs: service.listAuditRuns(principal, store.id) };
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

export async function createStoreForApp(input: { name?: string; url: string }) {
  const service = getWorkspaceService();
  const principal = await getPrincipal("/stores/new");
  const workspace = service.listWorkspaces(principal)[0];
  if (!workspace) redirect(bootstrapUrl("/stores/new"));
  return service.createStore(principal, workspace.id, input);
}

export async function executeAuditForApp(storeId: string, targetUrl: string) {
  const service = getWorkspaceService();
  return executeStoreAudit(
    service,
    await getPrincipal(`/stores/${storeId}/runs/new`),
    storeId,
    targetUrl,
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

function bootstrapUrl(nextPath: string) {
  return `/api/bootstrap?next=${encodeURIComponent(nextPath)}`;
}
