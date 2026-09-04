import { afterEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("../auth", () => ({ auth }));

const authEnvironment = [
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_ISSUER",
  "AUTH_SECRET",
  "AUTH_URL",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function authModule(configured: boolean) {
  for (const name of authEnvironment) vi.stubEnv(name, "");
  if (configured) {
    vi.stubEnv("AUTH0_CLIENT_ID", "client-id");
    vi.stubEnv("AUTH0_CLIENT_SECRET", "client-secret");
    vi.stubEnv("AUTH0_ISSUER", "https://tenant.example");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
  }
  return import("@/lib/external-auth");
}

describe("external authentication configuration", () => {
  it("does not invoke Auth.js when external authentication is unconfigured", async () => {
    const { authProviderConfigured, configuredAuthSession } = await authModule(false);

    expect(authProviderConfigured()).toBe(false);
    await expect(configuredAuthSession()).resolves.toBeUndefined();
    expect(auth).not.toHaveBeenCalled();
  });

  it("keeps the Auth0 flow enabled when its complete server configuration exists", async () => {
    auth.mockResolvedValue({ user: { id: "auth0:user" } });
    const { authProviderConfigured, configuredAuthSession } = await authModule(true);

    expect(authProviderConfigured()).toBe(true);
    await expect(configuredAuthSession()).resolves.toEqual({
      user: { id: "auth0:user" },
    });
    expect(auth).toHaveBeenCalledOnce();
  });
});
