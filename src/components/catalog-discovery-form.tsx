"use client";

import { useActionState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { discoverCatalogAction, type CatalogActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

const initialState: CatalogActionState = {};

export function CatalogDiscoveryForm({
  storeId,
  hasRun,
}: {
  storeId: string;
  hasRun: boolean;
}) {
  const [state, action, pending] = useActionState(
    discoverCatalogAction.bind(null, storeId),
    initialState,
  );

  return (
    <form action={action} aria-busy={pending} className="space-y-3">
      <Button type="submit" disabled={pending}>
        {hasRun ? (
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Search data-icon="inline-start" aria-hidden="true" />
        )}
        {pending
          ? "Discovering products…"
          : hasRun
            ? "Refresh catalog"
            : "Discover products"}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Checking the store root page for product links. Keep this tab open.
        </p>
      )}
      {state.error && (
        <p
          className="rounded-lg bg-[var(--destructive-soft)] p-3 text-sm text-destructive"
          role="alert"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
