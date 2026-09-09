"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createStoreAuditAction, type CatalogActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function StoreAuditForm({ storeId, activePdpCount, uncategorizedPdpCount = 0, categories = [] }: { storeId: string; activePdpCount: number; uncategorizedPdpCount?: number; categories?: Array<{ id: string; name: string; activePdpCount: number }> }) {
  const [state, action, pending] = useActionState(createStoreAuditAction.bind(null, storeId), {} as CatalogActionState);
  const [scope, setScope] = useState("all");
  const [coverage, setCoverage] = useState("10");
  const selectedCount = Math.min(coverage === "all" ? 25 : Number(coverage), activePdpCount);
  return <form action={action} aria-busy={pending} className="space-y-4 rounded-xl border border-border p-4">
    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="audit-scope">Scope</label><select id="audit-scope" name="scope" value={scope} onChange={(event) => setScope(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="all">All active products</option><option value="coverage">Selected categories</option></select></div>
    {!!categories.length && <fieldset className="space-y-2"><legend className="text-sm font-medium">Categories</legend>{categories.map((category) => <label key={category.id} className="flex items-center justify-between gap-3 text-sm"><span><input className="mr-2" type="checkbox" name="categoryId" value={category.id} />{category.name}</span><span className="text-muted-foreground">{category.activePdpCount}</span></label>)}<label className="flex items-center justify-between gap-3 text-sm"><span><input className="mr-2" type="checkbox" name="includeUncategorized" value="1" />Uncategorized</span><span className="text-muted-foreground">{uncategorizedPdpCount}</span></label></fieldset>}
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Coverage</legend><div className="flex flex-wrap gap-3 text-sm"><label><input className="mr-1" type="radio" name="coverage" value="10" checked={coverage === "10"} onChange={(event) => setCoverage(event.target.value)} />10</label><label><input className="mr-1" type="radio" name="coverage" value="25" checked={coverage === "25"} onChange={(event) => setCoverage(event.target.value)} />25</label><label><input className="mr-1" type="radio" name="coverage" value="all" checked={coverage === "all"} onChange={(event) => setCoverage(event.target.value)} />All matching (bounded)</label></div></fieldset>
    <Button type="submit" size="lg" disabled={pending || !activePdpCount}><ShieldCheck data-icon="inline-start" aria-hidden="true" />{pending ? "Starting Store Audit…" : "Run Store Audit"}</Button>
    <p className="max-w-md text-xs text-muted-foreground">Matching PDPs: {scope === "all" ? activePdpCount : "recalculated by the server at start"}. Selected PDPs: {scope === "all" ? selectedCount : "up to the requested coverage"}. Safety limit: 25.</p>
    {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
  </form>;
}
