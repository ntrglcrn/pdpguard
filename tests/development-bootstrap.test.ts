import { afterEach, describe, expect, it, vi } from "vitest";

import { developmentBootstrapAvailable } from "@/lib/development-bootstrap";
import { AuthorizationError } from "@/lib/workspace-service";

const service = {
  issueSession: vi.fn(() => ({ token: "new-local-session", cookie: "pdpguard_session=new-local-session" })),
  authenticateSession: vi.fn(() => ({ kind: "user" as const, userId: "local-user", sessionId: "new-local-session" })),
  listWorkspaces: vi.fn(() => []),
  createWorkspace: vi.fn(),
};

vi.mock("@/lib/app-service", () => ({
  authenticateAppRequest: vi.fn(() => {
    throw new AuthorizationError();
  }),
  getWorkspaceService: vi.fn(() => service),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("development bootstrap availability", () => {
  it("allows the local login only for enabled loopback development requests", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");

    expect(developmentBootstrapAvailable(new URL("http://localhost:3000"))).toBe(true);
  });

  it.each([
    ["development", undefined, "http://localhost:3000"],
    ["production", "1", "http://localhost:3000"],
    ["development", "1", "https://app.example"],
  ])("hides bootstrap when policy rejects it", (nodeEnv, bootstrap, url) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", bootstrap ?? "");

    expect(developmentBootstrapAvailable(new URL(url))).toBe(false);
  });

  it("does not trust forwarded host headers", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");
    const request = new Request("https://app.example/api/bootstrap", {
      headers: { "x-forwarded-host": "localhost:3000" },
    });

    expect(developmentBootstrapAvailable(new URL(request.url))).toBe(false);
  });

  it("boots a new local session and preserves a safe return path", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");
    const { GET } = await import("@/app/api/bootstrap/route");

    const response = await GET(
      new Request("http://localhost:3000/api/bootstrap?next=/stores/example"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/stores/example",
    );
    expect(response.headers.get("set-cookie")).toContain("new-local-session");
    expect(service.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "local-user" }),
      "Local workspace",
    );
  });

  it.each([
    ["production", "1", "http://localhost:3000/api/bootstrap"],
    ["development", undefined, "http://localhost:3000/api/bootstrap"],
    ["development", "1", "https://app.example/api/bootstrap"],
  ])("keeps the bootstrap endpoint unavailable when policy rejects it", async (nodeEnv, bootstrap, url) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", bootstrap ?? "");
    const { GET } = await import("@/app/api/bootstrap/route");

    expect((await GET(new Request(url))).status).toBe(404);
  });

  it("uses the shared return-path validator for hostile next values", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");
    const { GET } = await import("@/app/api/bootstrap/route");

    const response = await GET(
      new Request("http://localhost:3000/api/bootstrap?next=https://evil.example"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/stores");
  });
});
