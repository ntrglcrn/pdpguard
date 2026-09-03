import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogDiscoveryForm } from "@/components/catalog-discovery-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CatalogDiscoveryStatus } from "@/domain/saas";
import { getStoreCatalogForApp } from "@/lib/app-service";

const statusVariant = {
  not_started: "secondary",
  running: "secondary",
  succeeded: "passed",
  failed: "destructive",
} as const;

const statusLabel: Record<CatalogDiscoveryStatus, string> = {
  not_started: "Not discovered",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

export default async function StoreCatalogPage({
  params,
}: PageProps<"/stores/[storeId]/catalog">) {
  const { storeId } = await params;
  const data = await getStoreCatalogForApp(storeId);
  if (!data) notFound();
  const { store, catalog } = data;
  const activeItems = catalog.items.filter((item) => item.active);
  const inactiveItems = catalog.items.filter((item) => !item.active);
  const hasRun = catalog.discovery.status !== "not_started";

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
        <Link
          href={`/stores/${store.id}`}
          className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {store.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">Catalog</span>
      </nav>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {store.name}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Store catalog
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            A bounded inventory of product pages discovered from the store root
            page.
          </p>
        </div>
        <CatalogDiscoveryForm storeId={store.id} hasRun={hasRun} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Discovery status</CardTitle>
            <Badge variant={statusVariant[catalog.discovery.status]}>
              {statusLabel[catalog.discovery.status]}
            </Badge>
          </div>
          <CardDescription>
            {catalog.discovery.completedAt ? (
              <>
                Last attempt{" "}
                <time dateTime={catalog.discovery.completedAt}>
                  {new Date(catalog.discovery.completedAt).toLocaleString()}
                </time>
              </>
            ) : catalog.discovery.status === "running" ? (
              "Discovery is in progress."
            ) : (
              "This store has not been scanned for product links."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>{activeItems.length} active PDPs</span>
          {inactiveItems.length > 0 && (
            <span className="text-muted-foreground">
              {inactiveItems.length} no longer seen
            </span>
          )}
          {catalog.discovery.rejectedCount > 0 && (
            <span className="text-muted-foreground">
              {catalog.discovery.rejectedCount} unsafe or off-origin links
              rejected
            </span>
          )}
        </CardContent>
      </Card>

      {catalog.discovery.status === "failed" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Discovery failed</CardTitle>
            <CardDescription>
              {catalog.discovery.failureCategory === "unsafe_url"
                ? "The store redirected outside its registered origin or attempted an unsafe navigation."
                : catalog.discovery.failureCategory === "timeout"
                  ? "The store did not finish loading within the discovery limit."
                  : "The store root page could not be loaded. Existing catalog entries were preserved."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <section aria-labelledby="catalog-items-title" className="space-y-4">
        <div>
          <h2
            id="catalog-items-title"
            className="font-heading text-xl font-semibold"
          >
            Product pages
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Exact normalized URLs are kept as separate catalog entries.
          </p>
        </div>

        {catalog.items.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {catalog.items.map((item) => (
              <article key={item.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.active ? "passed" : "secondary"}>
                    {item.active ? "Active" : "Not seen"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Root page link
                  </span>
                </div>
                <a
                  href={item.normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-start gap-1 break-words font-mono text-xs underline-offset-4 hover:underline [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {item.normalizedUrl}
                  <ExternalLink
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden="true"
                  />
                </a>
                <p className="text-xs text-muted-foreground">
                  First seen{" "}
                  <time dateTime={item.firstSeenAt}>
                    {new Date(item.firstSeenAt).toLocaleString()}
                  </time>
                  {" · "}Last seen{" "}
                  <time dateTime={item.lastSeenAt}>
                    {new Date(item.lastSeenAt).toLocaleString()}
                  </time>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>
                {catalog.discovery.status === "succeeded"
                  ? "No product pages found"
                  : "Catalog is empty"}
              </CardTitle>
              <CardDescription>
                {catalog.discovery.status === "succeeded"
                  ? "Discovery completed, but the store root page did not expose matching same-origin product links."
                  : "Run discovery to find product links without entering PDP URLs one by one."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    </div>
  );
}
