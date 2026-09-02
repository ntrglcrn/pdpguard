"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorState({ reset }: { reset: () => void }) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
        <CardTitle as="h1">We could not load this page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Try the request again. If it still fails, return to your stores.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/stores">Back to stores</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
