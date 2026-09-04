import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getExistingPrincipal } from "@/lib/app-service";
import { developmentBootstrapAvailable } from "@/lib/development-bootstrap";
import { authProviderConfigured, configuredAuthSession } from "@/lib/external-auth";
import { safeReturnPath, trustedApplicationOrigin } from "@/lib/return-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next, trustedApplicationOrigin());
  if (await getExistingPrincipal()) redirect(next);
  const enabled = authProviderConfigured();
  const session = enabled ? await configuredAuthSession() : undefined;
  if (session?.user) redirect(`/api/session?next=${encodeURIComponent(next)}`);
  const callbackUrl = `/api/session?next=${encodeURIComponent(next)}`;
  const host = (await headers()).get("host");
  const localBootstrapUrl = host ? safeLocalBootstrapUrl(host, next) : undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-primary">PDP Guard</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Access your ecommerce quality workspace.
        </p>
        {params.error ? (
          <p className="mt-5 text-sm text-destructive" role="alert">
            Sign-in could not be completed. Try again.
          </p>
        ) : null}
        <div className="mt-7 space-y-3">
          {enabled ? (
            <Button asChild>
              <Link
                href={`/api/auth/signin/auth0?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Continue with Auth0
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Sign-in is not configured for this environment.
            </p>
          )}
          {localBootstrapUrl ? (
            <div>
              <Button asChild variant="outline">
                <Link href={localBootstrapUrl}>Enter local workspace</Link>
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Development-only local access
              </p>
            </div>
          ) : null}
        </div>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-muted-foreground underline"
        >
          Back to PDP Guard
        </Link>
      </section>
    </main>
  );
}

function safeLocalBootstrapUrl(host: string, next: string) {
  try {
    const requestUrl = new URL(`http://${host}`);
    if (!developmentBootstrapAvailable(requestUrl)) return undefined;
    return `/api/bootstrap?next=${encodeURIComponent(next)}`;
  } catch {
    return undefined;
  }
}
