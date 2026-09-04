export type RuntimeMode = "development" | "test" | "production";

export interface HostedRuntimeConfig {
  databaseUrl: string;
  artifactBucket: string;
  artifactRegion: string;
  artifactEndpoint?: string;
  workerId?: string;
}

export function runtimeMode(env = process.env): RuntimeMode {
  return env.NODE_ENV === "production"
    ? "production"
    : env.NODE_ENV === "test"
      ? "test"
      : "development";
}

/** Production has no local infrastructure fallback. */
export function hostedRuntimeConfig(
  env = process.env,
  role: "web" | "worker" = "web",
): HostedRuntimeConfig | null {
  if (runtimeMode(env) !== "production") return null;
  const required = ["DATABASE_URL", "PDP_GUARD_ARTIFACT_BUCKET", "AWS_REGION"] as const;
  const missing: string[] = required.filter((key) => !env[key]);
  if (role === "web")
    for (const key of ["AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_ISSUER", "AUTH_SECRET", "AUTH_URL"])
      if (!env[key]) missing.push(key);
  if (role === "worker" && !env.PDP_GUARD_WORKER_ID)
    missing.push("PDP_GUARD_WORKER_ID");
  if (missing.length)
    throw new Error(`Hosted runtime configuration is missing: ${missing.join(", ")}`);
  if (env.PDP_GUARD_DEV_BOOTSTRAP === "1")
    throw new Error("PDP_GUARD_DEV_BOOTSTRAP is unavailable in production.");
  return {
    databaseUrl: env.DATABASE_URL!,
    artifactBucket: env.PDP_GUARD_ARTIFACT_BUCKET!,
    artifactRegion: env.AWS_REGION!,
    artifactEndpoint: env.PDP_GUARD_ARTIFACT_ENDPOINT,
    workerId: env.PDP_GUARD_WORKER_ID,
  };
}
