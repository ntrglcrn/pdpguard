"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  createStoreAuditAction,
  type CatalogActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

export function StoreAuditForm({
  storeId,
  activePdpCount,
}: {
  storeId: string;
  activePdpCount: number;
}) {
  const [state, action, pending] = useActionState(
    createStoreAuditAction.bind(null, storeId),
    {} as CatalogActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="space-y-2">
      <Button type="submit" size="lg" disabled={pending || !activePdpCount}>
        <ShieldCheck data-icon="inline-start" aria-hidden="true" />
        {pending ? "Auditing PDPs…" : "Run Store Audit"}
      </Button>
      <p className="max-w-sm text-xs text-muted-foreground">
        Automatic bounded v1 selection: up to 5 active catalog PDPs, audited
        serially.
      </p>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Running the persisted selection. Keep this tab open.
        </p>
      )}
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
