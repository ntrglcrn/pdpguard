import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  local: vi.fn(),
  audit: vi.fn(),
  catalog: vi.fn(),
  authenticateSession: vi.fn(),
  createAuditRun: vi.fn(),
  createStoreAuditRun: vi.fn(),
  enqueueCatalogDiscovery: vi.fn(),
  getStoreCatalog: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("pg", () => ({ Pool: class {} }));
vi.mock("@/lib/workspace-service", () => { mocks.local(); throw new Error("SQLite imported"); });
vi.mock("@/lib/audit-execution", () => { mocks.audit(); throw new Error("Browser executor imported"); });
vi.mock("@/lib/catalog-discovery", () => { mocks.catalog(); throw new Error("Catalog browser imported"); });
vi.mock("@/lib/postgres-workspace-service", () => ({
  PostgresWorkspaceService: class {
    authenticateSession = mocks.authenticateSession;
    createAuditRun = mocks.createAuditRun;
    createStoreAuditRun = mocks.createStoreAuditRun;
    enqueueCatalogDiscovery = mocks.enqueueCatalogDiscovery;
    getStoreCatalog = mocks.getStoreCatalog;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "");
  for (const name of ["DATABASE_URL", "PDP_GUARD_ARTIFACT_BUCKET", "AWS_REGION", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_ISSUER", "AUTH_SECRET", "AUTH_URL"])
    vi.stubEnv(name, "configured");
  mocks.authenticateSession.mockResolvedValue({ userId: "user", sessionId: "session" });
});
afterEach(() => vi.unstubAllEnvs());

describe("production web boundary", () => {
  it("fails closed on missing config and build phase without opening SQLite", async () => {
    const app = await import("@/lib/app-service");
    vi.stubEnv("DATABASE_URL", "");
    await expect(app.getWorkspaceService()).rejects.toThrow("DATABASE_URL");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await expect(app.getWorkspaceService()).rejects.toThrow("during the build");
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("awaits authentication and persists queued work without loading browser execution", async () => {
    const app = await import("@/lib/app-service");
    const quick = { id: "quick", status: "queued" };
    const store = { id: "store-run", status: "queued" };
    mocks.createAuditRun.mockResolvedValue({ run: quick });
    mocks.createStoreAuditRun.mockResolvedValue({ run: store });
    mocks.getStoreCatalog.mockResolvedValue({ discovery: { status: "running" } });
    await expect(app.executeAuditForApp("store", "https://store.example/pdp")).resolves.toEqual(quick);
    await expect(app.executeStoreAuditForApp("store")).resolves.toEqual(store);
    await expect(app.discoverCatalogForApp("store")).resolves.toMatchObject({ discovery: { status: "running" } });
    expect(mocks.createAuditRun).toHaveBeenCalledWith({ userId: "user", sessionId: "session" }, "store", "https://store.example/pdp");
    expect(mocks.enqueueCatalogDiscovery).toHaveBeenCalledWith({ userId: "user", sessionId: "session" }, "store");
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
