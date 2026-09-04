"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { createMonitoringCheckAction, type CatalogActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MonitoringCheckForm({
  storeId,
  referenceRunId,
  disabled,
  scopeLabel,
  selectedPdpCount,
}: {
  storeId: string;
  referenceRunId: string;
  disabled: boolean;
  scopeLabel: string;
  selectedPdpCount: number;
}) {
  const [state, action, pending] = useActionState(
    createMonitoringCheckAction.bind(null, storeId, referenceRunId),
    {} as CatalogActionState,
  );
  return (
    <form action={action} className="space-y-2" aria-busy={pending}>
      <Button type="submit" size="lg" disabled={disabled || pending}>
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        {pending ? "Checking…" : "Run check"}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Checking {scopeLabel}. Up to {selectedPdpCount} PDPs are selected; keep this tab open.
        </p>
      )}
      {disabled && <p className="text-xs text-muted-foreground">This category is no longer active in the catalog.</p>}
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
    </form>
  );
}
