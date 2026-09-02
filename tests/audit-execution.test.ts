import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AuditResult } from "@/domain/audit";
import { executeStoreAudit } from "@/lib/audit-execution";
import { AuditTimeoutError } from "@/lib/audit/engine";
import { WorkspaceService } from "@/lib/workspace-service";

const directories: string[] = [];
const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("executeStoreAudit", () => {
  it("persists completed output and classifies runner failures", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "pdpguard-execution-"));
    directories.push(directory);
    const service = new WorkspaceService(
      path.join(directory, "pdpguard.sqlite"),
      resolver,
    );
    const principal = service.authenticateSession(
      service.issueSession("owner").token,
    );
    const workspace = service.createWorkspace(principal, "Acme");
    const store = await service.createStore(principal, workspace.id, {
      url: "https://example.com",
    });

    const completed = await executeStoreAudit(
      service,
      principal,
      store.id,
      "https://example.com/products/one",
      (storage) => ({
        async run(url) {
          const screenshot = await storage.save(Buffer.from("private png"));
          return result(url, screenshot);
        },
      }),
    );
    expect(completed).toMatchObject({ status: "completed" });
    const report = service.getAuditRun(principal, completed.id);
    expect(report).toMatchObject({
      status: "completed",
      findings: [{ ruleId: "page-title" }],
      artifacts: [{ kind: "screenshot", byteSize: 11 }],
    });
    expect(
      service.readArtifact(principal, report.artifacts[0].id).contents,
    ).toEqual(Buffer.from("private png"));

    const failed = await executeStoreAudit(
      service,
      principal,
      store.id,
      "https://example.com/products/two",
      () => ({
        async run() {
          throw new AuditTimeoutError();
        },
      }),
    );
    expect(failed).toMatchObject({
      status: "failed",
      failureCategory: "timeout",
    });
    expect(service.listAuditRuns(principal, store.id)).toHaveLength(2);
    service.close();
  });
});

function result(
  url: string,
  screenshot: AuditResult["screenshot"],
): AuditResult {
  return {
    auditedUrl: url,
    finalUrl: url,
    startedAt: "2026-09-02T00:00:00.000Z",
    finishedAt: "2026-09-02T00:00:01.000Z",
    durationMs: 1_000,
    pageTitle: "Product",
    screenshot,
    summary: {
      status: "passed",
      counts: { critical: 0, warning: 0, passed: 1 },
    },
    findings: [
      {
        id: "page-title",
        ruleId: "page-title",
        title: "Page title",
        description: "Present",
        severity: "info",
        status: "passed",
        evidence: ["Product"],
        recommendation: "None",
      },
    ],
    metadata: {
      viewport: { width: 390, height: 844 },
      userAgent: "test",
      httpStatus: 200,
      redirectCount: 0,
      blockedRequestCount: 0,
    },
  };
}
