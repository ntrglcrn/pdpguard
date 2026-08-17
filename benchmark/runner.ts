import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page, type Response } from "playwright";
import { z } from "zod";

import type { Finding } from "@/domain/audit";
import { runAddToCartInteraction } from "@/lib/audit/add-to-cart";
import { runAuditRules } from "@/lib/audit/rules";

export const benchmarkRuleIds = [
  "page-availability",
  "page-title",
  "product-image",
  "broken-images",
  "product-price",
  "purchase-cta",
  "structured-product-data",
  "add-to-cart-interaction",
] as const;

const expectedFindingSchema = z.object({
  ruleId: z.enum(benchmarkRuleIds),
  status: z.enum(["passed", "failed"]),
  severity: z.enum(["critical", "warning", "info"]),
});

const benchmarkCaseSchema = z
  .object({
    id: z.string().regex(/^PDP-[A-Z]+-\d{3}$/),
    title: z.string().min(1),
    kind: z.enum(["known-defect", "negative-control"]),
    source: z.object({
      type: z.enum(["github-issue", "public-pdp"]),
      url: z.string().url(),
      capturedAt: z.iso.date(),
    }),
    platform: z.string().min(1),
    pageType: z.literal("pdp"),
    stability: z.enum(["deterministic", "live"]),
    fixture: z
      .object({
        path: z.string().min(1),
        httpStatus: z.number().int().min(100).max(599).optional(),
        interaction: z.boolean().optional(),
      })
      .optional(),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    expected: z.object({
      supported: z.boolean(),
      findings: z.array(expectedFindingSchema),
    }),
    businessImpact: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
    notes: z.string().min(1),
    unsupportedReason: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.expected.supported && !value.fixture) {
      context.addIssue({
        code: "custom",
        path: ["fixture"],
        message: "Supported cases require a local fixture.",
      });
    }
    if (!value.expected.supported && !value.unsupportedReason) {
      context.addIssue({
        code: "custom",
        path: ["unsupportedReason"],
        message: "Unsupported cases require a reason.",
      });
    }
  });

export const benchmarkManifestSchema = z.object({
  version: z.literal(1),
  cases: z.array(benchmarkCaseSchema).min(1),
});

export type BenchmarkManifest = z.infer<typeof benchmarkManifestSchema>;
type BenchmarkCase = BenchmarkManifest["cases"][number];
type Classification =
  | "true-positive"
  | "false-negative"
  | "false-positive"
  | "true-negative"
  | "infrastructure-error"
  | "unsupported";

export interface BenchmarkCaseResult {
  id: string;
  classification: Classification;
  findings: Finding[];
  missedRules: string[];
  falsePositiveRules: string[];
  error?: string;
}

export interface BenchmarkReport {
  total: number;
  positive: number;
  negative: number;
  detected: number;
  missed: number;
  falsePositives: number;
  infrastructureErrors: number;
  unsupported: number;
  precision: number | null;
  recall: number | null;
  byRule: Record<string, { tp: number; fn: number; fp: number; tn: number }>;
  results: BenchmarkCaseResult[];
}

export async function loadBenchmarkManifest(
  manifestPath = path.join(process.cwd(), "benchmark", "manifest.json"),
): Promise<BenchmarkManifest> {
  return benchmarkManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
}

function fixturePath(value: string): string {
  const root = path.resolve(process.cwd(), "benchmark", "fixtures");
  const resolved = path.resolve(process.cwd(), value);
  if (!resolved.startsWith(`${root}${path.sep}`))
    throw new Error("Fixture path must stay inside benchmark/fixtures.");
  return resolved;
}

function emptyRuleCounts() {
  return Object.fromEntries(
    benchmarkRuleIds.map((ruleId) => [ruleId, { tp: 0, fn: 0, fp: 0, tn: 0 }]),
  ) as BenchmarkReport["byRule"];
}

function classify(
  benchmarkCase: BenchmarkCase,
  findings: Finding[],
  byRule: BenchmarkReport["byRule"],
): BenchmarkCaseResult {
  const missedRules: string[] = [];
  const falsePositiveRules: string[] = [];
  const expectedFailed = new Set<string>(
    benchmarkCase.expected.findings
      .filter((finding) => finding.status === "failed")
      .map((finding) => finding.ruleId),
  );

  for (const expected of benchmarkCase.expected.findings) {
    const matches = findings.some(
      (finding) =>
        finding.ruleId === expected.ruleId &&
        finding.status === expected.status &&
        finding.severity === expected.severity,
    );
    if (expected.status === "failed") {
      byRule[expected.ruleId][matches ? "tp" : "fn"] += 1;
      if (!matches) missedRules.push(expected.ruleId);
    } else {
      byRule[expected.ruleId][matches ? "tn" : "fp"] += 1;
      if (!matches) falsePositiveRules.push(expected.ruleId);
    }
  }

  for (const finding of findings) {
    if (finding.status === "failed" && !expectedFailed.has(finding.ruleId)) {
      const counts = byRule[finding.ruleId];
      if (!counts) throw new Error(`Unknown rule returned: ${finding.ruleId}`);
      counts.fp += 1;
      if (!falsePositiveRules.includes(finding.ruleId))
        falsePositiveRules.push(finding.ruleId);
    }
  }

  return {
    id: benchmarkCase.id,
    classification:
      missedRules.length > 0
        ? "false-negative"
        : falsePositiveRules.length > 0
          ? "false-positive"
          : benchmarkCase.kind === "known-defect"
            ? "true-positive"
            : "true-negative",
    findings,
    missedRules,
    falsePositiveRules,
  };
}

export async function runBenchmark(
  manifest: BenchmarkManifest,
): Promise<BenchmarkReport> {
  const browser = await chromium.launch();
  const byRule = emptyRuleCounts();
  const results: BenchmarkCaseResult[] = [];

  try {
    for (const benchmarkCase of manifest.cases) {
      if (!benchmarkCase.expected.supported) {
        results.push({
          id: benchmarkCase.id,
          classification: "unsupported",
          findings: [],
          missedRules: [],
          falsePositiveRules: [],
        });
        continue;
      }

      let page: Page | undefined;
      try {
        page = await browser.newPage({ viewport: benchmarkCase.viewport });
        const fixture = benchmarkCase.fixture;
        if (!fixture) throw new Error("Fixture is missing.");
        await page.setContent(
          await readFile(fixturePath(fixture.path), "utf8"),
        );
        await page
          .locator("img")
          .evaluateAll((images: HTMLImageElement[]) =>
            Promise.all(images.map((image) => image.decode().catch(() => {}))),
          );
        const mainResponse = fixture.httpStatus
          ? ({ status: () => fixture.httpStatus } as Response)
          : null;
        const findings = await runAuditRules({ page, mainResponse });
        if (fixture.interaction)
          findings.push(await runAddToCartInteraction(page));
        results.push(classify(benchmarkCase, findings, byRule));
      } catch (error) {
        results.push({
          id: benchmarkCase.id,
          classification: "infrastructure-error",
          findings: [],
          missedRules: [],
          falsePositiveRules: [],
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        await page?.close();
      }
    }
  } finally {
    await browser.close();
  }

  const totals = Object.values(byRule).reduce(
    (sum, value) => ({
      tp: sum.tp + value.tp,
      fn: sum.fn + value.fn,
      fp: sum.fp + value.fp,
    }),
    { tp: 0, fn: 0, fp: 0 },
  );
  const positive = manifest.cases.filter(
    (item) => item.kind === "known-defect" && item.expected.supported,
  ).length;
  const negative = manifest.cases.filter(
    (item) => item.kind === "negative-control" && item.expected.supported,
  ).length;

  return {
    total: manifest.cases.length,
    positive,
    negative,
    detected: results.filter(
      (result) => result.classification === "true-positive",
    ).length,
    missed: results.filter(
      (result) => result.classification === "false-negative",
    ).length,
    falsePositives: totals.fp,
    infrastructureErrors: results.filter(
      (result) => result.classification === "infrastructure-error",
    ).length,
    unsupported: results.filter(
      (result) => result.classification === "unsupported",
    ).length,
    precision:
      totals.tp + totals.fp > 0 ? totals.tp / (totals.tp + totals.fp) : null,
    recall:
      totals.tp + totals.fn > 0 ? totals.tp / (totals.tp + totals.fn) : null,
    byRule,
    results,
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const percent = (value: number | null) =>
    value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const cases = report.results
    .map(
      (result) =>
        `${result.id}: ${result.classification}${
          result.missedRules.length
            ? ` (missed ${result.missedRules.join(", ")})`
            : ""
        }${
          result.falsePositiveRules.length
            ? ` (false positive ${result.falsePositiveRules.join(", ")})`
            : ""
        }`,
    )
    .join("\n");
  const rules = Object.entries(report.byRule)
    .map(
      ([ruleId, counts]) =>
        `${ruleId}: TP ${counts.tp}, FN ${counts.fn}, FP ${counts.fp}, TN ${counts.tn}`,
    )
    .join("\n");
  return [
    `Cases ${report.total}; positive ${report.positive}; negative ${report.negative}; unsupported ${report.unsupported}`,
    `Detected ${report.detected}; missed ${report.missed}; false positives ${report.falsePositives}; infrastructure errors ${report.infrastructureErrors}`,
    `Precision ${percent(report.precision)}; recall ${percent(report.recall)}`,
    rules,
    cases,
  ].join("\n");
}
