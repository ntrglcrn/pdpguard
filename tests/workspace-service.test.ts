import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/domain/audit";
import { AuthorizationError, WorkspaceService } from "@/lib/workspace-service";

const owner = { kind: "user" as const, userId: "owner" };
const member = { kind: "user" as const, userId: "member" };
const outsider = { kind: "user" as const, userId: "outsider" };

const resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function result(): AuditResult {
  return {
    auditedUrl: "https://example.com/product",
    finalUrl: "https://example.com/product",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:00:01.000Z",
    durationMs: 1_000,
    pageTitle: "Product",
    screenshot: { id: "artifact-id", url: "/api/screenshots/artifact-id" },
    summary: {
      status: "passed",
      counts: { critical: 0, warning: 0, passed: 1 },
    },
    findings: [
      {
        id: "title",
        ruleId: "title",
        title: "Title",
        description: "ok",
        severity: "info",
        status: "passed",
        evidence: ["Title"],
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

describe("WorkspaceService", () => {
  it("derives every child owner from its authorized parent", async () => {
    const service = new WorkspaceService(resolver);
    const workspace = service.createWorkspace(owner, "Acme");
    service.addMember(owner, workspace.id, member.userId);
    const store = service.createStore(member, workspace.id, {
      name: "Shop",
      url: "https://example.com",
    });
    const run = await service.createAuditRun(
      member,
      store.id,
      "https://example.com/product#ignored",
    );

    service.completeAuditRun({ kind: "worker", auditRunId: run.id }, result());

    expect(service.getAuditRun(owner, run.id)).toMatchObject({
      workspaceId: workspace.id,
      storeId: store.id,
      targetUrl: "https://example.com/product",
      findings: [{ auditRunId: run.id, ruleId: "title" }],
      artifacts: [{ auditRunId: run.id, id: "artifact-id" }],
    });
  });

  it("does not reveal stores or runs across workspace boundaries", async () => {
    const service = new WorkspaceService(resolver);
    const workspace = service.createWorkspace(owner, "Acme");
    const store = service.createStore(owner, workspace.id, {
      name: "Shop",
      url: "https://example.com",
    });
    const run = await service.createAuditRun(
      owner,
      store.id,
      "https://example.com/product",
    );

    expect(() => service.getAuditRun(outsider, run.id)).toThrow(
      AuthorizationError,
    );
    expect(() => service.listStores(outsider, workspace.id)).toThrow(
      AuthorizationError,
    );
    expect(() =>
      service.completeAuditRun(
        { kind: "worker", auditRunId: "other-run" },
        result(),
      ),
    ).toThrow(AuthorizationError);
  });
});
