import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 sm:px-6">
      <section className="max-w-2xl">
        <p className="text-sm font-semibold text-primary">PDP Guard</p>
        <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Quality monitoring for ecommerce storefronts.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Detect storefront quality issues, preserve evidence, and track what
          changes between checks.
        </p>
        <Button className="mt-8" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </section>
    </main>
  );
}
