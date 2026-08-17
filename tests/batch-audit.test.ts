import { describe, expect, it } from "vitest";

import { summarizeBatchItems, type BatchAuditItem } from "@/domain/catalog";
import { AuditBusyError, runAuditExclusive } from "@/lib/audit/exclusive";

describe("batch audit", () => {
  it("aggregates page-level statuses and failures", () => {
    const item = (status: "critical" | "warning" | "passed") =>
      ({ result: { summary: { status } }, error: null }) as BatchAuditItem;
    expect(
      summarizeBatchItems([
        item("critical"),
        item("warning"),
        item("passed"),
        { url: "https://shop.example/failed", result: null, error: "Failed" },
      ]),
    ).toEqual({
      completed: 3,
      failed: 1,
      critical: 1,
      warning: 1,
      passed: 1,
    });
  });

  it("rejects overlapping audit runs", async () => {
    let release!: () => void;
    const first = runAuditExclusive(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await expect(
      runAuditExclusive(async () => undefined),
    ).rejects.toBeInstanceOf(AuditBusyError);
    release();
    await first;
  });
});
