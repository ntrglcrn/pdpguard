import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { StoreForm } from "@/components/store-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewStorePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/stores">
          <ChevronLeft data-icon="inline-start" aria-hidden="true" /> Stores
        </Link>
      </Button>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Store setup
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Add store
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          PDP Guard stores the validated origin and derives a name when you
          leave it blank.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Store details</CardTitle>
          <CardDescription>
            Private or local network addresses are rejected by the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreForm />
        </CardContent>
      </Card>
    </div>
  );
}
