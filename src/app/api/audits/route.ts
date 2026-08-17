import { NextResponse } from "next/server";
import { z } from "zod";

import { auditRunner } from "@/lib/audit/engine";
import { runAuditExclusive } from "@/lib/audit/exclusive";
import { publicAuditFailure } from "@/lib/audit/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2_048),
  testAddToCart: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
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

  try {
    return NextResponse.json(
      await runAuditExclusive(() =>
        auditRunner.run(parsed.data.url, {
          testAddToCart: parsed.data.testAddToCart,
        }),
      ),
    );
  } catch (error) {
    const failure = publicAuditFailure(error);
    if (!failure.known) console.error("Audit failed", error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
