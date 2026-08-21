import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Response } from "playwright";
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
        fixedPath: z.string().min(1),
        httpStatus: z.number().int().min(100).max(599).optional(),
        fixedHttpStatus: z.number().int().min(100).max(599).optional(),
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
  fixed?: Omit<BenchmarkCaseResult, "fixed">;
  error?: string;
}

export interface BenchmarkReport {
  total: number;
  positive: number;
  negative: number;
  uniqueDefectPatterns: number;
  coveredRules: number;
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
  const expected = new Map<
    string,
    BenchmarkCase["expected"]["findings"][number]
  >(
    benchmarkCase.expected.findings.map((finding) => [finding.ruleId, finding]),
  );

  for (const finding of findings) {
    const counts = byRule[finding.ruleId];
    if (!counts) throw new Error(`Unknown rule returned: ${finding.ruleId}`);
    const wanted = expected.get(finding.ruleId);
    if (wanted?.status === "failed") {
      const matches =
        finding.status === wanted.status &&
        finding.severity === wanted.severity;
      counts[matches ? "tp" : "fn"] += 1;
      if (!matches) missedRules.push(finding.ruleId);
    } else if (finding.status === "failed") {
      counts.fp += 1;
      falsePositiveRules.push(finding.ruleId);
    } else {
      counts.tn += 1;
    }
  }

  for (const wanted of expected.values()) {
    if (
      wanted.status === "failed" &&
      !findings.some((finding) => finding.ruleId === wanted.ruleId)
    ) {
      byRule[wanted.ruleId].fn += 1;
      missedRules.push(wanted.ruleId);
    }
  }

  return {
    id: benchmarkCase.id,
    classification:
      missedRules.length > 0
        ? "false-negative"
        : benchmarkCase.kind === "known-defect"
          ? "true-positive"
          : falsePositiveRules.length > 0
            ? "false-positive"
            : "true-negative",
    findings,
    missedRules,
    falsePositiveRules,
  };
}

async function auditFixture(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  benchmarkCase: BenchmarkCase,
  fixed: boolean,
): Promise<Finding[]> {
  const fixture = benchmarkCase.fixture;
  if (!fixture) throw new Error("Fixture is missing.");
  const page = await browser.newPage({ viewport: benchmarkCase.viewport });
  try {
    await page.setContent(
      await readFile(
        fixturePath(fixed ? fixture.fixedPath : fixture.path),
        "utf8",
      ),
    );
    await page
      .locator("img")
      .evaluateAll((images: HTMLImageElement[]) =>
        Promise.all(images.map((image) => image.decode().catch(() => {}))),
      );
    const status = fixed ? fixture.fixedHttpStatus : fixture.httpStatus;
    const findings = await runAuditRules({
      page,
      mainResponse: status ? ({ status: () => status } as Response) : null,
    });
    if (fixture.interaction) findings.push(await runAddToCartInteraction(page));
    return findings;
  } finally {
    await page.close();
  }
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

      try {
        const result = classify(
          benchmarkCase,
          await auditFixture(browser, benchmarkCase, false),
          byRule,
        );
        if (benchmarkCase.kind === "known-defect") {
          const fixedCase = {
            ...benchmarkCase,
            id: `${benchmarkCase.id}-FIXED`,
            kind: "negative-control" as const,
            expected: {
              supported: true,
              findings: benchmarkCase.expected.findings.map((finding) => ({
                ...finding,
                status: "passed" as const,
                severity: "info" as const,
              })),
            },
          };
          result.fixed = classify(
            fixedCase,
            await auditFixture(browser, benchmarkCase, true),
            byRule,
          );
        }
        results.push(result);
      } catch (error) {
        results.push({
          id: benchmarkCase.id,
          classification: "infrastructure-error",
          findings: [],
          missedRules: [],
          falsePositiveRules: [],
          error: error instanceof Error ? error.message : "Unknown error",
        });
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
  const negative =
    manifest.cases.filter(
      (item) => item.kind === "negative-control" && item.expected.supported,
    ).length + positive;
  const supportedDefects = manifest.cases.filter(
    (item) => item.kind === "known-defect" && item.expected.supported,
  );

  return {
    total: manifest.cases.length,
    positive,
    negative,
    uniqueDefectPatterns: new Set(
      supportedDefects.map((item) =>
        item.expected.findings
          .filter((finding) => finding.status === "failed")
          .map((finding) => finding.ruleId)
          .sort()
          .join("+"),
      ),
    ).size,
    coveredRules: new Set(
      supportedDefects.flatMap((item) =>
        item.expected.findings
          .filter((finding) => finding.status === "failed")
          .map((finding) => finding.ruleId),
      ),
    ).size,
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
  const formatCase = (result: BenchmarkCaseResult) =>
    `${result.id}: ${result.classification}${
      result.missedRules.length
        ? ` (missed ${result.missedRules.join(", ")})`
        : ""
    }${
      result.falsePositiveRules.length
        ? ` (false positive ${result.falsePositiveRules.join(", ")})`
        : ""
    }`;
  const cases = report.results
    .flatMap((result) => [
      formatCase(result),
      ...(result.fixed ? [`  ${formatCase(result.fixed)}`] : []),
    ])
    .join("\n");
  const rules = Object.entries(report.byRule)
    .map(
      ([ruleId, counts]) =>
        `${ruleId}: positive ${counts.tp + counts.fn}, negative ${counts.fp + counts.tn}, TP ${counts.tp}, FN ${counts.fn}, FP ${counts.fp}, TN ${counts.tn}${counts.tp + counts.fn === 0 ? " (positive coverage gap)" : ""}`,
    )
    .join("\n");
  return [
    `Cases ${report.total}; supported positive ${report.positive}; deterministic negative evaluations ${report.negative}; unique defect patterns ${report.uniqueDefectPatterns}; covered rules ${report.coveredRules}; unsupported ${report.unsupported}`,
    `Detected ${report.detected}; missed ${report.missed}; false positives ${report.falsePositives}; infrastructure errors ${report.infrastructureErrors}`,
    `Precision ${percent(report.precision)}; recall ${percent(report.recall)}`,
    rules,
    cases,
  ].join("\n");
}
