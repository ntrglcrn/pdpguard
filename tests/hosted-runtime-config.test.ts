import { describe, expect, it } from "vitest";

import { hostedRuntimeConfig } from "@/lib/hosted-runtime-config";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://db.example/pdpguard",
  PDP_GUARD_ARTIFACT_BUCKET: "pdpguard-private",
  AWS_REGION: "eu-central-1",
  AUTH0_CLIENT_ID: "client",
  AUTH0_CLIENT_SECRET: "secret",
  AUTH0_ISSUER: "https://tenant.example",
  AUTH_SECRET: "secret",
  AUTH_URL: "https://app.example",
} as NodeJS.ProcessEnv;

describe("hostedRuntimeConfig", () => {
  it("has no production local fallback", () => {
    expect(() => hostedRuntimeConfig({ NODE_ENV: "production" })).toThrow("DATABASE_URL");
  });

  it("does not require deployment secrets during the Next build phase", () => {
    expect(hostedRuntimeConfig({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBeNull();
  });

  it("requires web authentication configuration", () => {
    const missing = { ...production };
    delete missing.AUTH_SECRET;
    expect(() => hostedRuntimeConfig(missing)).toThrow("AUTH_SECRET");
  });

  it("requires a unique worker identity without web credentials", () => {
    expect(() => hostedRuntimeConfig({ ...production, PDP_GUARD_WORKER_ID: undefined }, "worker")).toThrow("PDP_GUARD_WORKER_ID");
    expect(hostedRuntimeConfig({
      NODE_ENV: "production",
      DATABASE_URL: production.DATABASE_URL,
      PDP_GUARD_ARTIFACT_BUCKET: production.PDP_GUARD_ARTIFACT_BUCKET,
      AWS_REGION: production.AWS_REGION,
      PDP_GUARD_WORKER_ID: "worker-123",
    }, "worker")).toMatchObject({ workerId: "worker-123" });
  });
});
