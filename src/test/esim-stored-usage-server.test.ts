import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/db/client.server", () => ({ db: { execute } }));

import { readStoredUsageForOrders } from "@/lib/esim-stored-usage.server";

describe("stored provider usage read", () => {
  beforeEach(() => execute.mockReset());

  it("does not query when there are no authorized provider orders", async () => {
    expect(await readStoredUsageForOrders([])).toEqual(new Map());
    expect(execute).not.toHaveBeenCalled();
  });

  it("queries only authorized provider order numbers and filters unrelated returned rows", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          provider_order_no: "owned",
          total_bytes: "5000000000",
          used_bytes: "3000000000",
          remaining_bytes: "2000000000",
          measured_at: "2026-10-31T00:00:00Z",
        },
        {
          provider_order_no: "unowned",
          total_bytes: "5000000000",
          used_bytes: "1",
          remaining_bytes: "4999999999",
          measured_at: null,
        },
      ],
    });
    const result = await readStoredUsageForOrders(["owned", "owned", null]);

    expect(result.size).toBe(1);
    expect(result.get("owned")).toEqual({
      totalBytes: 5_000_000_000,
      usedBytes: 3_000_000_000,
      measuredAtMs: Date.parse("2026-10-31T00:00:00Z"),
    });
    expect(result.has("unowned")).toBe(false);
    const compiled = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(compiled.params).toEqual(["owned"]);
    expect(compiled.sql).toContain("payload->>'orderNo'");
    expect(compiled.sql).toContain("payload->'content'->>'orderNo'");
    expect(compiled.sql).toContain("notify_type = 'DATA_USAGE'");
    expect(compiled.sql).not.toContain("created_at");
    expect(compiled.sql).toContain("desc nulls last");
  });
});
