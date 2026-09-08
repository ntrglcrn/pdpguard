import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { getAppContext } from "@/lib/app-service";
import { logoutAction } from "@/app/actions";

// Session and workspace data are request-bound; never pre-render them at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { workspace } = await getAppContext();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/stores"
            className="flex min-w-0 items-center gap-2 rounded-md font-heading font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="PDP Guard stores"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate">PDP Guard</span>
          </Link>
          <nav className="ml-2" aria-label="Primary navigation">
            <Link
              href="/stores"
              aria-current="page"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-interactive hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Stores
            </Link>
          </nav>
          <Badge variant="outline" className="ml-auto max-w-48 truncate">
            {workspace.name}
          </Badge>
          <Link
            href="/account"
            className="rounded-lg p-2 text-muted-foreground hover:bg-interactive hover:text-foreground"
            aria-label="Account"
          >
            <UserRound className="size-4" />
          </Link>
          <form action={logoutAction}>
            <button
              className="rounded-lg p-2 text-muted-foreground hover:bg-interactive hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
