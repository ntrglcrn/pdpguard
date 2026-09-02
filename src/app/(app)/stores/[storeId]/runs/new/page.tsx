import Link from "next/link";
import { notFound } from "next/navigation";

import { RunForm } from "@/components/run-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoreForApp } from "@/lib/app-service";

export default async function NewRunPage({
  params,
}: PageProps<"/stores/[storeId]/runs/new">) {
  const { storeId } = await params;
  const data = await getStoreForApp(storeId);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link
          href="/stores"
          className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Stores
        </Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={`/stores/${data.store.id}`}
          className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {data.store.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">New run</span>
      </nav>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {data.store.name}
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Run an audit
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Check one product page in a mobile viewport. The run and its evidence
          are saved when it finishes.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Audit target</CardTitle>
          <CardDescription>
            The audit runs synchronously and can take several seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunForm storeId={data.store.id} storeUrl={data.store.url} />
        </CardContent>
      </Card>
    </div>
  );
}
