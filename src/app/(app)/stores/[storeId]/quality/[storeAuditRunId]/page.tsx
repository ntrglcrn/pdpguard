import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoreAuditRunForApp } from "@/lib/app-service";

export default async function StoreAuditRunPage({
  params,
}: PageProps<"/stores/[storeId]/quality/[storeAuditRunId]">) {
  const { storeId, storeAuditRunId } = await params;
  const data = await getStoreAuditRunForApp(storeAuditRunId);
  if (!data || data.store.id !== storeId) notFound();
  const { run, store } = data;

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/stores" className="hover:text-foreground">
          Stores
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/stores/${store.id}`} className="hover:text-foreground">
          {store.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">Store Audit</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={run.status === "failed" ? "destructive" : "outline"}>
            {run.status.replaceAll("_", " ")}
          </Badge>
          <Badge variant="secondary">Automatic bounded v1</Badge>
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Store quality audit
        </h1>
        <p className="text-sm text-muted-foreground">
          Scope: {scopeLabel(run)} · {run.scope.matchingPdpCount} matching ·{" "}
          {run.scope.selectedCatalogItemIds.length || run.selectedPdpCount}{" "}
          selected
          {" · "}
          {run.completedPdpCount} completed
          {run.failedPdpCount ? ` · ${run.failedPdpCount} failed` : ""}
        </p>
      </header>

      {run.status === "running" && (
        <Card>
          <CardHeader>
            <CardTitle>Auditing PDPs</CardTitle>
            <CardDescription>
              Persisted progress: {run.completedPdpCount + run.failedPdpCount} /{" "}
              {run.selectedPdpCount} processed. Refresh to check again.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {run.status === "failed" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Store Audit failed</CardTitle>
            <CardDescription>
              No selected PDP produced a persisted audit result. Individual
              infrastructure failures remain separate from product issues.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <section aria-labelledby="issues-title" className="space-y-4">
        <div>
          <h2 id="issues-title" className="font-heading text-xl font-semibold">
            Issues
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Failed findings grouped only by stable rule ID.
          </p>
        </div>
        {run.issues.length ? (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {run.issues.map((issue) => (
              <article key={issue.ruleId} className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={issue.severity}>{issue.severity}</Badge>
                  {issue.lifecycle && (
                    <Badge variant="secondary" className="capitalize">
                      {issue.lifecycle}
                    </Badge>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {issue.ruleId}
                  </span>
                </div>
                <div>
                  <h3 className="font-heading font-semibold">{issue.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Affected: {issue.affectedPdpCount} / {issue.auditedPdpCount}{" "}
                    audited PDPs
                  </p>
                </div>
                <ul className="space-y-2">
                  {issue.affectedPdps.map((pdp) => (
                    <li
                      key={`${issue.ruleId}-${pdp.auditRunId}`}
                      className="flex flex-col gap-2 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 break-words font-mono text-xs [overflow-wrap:anywhere]">
                        {pdp.pageTitle || pdp.normalizedUrl}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="self-start sm:self-auto"
                      >
                        <Link href={`/runs/${pdp.auditRunId}`}>
                          Finding &amp; evidence
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No product issues found</CardTitle>
              <CardDescription>
                {run.status === "completed"
                  ? "All deterministic checks passed for this bounded selection."
                  : "No completed PDP produced a failed finding."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section aria-labelledby="pdps-title" className="space-y-4">
        <h2 id="pdps-title" className="font-heading text-xl font-semibold">
          Selected PDPs
        </h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {run.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-mono text-xs [overflow-wrap:anywhere]">
                  {item.normalizedUrl}
                </p>
                {item.failureCategory && (
                  <p className="mt-1 text-xs text-destructive">
                    Failed: {item.failureCategory}
                  </p>
                )}
              </div>
              {item.auditRunId && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="self-start sm:self-auto"
                >
                  <Link href={`/runs/${item.auditRunId}`}>View PDP run</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
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
