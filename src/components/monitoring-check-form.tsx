"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { createMonitoringCheckAction, type CatalogActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MonitoringCheckForm({
  storeId,
  referenceRunId,
  disabled,
}: {
  storeId: string;
  referenceRunId: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    createMonitoringCheckAction.bind(null, storeId, referenceRunId),
    {} as CatalogActionState,
  );
  return (
    <form action={action} className="space-y-2" aria-busy={pending}>
      <Button type="submit" size="lg" disabled={disabled || pending}>
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        {pending ? "Running check…" : "Run check"}
      </Button>
      {disabled && <p className="text-xs text-muted-foreground">This category is no longer active in the catalog.</p>}
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
    </form>
  );
}
