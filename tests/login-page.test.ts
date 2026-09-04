import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authProviderConfigured, configuredAuthSession, getExistingPrincipal } =
  vi.hoisted(() => ({
    authProviderConfigured: vi.fn(),
    configuredAuthSession: vi.fn(),
    getExistingPrincipal: vi.fn(),
  }));

vi.mock("@/lib/external-auth", () => ({
  authProviderConfigured,
  configuredAuthSession,
}));

vi.mock("@/lib/app-service", () => ({ getExistingPrincipal }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "localhost:3000" })),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import LoginPage from "@/app/login/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  getExistingPrincipal.mockResolvedValue(undefined);
});

async function loginMarkup() {
  return renderToStaticMarkup(
    await LoginPage({ searchParams: Promise.resolve({}) }),
  );
}

describe("LoginPage external authentication gate", () => {
  it("renders local login without calling Auth.js when bootstrap is available", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");
    authProviderConfigured.mockReturnValue(false);

    await expect(loginMarkup()).resolves.toContain("Enter local workspace");
    expect(configuredAuthSession).not.toHaveBeenCalled();
  });

  it("renders the controlled unavailable state without calling Auth.js", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "");
    authProviderConfigured.mockReturnValue(false);

    await expect(loginMarkup()).resolves.toContain(
      "Sign-in is not configured for this environment.",
    );
    await expect(loginMarkup()).resolves.not.toContain("Enter local workspace");
    expect(configuredAuthSession).not.toHaveBeenCalled();
  });

  it("keeps the Auth0 action when external authentication is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    authProviderConfigured.mockReturnValue(true);
    configuredAuthSession.mockResolvedValue(undefined);

    await expect(loginMarkup()).resolves.toContain("Continue with Auth0");
    expect(configuredAuthSession).toHaveBeenCalledOnce();
  });

  it("fails closed in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDP_GUARD_DEV_BOOTSTRAP", "1");
    authProviderConfigured.mockReturnValue(false);

    await expect(loginMarkup()).resolves.not.toContain("Enter local workspace");
  });
});
