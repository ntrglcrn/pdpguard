import { ArrowRight, Plus, Store as StoreIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listStoresForApp } from "@/lib/app-service";

export default async function StoresPage() {
  const { stores, workspace } = await listStoresForApp();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {workspace.name}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Stores
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Keep product page audits attached to the store they belong to.
          </p>
        </div>
        <Button asChild>
          <Link href="/stores/new">
            <Plus data-icon="inline-start" aria-hidden="true" /> Add store
          </Link>
        </Button>
      </div>

      {stores.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Card key={store.id}>
              <CardHeader>
                <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <StoreIcon className="size-4" aria-hidden="true" />
                </span>
                <CardTitle>{store.name}</CardTitle>
                <CardDescription className="break-words font-mono text-xs [overflow-wrap:anywhere]">
                  {store.url}
                </CardDescription>
                <CardAction>
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      href={`/stores/${store.id}`}
                      aria-label={`Open ${store.name}`}
                    >
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Added{" "}
                  <time dateTime={store.createdAt}>
                    {new Date(store.createdAt).toLocaleDateString()}
                  </time>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No stores yet</CardTitle>
            <CardDescription>
              Add a public store origin to start running product page audits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/stores/new">Add your first store</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
