import { describe, expect, it } from "vitest";

import { failuresFirst, findingPresentation } from "@/app/finding-presentation";
import type { Finding } from "@/domain/audit";

const finding = (id: string, status: Finding["status"]): Finding => ({
  id,
  ruleId: id,
  title: id,
  description: id,
  severity: status === "passed" ? "info" : "warning",
  status,
  evidence: [id],
  recommendation: id,
});

describe("finding presentation", () => {
  it("maps stable rules and gives unknown rules neutral metadata", () => {
    expect(findingPresentation("purchase-cta")).toEqual({
      category: "Purchase",
      impact: "Can prevent or complicate the shopper’s path to purchase.",
    });
    expect(findingPresentation("future-rule").category).toBe("Page quality");
  });

  it("places failures before passed checks without hiding results", () => {
    const findings = [finding("pass", "passed"), finding("fail", "failed")];

    expect(failuresFirst(findings).map(({ id }) => id)).toEqual([
      "fail",
      "pass",
    ]);
    expect(findings.map(({ id }) => id)).toEqual(["pass", "fail"]);
  });
});
