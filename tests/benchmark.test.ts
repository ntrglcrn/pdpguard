import { beforeAll, describe, expect, it } from "vitest";

import {
  benchmarkManifestSchema,
  formatBenchmarkReport,
  loadBenchmarkManifest,
  runBenchmark,
  type BenchmarkManifest,
  type BenchmarkReport,
} from "../benchmark/runner";

let manifest: BenchmarkManifest;
let report: BenchmarkReport;

beforeAll(async () => {
  manifest = await loadBenchmarkManifest();
  report = await runBenchmark(manifest);
  console.log(`\n${formatBenchmarkReport(report)}\n`);
}, 30_000);

describe("benchmark manifest", () => {
  it("contains unique sourced cases and at least 15 supported defects", () => {
    expect(new Set(manifest.cases.map((item) => item.id)).size).toBe(
      manifest.cases.length,
    );
    expect(
      manifest.cases.filter(
        (item) => item.kind === "known-defect" && item.expected.supported,
      ).length,
    ).toBeGreaterThanOrEqual(15);
    expect(
      manifest.cases.every(
        (item) =>
          item.source.url && item.source.capturedAt && item.evidence.length,
      ),
    ).toBe(true);
  });

  it("rejects unknown rules and supported cases without fixtures", () => {
    expect(
      benchmarkManifestSchema.safeParse({
        version: 1,
        cases: [
          {
            ...manifest.cases[0],
            fixture: undefined,
            expected: {
              supported: true,
              findings: [
                {
                  ruleId: "not-a-rule",
                  status: "failed",
                  severity: "warning",
                },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("benchmark runner", () => {
  it("detects every supported defect without infrastructure failures", () => {
    expect(report.detected).toBe(report.positive);
    expect(report.missed).toBe(0);
    expect(report.infrastructureErrors).toBe(0);
    expect(report.negative).toBe(2);
    expect(report.unsupported).toBe(
      manifest.cases.filter((item) => !item.expected.supported).length,
    );
  });
});
