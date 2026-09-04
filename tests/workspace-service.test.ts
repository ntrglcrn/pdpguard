import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AuditResult } from "@/domain/audit";
import { UnsafeUrlError } from "@/lib/url-safety";
import {
  AuthorizationError,
  UnsafeStoreTargetError,
  WorkspaceService,
} from "@/lib/workspace-service";

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

function failedResult(ruleId: string, screenshotId: string): AuditResult {
  return {
    ...result(),
    screenshot: { id: screenshotId, url: `/api/artifacts/${screenshotId}` },
    summary: { status: "warning", counts: { critical: 0, warning: 1, passed: 0 } },
    findings: [
      {
        ...result().findings[0],
        id: ruleId,
        ruleId,
        status: "failed",
        severity: "warning",
      },
    ],
  };
}

describe("WorkspaceService", () => {
  it("keeps production sessions Secure and supports an explicit local bootstrap cookie", () => {
    const { value } = service();
    const production = value.issueSession("production-user");
    const local = value.issueSession("local-user", undefined, {
      secureCookie: false,
    });

    expect(production.cookie).toContain("; Secure;");
    expect(local.cookie).not.toContain("; Secure;");
    expect(
      value.authenticateRequest(
        new Request("http://localhost:3000/stores", {
          headers: { cookie: local.cookie },
        }),
      ),
    ).toMatchObject({ kind: "user", userId: "local-user" });
    value.close();
  });

  it("issues a new local session after logout revokes the old one", () => {
    const { value } = service();
    const first = value.issueSession("local-user", undefined, {
      secureCookie: false,
    });
    value.revokeSession(value.authenticateSession(first.token));
    expect(() => value.authenticateSession(first.token)).toThrow(AuthorizationError);

    const second = value.issueSession("local-user", undefined, {
      secureCookie: false,
    });
    expect(value.authenticateSession(second.token)).toMatchObject({
      userId: "local-user",
    });
    value.close();
  });

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
    const store = await value.createStore(member, workspace.id, {
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
      reopened.listWorkspaces(reopened.authenticateSession(ownerSession.token)),
    ).toEqual([workspace]);
    expect(
      reopened.getStore(
        reopened.authenticateSession(ownerSession.token),
        store.id,
      ),
    ).toEqual(store);
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
    const store = await value.createStore(owner, workspace.id, {
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
    const store = await value.createStore(principal, workspace.id, {
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

  it("stores a public origin and rejects audit targets outside it", async () => {
    const { value } = service();
    const principal = value.authenticateSession(
      value.issueSession("owner").token,
    );
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, {
      url: "https://example.com/catalog?ref=setup#ignored",
    });

    expect(store).toMatchObject({
      name: "example.com",
      url: "https://example.com",
    });
    await expect(
      value.createAuditRun(principal, store.id, "https://other.example/pdp"),
    ).rejects.toThrow(UnsafeStoreTargetError);
    await expect(
      value.createStore(principal, workspace.id, {
        url: "http://localhost:3000",
      }),
    ).rejects.toThrow(UnsafeUrlError);
    value.close();
  });

  it("snapshots at most five active catalog PDPs in stable URL order", async () => {
    const { value } = service();
    const principal = value.authenticateSession(value.issueSession("owner").token);
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, {
      url: "https://example.com",
    });
    value.startCatalogDiscovery(principal, store.id);
    await value.completeCatalogDiscovery(principal, store.id, [
      "https://example.com/z",
      "https://example.com/a",
      "https://example.com/e",
      "https://example.com/b",
      "https://example.com/d",
      "https://example.com/c",
    ]);

    const { run, items } = value.createStoreAuditRun(principal, store.id);
    expect(run.selectedPdpCount).toBe(5);
    expect(items.map((item) => item.normalizedUrl)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
    ]);
    value.close();
  });

  it("uses category and uncategorized scopes in immutable selection snapshots", async () => {
    const { value } = service();
    const principal = value.authenticateSession(value.issueSession("owner").token);
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, { url: "https://example.com" });
    value.startCatalogDiscovery(principal, store.id);
    const catalog = await value.completeCatalogDiscovery(principal, store.id, {
      productUrls: ["https://example.com/products/a", "https://example.com/products/b"],
      categories: [{ url: "https://example.com/collections/rings", name: "Rings" }],
      mappings: [{ productUrl: "https://example.com/products/a", categoryUrl: "https://example.com/collections/rings" }],
      truncated: false,
    });
    const scoped = value.createStoreAuditRun(principal, store.id, { kind: "category", categoryId: catalog.categories[0].id });
    expect(scoped.run.scope).toMatchObject({ kind: "category", matchingPdpCount: 1, categoryName: "Rings" });
    expect(scoped.items.map((item) => item.normalizedUrl)).toEqual(["https://example.com/products/a"]);
    expect(value.createStoreAuditRun(principal, store.id, { kind: "uncategorized" }).items.map((item) => item.normalizedUrl)).toEqual(["https://example.com/products/b"]);
    value.close();
  });

  it("keeps Store Audit children out of Quick Audit history and persists partial progress", async () => {
    const { value } = service();
    const principal = value.authenticateSession(value.issueSession("owner").token);
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, {
      url: "https://example.com",
    });
    value.startCatalogDiscovery(principal, store.id);
    await value.completeCatalogDiscovery(principal, store.id, [
      "https://example.com/a",
      "https://example.com/b",
    ]);
    const { run: parent, items } = value.createStoreAuditRun(principal, store.id);
    const { run: child, worker } = await value.createAuditRun(
      principal,
      store.id,
      items[0].normalizedUrl,
    );
    value.linkStoreAuditRunItem(principal, parent.id, items[0].id, child.id);
    value.startAuditRun(worker);
    value.completeAuditRun(worker, { ...result(), auditedUrl: child.targetUrl, finalUrl: child.targetUrl, screenshot: { id: "child-artifact", url: "/api/artifacts/child-artifact" } }, { id: "child-artifact", contents: Buffer.from("screenshot") });
    value.recordStoreAuditItemFailure(principal, parent.id, items[1].id, "timeout");
    const report = value.completeStoreAuditRun(principal, parent.id);

    expect(report).toMatchObject({ status: "completed_with_failures", completedPdpCount: 1, failedPdpCount: 1 });
    expect(value.listAuditRuns(principal, store.id)).toEqual([]);
    expect(report.items[0].auditRunId).toBe(child.id);
    expect(report.items[1].failureCategory).toBe("timeout");
    value.close();
  });

  it("tracks only comparable complete Store Audit issue lifecycle", async () => {
    const { value } = service();
    const principal = value.authenticateSession(value.issueSession("owner").token);
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, { url: "https://example.com" });
    value.startCatalogDiscovery(principal, store.id);
    await value.completeCatalogDiscovery(principal, store.id, ["https://example.com/product"]);

    const complete = async (ruleId: string | null, screenshotId: string) => {
      const { run, items } = value.createStoreAuditRun(principal, store.id);
      const { run: child, worker } = await value.createAuditRun(principal, store.id, items[0].normalizedUrl);
      value.linkStoreAuditRunItem(principal, run.id, items[0].id, child.id);
      value.startAuditRun(worker);
      const auditResult = ruleId ? failedResult(ruleId, screenshotId) : { ...result(), auditedUrl: child.targetUrl, finalUrl: child.targetUrl, screenshot: { id: screenshotId, url: `/api/artifacts/${screenshotId}` } };
      value.completeAuditRun(worker, { ...auditResult, auditedUrl: child.targetUrl, finalUrl: child.targetUrl }, { id: screenshotId, contents: Buffer.from(screenshotId) });
      return value.completeStoreAuditRun(principal, run.id);
    };

    const first = await complete("PDP-RULE-1", "one");
    expect(first.issues).toMatchObject([{ ruleId: "PDP-RULE-1", lifecycle: "new" }]);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const existing = await complete("PDP-RULE-1", "two");
    expect(existing.issues).toMatchObject([{ ruleId: "PDP-RULE-1", lifecycle: "unchanged" }]);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const resolved = await complete(null, "three");
    expect(resolved.issues).toMatchObject([{ ruleId: "PDP-RULE-1", lifecycle: "resolved", affectedPdpCount: 0, affectedPdps: [] }]);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const regressed = await complete("PDP-RULE-1", "four");
    expect(regressed.issues).toMatchObject([{ ruleId: "PDP-RULE-1", lifecycle: "regressed" }]);
    const partial = value.createStoreAuditRun(principal, store.id);
    value.recordStoreAuditItemFailure(principal, partial.run.id, partial.items[0].id, "timeout");
    expect(value.completeStoreAuditRun(principal, partial.run.id).issues).toEqual([]);
    value.close();
  });

  it("derives monitoring from bounded runs without letting a partial attempt erase confirmed state", async () => {
    const { value } = service();
    const principal = value.authenticateSession(value.issueSession("owner").token);
    const workspace = value.createWorkspace(principal, "Acme");
    const store = await value.createStore(principal, workspace.id, { url: "https://example.com" });
    value.startCatalogDiscovery(principal, store.id);
    await value.completeCatalogDiscovery(principal, store.id, ["https://example.com/product"]);
    const complete = async (ruleId: string | null, screenshotId: string) => {
      const { run, items } = value.createStoreAuditRun(principal, store.id);
      const { run: child, worker } = await value.createAuditRun(principal, store.id, items[0].normalizedUrl);
      value.linkStoreAuditRunItem(principal, run.id, items[0].id, child.id);
      value.startAuditRun(worker);
      const auditResult = ruleId ? failedResult(ruleId, screenshotId) : { ...result(), auditedUrl: child.targetUrl, finalUrl: child.targetUrl, screenshot: { id: screenshotId, url: `/api/artifacts/${screenshotId}` } };
      value.completeAuditRun(worker, { ...auditResult, auditedUrl: child.targetUrl, finalUrl: child.targetUrl }, { id: screenshotId, contents: Buffer.from(screenshotId) });
      return value.completeStoreAuditRun(principal, run.id);
    };
    const baseline = await complete("PDP-RULE-1", "baseline");
    let report = value.getMonitoringReport(principal, store.id, baseline.id);
    expect(report).toMatchObject({ baseline: { id: baseline.id }, comparisonPredecessor: null, changes: null });
    expect(report.currentIssues).toMatchObject([{ ruleId: "PDP-RULE-1", lifecycle: null }]);
    const partial = value.createStoreAuditRun(principal, store.id);
    value.recordStoreAuditItemFailure(principal, partial.run.id, partial.items[0].id, "timeout");
    value.completeStoreAuditRun(principal, partial.run.id);
    report = value.getMonitoringReport(principal, store.id, baseline.id);
    expect(report.latestAttempt.status).toBe("failed");
    expect(report.lastConfirmed?.id).toBe(baseline.id);
    expect(report.currentIssues).toHaveLength(1);
    expect(report.history).toHaveLength(2);
    (value as unknown as { database: { prepare(sql: string): { run(...values: string[]): void } } }).database
      .prepare("UPDATE store_audit_runs SET scope_snapshot_json = NULL WHERE id = ?")
      .run(baseline.id);
    const legacyTarget = value.listMonitoringTargets(principal, store.id)[0];
    expect(value.getMonitoringReport(principal, store.id, legacyTarget.referenceRunId).latestAttempt.id).toBe(partial.run.id);
    value.close();
  });
});
