import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { runAuditWhenReady } from "@/lib/audit/engine";
import { runAuditRules } from "@/lib/audit/rules";
import { benchmarkCases, benchmarkRuleIds } from "./manifest";

let browser: Browser | undefined;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});

afterAll(async () => {
  await browser?.close();
});

describe("audit rule benchmark", () => {
  it("execution-readiness/regression/permanent-loader", async () => {
    await page.setContent("<title>Loading…</title><main>Loading…</main>");
    const findings = await runAuditWhenReady(
      { page, mainResponse: null },
      { timeoutMs: 350, stabilityMs: 150 },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "page-availability",
      status: "failed",
    });
  });

  it("declares positive and negative controls for every stable ruleId", () => {
    for (const ruleId of benchmarkRuleIds) {
      const controls = benchmarkCases
        .filter(
          (benchmarkCase) =>
            benchmarkCase.expected.ruleId === ruleId &&
            benchmarkCase.control !== "regression",
        )
        .map((benchmarkCase) => benchmarkCase.control);
      expect(controls, `${ruleId} controls`).toEqual(["negative", "positive"]);
    }
  });

  for (const benchmarkCase of benchmarkCases) {
    it(benchmarkCase.name, async () => {
      await page.setContent(benchmarkCase.html);
      await page.locator("img").evaluateAll(async (images) => {
        await Promise.allSettled(
          images.map((image) => (image as HTMLImageElement).decode()),
        );
      });

      const findings = await runAuditRules({ page, mainResponse: null });
      const actual = findings.find(
        (finding) => finding.ruleId === benchmarkCase.expected.ruleId,
      );

      if (actual?.status !== benchmarkCase.expected.status) {
        throw new Error(
          `Benchmark case "${benchmarkCase.name}" expected ${benchmarkCase.expected.ruleId}=${benchmarkCase.expected.status}, actual=${actual?.status ?? "missing"}.`,
        );
      }

      const expectedEvidence = benchmarkCase.expected.evidenceIncludes;
      if (
        expectedEvidence &&
        !actual.evidence.join(" ").includes(expectedEvidence)
      ) {
        throw new Error(
          `Benchmark case "${benchmarkCase.name}" expected ${benchmarkCase.expected.ruleId} evidence to include "${expectedEvidence}", actual=${JSON.stringify(actual.evidence)}.`,
        );
      }
    });
  }
});
