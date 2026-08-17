const processState = globalThis as typeof globalThis & {
  pdpGuardAuditInProgress?: boolean;
};

export class AuditBusyError extends Error {
  constructor() {
    super("Another audit is already running. Try again shortly.");
    this.name = "AuditBusyError";
  }
}

export async function runAuditExclusive<T>(work: () => Promise<T>) {
  // ponytail: process-local lock; replace with a shared queue when audits move to workers.
  if (processState.pdpGuardAuditInProgress) throw new AuditBusyError();
  processState.pdpGuardAuditInProgress = true;
  try {
    return await work();
  } finally {
    processState.pdpGuardAuditInProgress = false;
  }
}
