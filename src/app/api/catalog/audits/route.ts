import { NextResponse } from "next/server";
import { z } from "zod";

import { summarizeBatchItems, type BatchAuditItem } from "@/domain/catalog";
import { auditRunner } from "@/lib/audit/engine";
import { runAuditExclusive } from "@/lib/audit/exclusive";
import { publicAuditFailure } from "@/lib/audit/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(2_048)).min(1).max(5),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
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
      { error: "Select between one and five valid product page URLs." },
      { status: 400 },
    );
  }

  try {
    const batch = await runAuditExclusive(async () => {
      const startedAt = new Date().toISOString();
      const items: BatchAuditItem[] = [];
      for (const url of [...new Set(parsed.data.urls)]) {
        try {
          items.push({ url, result: await auditRunner.run(url), error: null });
        } catch (error) {
          const failure = publicAuditFailure(error);
          if (!failure.known) console.error("Batch audit item failed", error);
          items.push({ url, result: null, error: failure.message });
        }
      }
      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        items,
        counts: summarizeBatchItems(items),
      };
    });
    return NextResponse.json(batch);
  } catch (error) {
    const failure = publicAuditFailure(error);
    if (!failure.known) console.error("Batch audit failed", error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
