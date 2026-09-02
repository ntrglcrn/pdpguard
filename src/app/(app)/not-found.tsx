import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle as="h1">Resource not found</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          It may have been removed, or you may not have access to it.
        </p>
        <Button asChild>
          <Link href="/stores">Back to stores</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
