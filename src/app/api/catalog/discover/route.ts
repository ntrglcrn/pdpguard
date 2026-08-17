import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CatalogDiscoveryError,
  CatalogDiscoveryTimeoutError,
  discoverCatalog,
} from "@/lib/catalog-discovery";
import {
  CategoryDiscoveryTimeoutError,
  discoverCategory,
} from "@/lib/category-discovery";
import { UnsafeUrlError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
});

let discoveryInProgress = false;

export async function POST(request: Request) {
  if (discoveryInProgress) {
    return NextResponse.json(
      { error: "Another catalog discovery is already running." },
      { status: 429 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) {
    return NextResponse.json(
      { error: "The request body is too large." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid sitemap or category URL." },
      { status: 400 },
    );
  }

  discoveryInProgress = true;
  try {
    const result = /\.xml(?:\.gz)?(?:[?#]|$)/i.test(parsed.data.url)
      ? await discoverCatalog(parsed.data.url)
      : await discoverCategory(parsed.data.url);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof CatalogDiscoveryTimeoutError ||
      error instanceof CategoryDiscoveryTimeoutError
    ) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }
    if (error instanceof CatalogDiscoveryError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Catalog discovery failed", error);
    return NextResponse.json(
      {
        error:
          "The catalog source could not be read. Confirm it is public and try again.",
      },
      { status: 502 },
    );
  } finally {
    discoveryInProgress = false;
  }
}
