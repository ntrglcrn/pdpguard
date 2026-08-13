import { describe, expect, it } from "vitest";

import { summarizeFindings, type Finding } from "@/domain/audit";

const makeFinding = (
  id: string,
  severity: Finding["severity"],
  status: Finding["status"],
): Finding => ({
  id,
  ruleId: id,
  title: id,
  description: id,
  severity,
  status,
  evidence: [id],
  recommendation: id,
});

describe("summarizeFindings", () => {
  it("prioritizes critical failures and counts passed checks", () => {
    expect(
      summarizeFindings([
        makeFinding("critical", "critical", "failed"),
        makeFinding("warning", "warning", "failed"),
        makeFinding("pass", "info", "passed"),
      ]),
    ).toEqual({
      status: "critical",
      counts: { critical: 1, warning: 1, passed: 1 },
    });
  });

  it("returns passed when no check fails critically or with warning", () => {
    expect(
      summarizeFindings([makeFinding("pass", "info", "passed")]).status,
    ).toBe("passed");
  });
});
