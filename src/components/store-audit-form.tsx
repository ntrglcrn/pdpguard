"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";

import { createStoreAuditAction, type CatalogActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function StoreAuditForm({
  storeId,
  matchingPdpCount,
  activePdpCount,
  scope = "all",
  categoryId,
}: {
  storeId: string;
  matchingPdpCount?: number;
  /** @deprecated Catalog callers should pass the scoped matching count. */
  activePdpCount?: number;
  scope?: "all" | "uncategorized" | "category";
  categoryId?: string;
}) {
  const matchingCount = matchingPdpCount ?? activePdpCount ?? 0;
  const [state, action, pending] = useActionState(
    createStoreAuditAction.bind(null, storeId),
    {} as CatalogActionState,
  );

  return (
    <form action={action} aria-busy={pending} className="space-y-2">
      <input type="hidden" name="scope" value={scope} />
      {categoryId && (
        <input type="hidden" name="categoryId" value={categoryId} />
      )}
      <Button type="submit" size="lg" disabled={pending || !matchingCount}>
        <ShieldCheck data-icon="inline-start" aria-hidden="true" />
        {pending ? "Auditing PDPs…" : "Run Store Audit"}
      </Button>
      <p className="max-w-sm text-xs text-muted-foreground">
        {matchingCount} matching PDP{matchingCount === 1 ? "" : "s"}; up to 5
        are selected deterministically and audited serially.
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
