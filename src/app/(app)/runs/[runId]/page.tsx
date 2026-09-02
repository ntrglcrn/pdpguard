/* eslint-disable @next/next/no-img-element */

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FindingsList } from "@/components/findings-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRunForApp } from "@/lib/app-service";

const statusVariant = {
  queued: "secondary",
  running: "secondary",
  completed: "outline",
  failed: "destructive",
  cancelled: "secondary",
} as const;

export default async function RunPage({ params }: PageProps<"/runs/[runId]">) {
  const { runId } = await params;
  const data = await getRunForApp(runId);
  if (!data) notFound();
  const { run, store } = data;
  const result = run.result;
  const artifact = run.artifacts[0];

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
        <span className="text-foreground">Run</span>
      </nav>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant[run.status]} className="capitalize">
            {run.status}
          </Badge>
          {result && (
            <Badge variant={result.summary.status}>
              {result.summary.status}
            </Badge>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Audit run
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            {result?.pageTitle || "Product page audit"}
          </h1>
          <a
            href={result?.finalUrl ?? run.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex max-w-full items-center gap-1 break-words font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {result?.finalUrl ?? run.targetUrl}{" "}
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </header>

      {run.status === "failed" && (
        <Card>
          <CardHeader>
            <CardTitle>Audit could not be completed</CardTitle>
            <CardDescription>
              {run.failureCategory === "timeout"
                ? "The page did not finish within the audit time limit."
                : run.failureCategory === "unsafe_url"
                  ? "The target was rejected by the URL safety checks."
                  : "The browser or page failed while the audit was running."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/stores/${store.id}/runs/new`}>
                Try another page
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {(run.status === "queued" || run.status === "running") && (
        <Card>
          <CardHeader>
            <CardTitle>Audit in progress</CardTitle>
            <CardDescription>
              The saved run has not completed yet. Refresh this page to check
              again.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {run.status === "cancelled" && (
        <Card>
          <CardHeader>
            <CardTitle>Audit cancelled</CardTitle>
            <CardDescription>
              This run stopped before results were recorded.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {result && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground">
                Critical
              </dt>
              <dd className="mt-2 font-heading text-2xl font-semibold text-severity-critical">
                {result.summary.counts.critical}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground">
                Warnings
              </dt>
              <dd className="mt-2 font-heading text-2xl font-semibold text-severity-warning">
                {result.summary.counts.warning}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground">
                Passed
              </dt>
              <dd className="mt-2 font-heading text-2xl font-semibold text-passed">
                {result.summary.counts.passed}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <dt className="text-xs font-medium text-muted-foreground">
                Duration
              </dt>
              <dd className="mt-2 font-heading text-2xl font-semibold">
                {(result.durationMs / 1_000).toFixed(1)}s
              </dd>
            </div>
          </dl>

          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <FindingsList findings={run.findings} />
            <aside
              aria-labelledby="evidence-title"
              className="space-y-4 xl:sticky xl:top-24"
            >
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Evidence
                </p>
                <h2
                  id="evidence-title"
                  className="mt-1 font-heading text-xl font-semibold"
                >
                  Full-page screenshot
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Captured at {result.metadata.viewport.width} ×{" "}
                  {result.metadata.viewport.height}px.
                </p>
              </div>
              {artifact ? (
                <>
                  <div className="max-h-[42rem] overflow-y-auto rounded-xl border border-border bg-muted p-2">
                    <img
                      src={`/api/artifacts/${artifact.id}`}
                      alt={`Mobile screenshot of ${result.pageTitle || result.finalUrl}`}
                      className="h-auto w-full rounded-lg"
                    />
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <a
                      href={`/api/artifacts/${artifact.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open full screenshot{" "}
                      <ExternalLink data-icon="inline-end" aria-hidden="true" />
                    </a>
                  </Button>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No screenshot artifact was recorded for this run.
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
