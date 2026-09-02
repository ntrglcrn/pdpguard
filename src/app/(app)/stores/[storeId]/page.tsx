import { ExternalLink, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunList } from "@/components/run-list";
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
  const { store, runs } = data;

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
        <Button asChild>
          <Link href={`/stores/${store.id}/runs/new`}>
            <Play data-icon="inline-start" aria-hidden="true" /> Run audit
          </Link>
        </Button>
      </div>

      <section aria-labelledby="runs-title" className="space-y-4">
        <div>
          <h2 id="runs-title" className="font-heading text-xl font-semibold">
            Recent runs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Persisted audit history for this store.
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
