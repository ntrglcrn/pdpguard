import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditRun } from "@/domain/saas";

const statusVariant = {
  queued: "secondary",
  running: "secondary",
  completed: "outline",
  failed: "destructive",
  cancelled: "secondary",
} as const;

export function RunList({ runs }: { runs: AuditRun[] }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {runs.map((run) => (
        <article
          key={run.id}
          className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
              {run.result && (
                <Badge variant={run.result.summary.status}>
                  {run.result.summary.status}
                </Badge>
              )}
            </div>
            <p className="break-words font-mono text-xs [overflow-wrap:anywhere]">
              {run.targetUrl}
            </p>
            <p className="text-xs text-muted-foreground">
              <time dateTime={run.createdAt}>
                {new Date(run.createdAt).toLocaleString()}
              </time>
              {run.result
                ? ` · ${(run.result.durationMs / 1_000).toFixed(1)}s`
                : ""}
            </p>
          </div>
          <Button variant="ghost" asChild className="self-start sm:self-auto">
            <Link
              href={`/runs/${run.id}`}
              aria-label={`View audit run for ${run.targetUrl} created ${new Date(run.createdAt).toLocaleString()}`}
            >
              View run <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </article>
      ))}
    </div>
  );
}
