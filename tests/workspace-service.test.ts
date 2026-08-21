import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AuditResult } from "@/domain/audit";
import { AuthorizationError, WorkspaceService } from "@/lib/workspace-service";

const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function service() {
  const directory = mkdtempSync(path.join(tmpdir(), "pdpguard-saas-"));
  directories.push(directory);
  const databasePath = path.join(directory, "pdpguard.sqlite");
  return { databasePath, value: new WorkspaceService(databasePath, resolver) };
}

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
  it("persists authenticated ownership, completed runs and protected artifacts", async () => {
    const { databasePath, value } = service();
    const ownerSession = value.issueSession("owner");
    const owner = value.authenticateRequest(
      new Request("https://app.example", {
        headers: { cookie: ownerSession.cookie },
      }),
    );
    const workspace = value.createWorkspace(owner, "Acme");
    const memberSession = value.issueSession("member");
    value.addMember(owner, workspace.id, "member");
    const member = value.authenticateSession(memberSession.token);
    const store = value.createStore(member, workspace.id, {
      name: "Shop",
      url: "https://example.com",
    });
    const { run, worker } = await value.createAuditRun(
      member,
      store.id,
      "https://example.com/product#ignored",
    );
    value.startAuditRun(worker);
    value.completeAuditRun(worker, result(), {
      id: "artifact-id",
      contents: Buffer.from("private screenshot"),
    });
    expect(statSync(databasePath).mode & 0o777).toBe(0o600);
    value.close();

    const reopened = new WorkspaceService(databasePath, resolver);
    const report = reopened.getAuditRun(
      reopened.authenticateSession(ownerSession.token),
      run.id,
    );
    expect(report).toMatchObject({
      workspaceId: workspace.id,
      storeId: store.id,
      status: "completed",
      findings: [{ auditRunId: run.id, ruleId: "title" }],
      artifacts: [{ auditRunId: run.id, id: "artifact-id", byteSize: 18 }],
    });
    expect(
      reopened
        .readArtifact(
          reopened.authenticateSession(memberSession.token),
          "artifact-id",
        )
        .contents.toString(),
    ).toBe("private screenshot");
    reopened.close();
  });

  it("rejects forged sessions, cross-tenant reads and unscoped workers", async () => {
    const { value } = service();
    const owner = value.authenticateSession(value.issueSession("owner").token);
    const outsider = value.authenticateSession(
      value.issueSession("outsider").token,
    );
    const workspace = value.createWorkspace(owner, "Acme");
    const store = value.createStore(owner, workspace.id, {
      name: "Shop",
      url: "https://example.com",
    });
    const { run, worker } = await value.createAuditRun(
      owner,
      store.id,
      "https://example.com/product",
    );

    expect(() =>
      value.listStores({ ...owner, sessionId: "forged" }, workspace.id),
    ).toThrow(AuthorizationError);
    expect(() => value.getAuditRun(outsider, run.id)).toThrow(
      AuthorizationError,
    );
    expect(() => value.startAuditRun({ ...worker, token: "forged" })).toThrow(
      AuthorizationError,
    );
    expect(() => value.readArtifact(outsider, "artifact-id")).toThrow(
      AuthorizationError,
    );
    value.close();
  });

  it("enforces durable run transitions and session revocation", async () => {
    const { value } = service();
    const principal = value.authenticateSession(
      value.issueSession("owner").token,
    );
    const workspace = value.createWorkspace(principal, "Acme");
    const store = value.createStore(principal, workspace.id, {
      name: "Shop",
      url: "https://example.com",
    });
    const { run, worker } = await value.createAuditRun(
      principal,
      store.id,
      "https://example.com/product",
    );

    expect(value.cancelAuditRun(principal, run.id).status).toBe("cancelled");
    expect(() => value.startAuditRun(worker)).toThrow(AuthorizationError);
    value.revokeSession(principal);
    expect(() => value.listStores(principal, workspace.id)).toThrow(
      AuthorizationError,
    );
    value.close();
  });
});
