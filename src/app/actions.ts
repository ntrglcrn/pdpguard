"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { AuditBusyError } from "@/lib/audit-execution";
import { createStoreForApp, executeAuditForApp } from "@/lib/app-service";
import { UnsafeUrlError } from "@/lib/url-safety";

export interface FormActionState {
  error?: string;
  fieldErrors?: { name?: string; url?: string; targetUrl?: string };
  values?: { name?: string; url?: string; targetUrl?: string };
}

export async function createStoreAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const url = text(formData, "url");
  const name = text(formData, "name");
  if (!url) return { fieldErrors: { url: "Enter a store URL." }, values: { name, url } };
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
    return { error: "The store could not be added. Try again.", values: { name, url } };
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
    return { fieldErrors: { targetUrl: "Enter a product page URL." }, values: { targetUrl } };

  let run;
  try {
    run = await executeAuditForApp(storeId, targetUrl);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UnsafeUrlError)
      return { fieldErrors: { targetUrl: error.message }, values: { targetUrl } };
    if (error instanceof AuditBusyError) return { error: error.message, values: { targetUrl } };
    return { error: "The audit could not be started. Try again.", values: { targetUrl } };
  }

  revalidatePath(`/stores/${storeId}`);
  redirect(`/runs/${run.id}`);
}

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
