export function authProviderConfigured() {
  return Boolean(
    process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_ISSUER &&
      process.env.AUTH_SECRET &&
      process.env.AUTH_URL,
  );
}

export async function configuredAuthSession() {
  if (!authProviderConfigured()) return undefined;
  return (await import("../../auth")).auth();
}
