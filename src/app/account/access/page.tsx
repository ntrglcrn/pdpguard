import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NoWorkspaceAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <section className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-primary">PDP Guard</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">
          No workspace access
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your account does not have access to a PDP Guard workspace yet.
          Contact your workspace administrator to request access.
        </p>
        <Button className="mt-7" asChild>
          <Link href="/">Back to PDP Guard</Link>
        </Button>
      </section>
    </main>
  );
}
