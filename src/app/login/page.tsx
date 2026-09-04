import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, authProviderConfigured } from "../../../auth";
import { Button } from "@/components/ui/button";
import { getExistingPrincipal } from "@/lib/app-service";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getExistingPrincipal()) redirect(next);
  const session = await auth();
  if (session?.user) redirect(`/api/session?next=${encodeURIComponent(next)}`);
  const enabled = authProviderConfigured();
  const callbackUrl = `/api/session?next=${encodeURIComponent(next)}`;
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
        <div className="mt-7">
          {enabled ? (
            <Button asChild>
              <Link
                href={`/api/auth/signin/auth0?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Continue to sign in
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Sign-in is not configured for this environment.
            </p>
          )}
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

function safeNext(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/stores";
}
