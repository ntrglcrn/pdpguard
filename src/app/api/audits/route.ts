import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuditPageTooLargeError,
  AuditTimeoutError,
  auditRunner,
} from "@/lib/audit/engine";
import { UnsafeUrlError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
});

let auditInProgress = false;

export async function POST(request: Request) {
  if (auditInProgress) {
    return NextResponse.json(
      { error: "Another audit is already running. Try again shortly." },
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
      { error: "Enter a valid product page URL." },
      { status: 400 },
    );
  }

  auditInProgress = true;
  try {
    return NextResponse.json(await auditRunner.run(parsed.data.url));
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AuditTimeoutError) {
      return NextResponse.json(
        { error: "The page took too long to audit. Try again later." },
        { status: 504 },
      );
    }
    if (error instanceof AuditPageTooLargeError) {
      return NextResponse.json(
        { error: "The page is too large to capture safely." },
        { status: 422 },
      );
    }
    console.error("Audit failed", error);
    return NextResponse.json(
      {
        error:
          "The page could not be audited. Confirm it is public and try again.",
      },
      { status: 502 },
    );
  } finally {
    auditInProgress = false;
  }
}
