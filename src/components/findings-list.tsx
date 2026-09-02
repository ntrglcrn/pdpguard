"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StoredFinding } from "@/domain/saas";

type Filter = "all" | "critical" | "warning" | "passed";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warnings" },
  { id: "passed", label: "Passed" },
];

export function FindingsList({ findings }: { findings: StoredFinding[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => {
    if (filter === "all") return findings;
    if (filter === "passed")
      return findings.filter((finding) => finding.status === "passed");
    return findings.filter(
      (finding) => finding.status === "failed" && finding.severity === filter,
    );
  }, [filter, findings]);

  return (
    <section aria-labelledby="findings-title" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="findings-title"
            className="font-heading text-xl font-semibold"
          >
            Findings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic checks with evidence and next steps.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Filter findings"
        >
          {filters.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? "secondary" : "ghost"}
              className={
                filter === item.id ? "border border-border font-semibold" : undefined
              }
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {visible.length} findings shown.
      </p>
      {visible.length ? (
        <div className="divide-y divide-border border-y border-border">
          {visible.map((finding) => {
            const tone =
              finding.status === "passed" ? "passed" : finding.severity;
            return (
              <article key={finding.id} className="py-6 first:pt-5 last:pb-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Badge variant={tone} className="capitalize">
                    {finding.status === "passed" ? "Passed" : finding.severity}
                  </Badge>
                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <h3 className="font-heading text-base font-semibold">
                        {finding.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {finding.description}
                      </p>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Evidence
                        </h4>
                        {finding.evidence.length ? (
                          <ul className="mt-2 space-y-2">
                            {finding.evidence.map((item) => (
                              <li
                                key={item}
                                className="break-words rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-5 [overflow-wrap:anywhere]"
                              >
                                {item}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No additional evidence recorded.
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          Recommendation
                        </h4>
                        <p className="mt-2 text-sm leading-6">
                          {finding.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No findings match this filter.
        </div>
      )}
    </section>
  );
}
