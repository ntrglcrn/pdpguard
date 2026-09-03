import { randomUUID } from "node:crypto";

import type { AuditRunner } from "@/domain/audit";
import type { AuthenticatedUser, AuditScopeInput } from "@/domain/saas";
import { AuditTimeoutError, PlaywrightAuditRunner } from "@/lib/audit/engine";
import type { ScreenshotStorage } from "@/lib/screenshot-storage";
import { UnsafeUrlError } from "@/lib/url-safety";
import { WorkspaceService } from "@/lib/workspace-service";

type RunnerFactory = (storage: ScreenshotStorage) => AuditRunner;

export class AuditBusyError extends Error {
  constructor() {
    super("Another audit is already running. Try again shortly.");
    this.name = "AuditBusyError";
  }
}

let auditInProgress = false;

export async function withAuditSlot<T>(operation: () => Promise<T>) {
  if (auditInProgress) throw new AuditBusyError();
  auditInProgress = true;
  try {
    return await operation();
  } finally {
    auditInProgress = false;
  }
}

export async function executeQuickAudit(
  service: WorkspaceService,
  principal: AuthenticatedUser,
  storeId: string,
  targetUrl: string,
  createRunner: RunnerFactory = (storage) => new PlaywrightAuditRunner(storage),
) {
  return withAuditSlot(() =>
    executePdpAudit(service, principal, storeId, targetUrl, createRunner),
  );
}

/** Compatibility for callers that still use the former Quick Audit name. */
export const executeStoreAudit = executeQuickAudit;

export async function executeCatalogStoreAudit(
  service: WorkspaceService,
  principal: AuthenticatedUser,
  storeId: string,
  scope: AuditScopeInput = { kind: "all" },
  createRunner: RunnerFactory = (storage) => new PlaywrightAuditRunner(storage),
) {
  return withAuditSlot(async () => {
    const { run: parent, items } = service.createStoreAuditRun(
      principal,
      storeId,
      scope,
    );
    try {
      for (const item of items) {
        try {
          const child = await executePdpAudit(
            service,
            principal,
            storeId,
            item.normalizedUrl,
            createRunner,
            (auditRunId) =>
              service.linkStoreAuditRunItem(
                principal,
                parent.id,
                item.id,
                auditRunId,
              ),
          );
          if (child.status === "failed")
            service.recordStoreAuditItemFailure(
              principal,
              parent.id,
              item.id,
              child.failureCategory ?? "infrastructure",
            );
          service.refreshStoreAuditProgress(parent.id);
        } catch (error) {
          service.recordStoreAuditItemFailure(
            principal,
            parent.id,
            item.id,
            failureCategory(error),
          );
        }
      }
      return service.completeStoreAuditRun(principal, parent.id);
    } catch {
      return service.failStoreAuditRun(principal, parent.id);
    }
  });
}

async function executePdpAudit(
  service: WorkspaceService,
  principal: AuthenticatedUser,
  storeId: string,
  targetUrl: string,
  createRunner: RunnerFactory,
  onCreated?: (auditRunId: string) => void,
) {
  const { run, worker } = await service.createAuditRun(
    principal,
    storeId,
    targetUrl,
  );
  onCreated?.(run.id);
  service.startAuditRun(worker);
  const storage = new CapturedScreenshotStorage();

  try {
    const result = await createRunner(storage).run(run.targetUrl);
    const contents = await storage.read(result.screenshot.id);
    if (!contents) throw new Error("The audit screenshot was not captured.");
    return service.completeAuditRun(worker, result, {
      id: result.screenshot.id,
      contents,
    });
  } catch (error) {
    return service.failAuditRun(worker, failureCategory(error));
  }
}

function failureCategory(error: unknown) {
  return error instanceof UnsafeUrlError
    ? ("unsafe_url" as const)
    : error instanceof AuditTimeoutError
      ? ("timeout" as const)
      : ("infrastructure" as const);
}

class CapturedScreenshotStorage implements ScreenshotStorage {
  private readonly screenshots = new Map<string, Buffer>();

  async save(contents: Buffer) {
    const id = randomUUID();
    this.screenshots.set(id, Buffer.from(contents));
    return { id, url: `/api/artifacts/${id}` };
  }

  async read(id: string) {
    return this.screenshots.get(id) ?? null;
  }
}
