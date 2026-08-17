import type { Page, Response } from "playwright";

export type FindingSeverity = "critical" | "warning" | "info";
export type FindingStatus = "passed" | "failed";
export type AuditStatus = "critical" | "warning" | "passed";

export interface Finding {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: FindingStatus;
  evidence: string[];
  recommendation: string;
}

export interface AuditSummary {
  status: AuditStatus;
  counts: {
    critical: number;
    warning: number;
    passed: number;
  };
}

export interface AuditResult {
  auditedUrl: string;
  finalUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pageTitle: string;
  screenshot: {
    id: string;
    url: string;
  };
  summary: AuditSummary;
  findings: Finding[];
  metadata: {
    viewport: { width: number; height: number };
    userAgent: string;
    httpStatus: number | null;
    redirectCount: number;
    blockedRequestCount: number;
  };
}

export interface AuditRuleContext {
  page: Page;
  mainResponse: Response | null;
}

export type AuditRule = (context: AuditRuleContext) => Promise<Finding>;

export interface AuditRunner {
  run(url: string, options?: AuditOptions): Promise<AuditResult>;
}

export interface AuditOptions {
  testAddToCart?: boolean;
}

export function summarizeFindings(findings: Finding[]): AuditSummary {
  const critical = findings.filter(
    (finding) => finding.status === "failed" && finding.severity === "critical",
  ).length;
  const warning = findings.filter(
    (finding) => finding.status === "failed" && finding.severity === "warning",
  ).length;
  const passed = findings.filter(
    (finding) => finding.status === "passed",
  ).length;

  return {
    status: critical > 0 ? "critical" : warning > 0 ? "warning" : "passed",
    counts: { critical, warning, passed },
  };
}
