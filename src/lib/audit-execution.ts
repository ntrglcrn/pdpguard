import { randomUUID } from "node:crypto";

import type { AuditRunner } from "@/domain/audit";
import type { AuthenticatedUser } from "@/domain/saas";
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

export async function executeStoreAudit(
  service: WorkspaceService,
  principal: AuthenticatedUser,
  storeId: string,
  targetUrl: string,
  createRunner: RunnerFactory = (storage) => new PlaywrightAuditRunner(storage),
) {
  return withAuditSlot(async () => {
    const { run, worker } = await service.createAuditRun(
      principal,
      storeId,
      targetUrl,
    );
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
      return service.failAuditRun(
        worker,
        error instanceof UnsafeUrlError
          ? "unsafe_url"
          : error instanceof AuditTimeoutError
            ? "timeout"
            : "infrastructure",
      );
    }
  });
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
