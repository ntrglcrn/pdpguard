import { Activity, ExternalLink, Search, Zap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunList } from "@/components/run-list";
import { StoreAuditForm } from "@/components/store-audit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoreForApp } from "@/lib/app-service";

export default async function StorePage({
  params,
}: PageProps<"/stores/[storeId]">) {
  const { storeId } = await params;
  const data = await getStoreForApp(storeId);
  if (!data) notFound();
  const { store, runs, storeAuditRuns, catalog } = data;
  const activePdpCount = catalog.items.filter((item) => item.active).length;

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link
          href="/stores"
          className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Stores
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{store.name}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Store
          </p>
          <h1 className="mt-2 truncate font-heading text-3xl font-semibold tracking-tight">
            {store.name}
          </h1>
          <a
            href={store.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex max-w-full items-center gap-1 break-words font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {store.url}{" "}
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/stores/${store.id}/catalog`}>
              <Search data-icon="inline-start" aria-hidden="true" /> Catalog
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/stores/${store.id}/monitoring`}>
              <Activity data-icon="inline-start" aria-hidden="true" /> Monitoring
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/stores/${store.id}/runs/new`}>
              <Zap data-icon="inline-start" aria-hidden="true" /> Quick audit
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="quality-title" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="quality-title"
              className="font-heading text-xl font-semibold"
            >
              Quality / Audits
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Store-level issues across a persisted catalog selection.
            </p>
          </div>
          <StoreAuditForm storeId={store.id} activePdpCount={activePdpCount} />
        </div>
        {!activePdpCount ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No active catalog PDPs</CardTitle>
              <CardDescription>
                Discover the catalog before running a Store Audit. No manual URL
                entry is needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={`/stores/${store.id}/catalog`}>
                  Discover catalog
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : storeAuditRuns.length ? (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {storeAuditRuns.map((run) => (
              <article
                key={run.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        run.status === "failed" ? "destructive" : "outline"
                      }
                      className="capitalize"
                    >
                      {run.status.replaceAll("_", " ")}
                    </Badge>
                    <span className="text-sm">
                      {run.completedPdpCount} / {run.selectedPdpCount} PDPs
                      completed
                    </span>
                    {run.failedPdpCount > 0 && (
                      <span className="text-sm text-destructive">
                        {run.failedPdpCount} failed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {run.summary?.issueCount ?? 0} issues · {scopeLabel(run)} ·{" "}
                    {run.scope.matchingPdpCount} matching ·{" "}
                    {run.scope.selectedCatalogItemIds.length ||
                      run.selectedPdpCount}{" "}
                    selected
                    {" · "}
                    <time dateTime={run.startedAt}>
                      {new Date(run.startedAt).toLocaleString()}
                    </time>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  asChild
                  className="self-start sm:self-auto"
                >
                  <Link href={`/stores/${store.id}/quality/${run.id}`}>
                    View report
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Store Audits yet</CardTitle>
              <CardDescription>
                Run the existing deterministic PDP checks across up to 5 active
                catalog pages.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section aria-labelledby="runs-title" className="space-y-4">
        <div>
          <h2 id="runs-title" className="font-heading text-xl font-semibold">
            Quick Audit runs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Persisted single-page audit history for this store.
          </p>
        </div>
        {runs.length ? (
          <RunList runs={runs} />
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No audits yet</CardTitle>
              <CardDescription>
                Run the first product page audit for this store.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={`/stores/${store.id}/runs/new`}>
                  Run first audit
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function scopeLabel(run: {
  scope: {
    kind: "all" | "category" | "uncategorized";
    categoryName: string | null;
  };
}) {
  return run.scope.kind === "category"
    ? (run.scope.categoryName ?? "Category")
    : run.scope.kind === "uncategorized"
      ? "Uncategorized"
      : "All products";
}
