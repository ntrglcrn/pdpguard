"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";

import { AuditBusyError } from "@/lib/workspace-contract";
import {
  createStoreForApp,
  discoverCatalogForApp,
  executeAuditForApp,
  executeMonitoringCheckForApp,
  executeStoreAuditForApp,
} from "@/lib/app-service";
import { CatalogDiscoveryBusyError } from "@/lib/workspace-contract";
import { UnsafeUrlError } from "@/lib/url-safety";
import { EmptyStoreCatalogError } from "@/lib/workspace-contract";
import { CoverageInputError } from "@/lib/store-coverage";
import { getPrincipal, getWorkspaceService } from "@/lib/app-service";
import { authProviderConfigured, signOut } from "../../auth";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-contract";

export async function logoutAction() {
  await (await getWorkspaceService()).revokeSession(await getPrincipal("/login"));
  if (authProviderConfigured()) await signOut({ redirectTo: "/login" });
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export interface FormActionState {
  error?: string;
  fieldErrors?: { name?: string; url?: string; targetUrl?: string };
  values?: { name?: string; url?: string; targetUrl?: string };
}

export interface CatalogActionState {
  error?: string;
}

export async function createStoreAuditAction(
  storeId: string,
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  void _previousState;
  const scope = text(formData, "scope");
  const categoryIds = formData.getAll("categoryId").map(String);
  const coverage = text(formData, "coverage");
  const auditScope =
    scope === "coverage"
      ? { kind: "coverage" as const, categoryIds, includeUncategorized: formData.get("includeUncategorized") === "1", requestedCoverage: coverage === "all" ? "all" as const : Number(coverage) }
      : { kind: "all" as const, requestedCoverage: coverage === "all" ? "all" as const : Number(coverage) };
  let run;
  try {
    run = await executeStoreAuditForApp(storeId, auditScope);
  } catch (error) {
    unstable_rethrow(error);
    if (
      error instanceof AuditBusyError || error instanceof CoverageInputError ||
      error instanceof EmptyStoreCatalogError
    )
      return { error: error.message };
    return { error: "The Store Audit could not be completed. Try again." };
  }
  revalidatePath(`/stores/${storeId}`);
  redirect(`/stores/${storeId}/quality/${run.id}`);
}

export async function createMonitoringCheckAction(
  storeId: string,
  referenceRunId: string,
  _previousState: CatalogActionState,
): Promise<CatalogActionState> {
  void _previousState;
  try {
    const run = await executeMonitoringCheckForApp(storeId, referenceRunId);
    revalidatePath(`/stores/${storeId}/monitoring`);
    redirect(`/stores/${storeId}/monitoring?run=${encodeURIComponent(run.id)}${run.status === "queued" || run.status === "running" ? "" : `&completedRun=${encodeURIComponent(run.id)}`}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuditBusyError || error instanceof EmptyStoreCatalogError)
      return { error: error.message };
    return { error: "The check could not be completed. Try again." };
  }
}

export async function createStoreAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const url = text(formData, "url");
  const name = text(formData, "name");
  if (!url)
    return {
      fieldErrors: { url: "Enter a store URL." },
      values: { name, url },
    };
  if (name.length > 120)
    return {
      fieldErrors: { name: "Name must be 120 characters or fewer." },
      values: { name, url },
    };

  let store;
  try {
    store = await createStoreForApp({ name, url });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UnsafeUrlError)
      return { fieldErrors: { url: error.message }, values: { name, url } };
    return {
      error: "The store could not be added. Try again.",
      values: { name, url },
    };
  }

  revalidatePath("/stores");
  redirect(`/stores/${store.id}`);
}

export async function createRunAction(
  storeId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const targetUrl = text(formData, "targetUrl");
  if (!targetUrl)
    return {
      fieldErrors: { targetUrl: "Enter a product page URL." },
      values: { targetUrl },
    };

  let run;
  try {
    run = await executeAuditForApp(storeId, targetUrl);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UnsafeUrlError)
      return {
        fieldErrors: { targetUrl: error.message },
        values: { targetUrl },
      };
    if (error instanceof AuditBusyError)
      return { error: error.message, values: { targetUrl } };
    return {
      error: "The audit could not be started. Try again.",
      values: { targetUrl },
    };
  }

  revalidatePath(`/stores/${storeId}`);
  redirect(`/runs/${run.id}`);
}

export async function discoverCatalogAction(
  storeId: string,
  _previousState: CatalogActionState,
): Promise<CatalogActionState> {
  void _previousState;
  try {
    const catalog = await discoverCatalogForApp(storeId);
    revalidatePath(`/stores/${storeId}`);
    revalidatePath(`/stores/${storeId}/catalog`);
    if (catalog.discovery.status === "failed")
      return {
        error:
          catalog.discovery.failureCategory === "unsafe_url"
            ? "Discovery stopped because the store navigation was unsafe."
            : catalog.discovery.failureCategory === "timeout"
              ? "Discovery timed out. Try again."
              : "Discovery could not load the store. Try again.",
      };
    return {};
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof CatalogDiscoveryBusyError)
      return { error: error.message };
    return { error: "Discovery could not be started. Try again." };
  }
}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
