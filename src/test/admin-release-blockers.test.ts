import { describe, expect, it } from "vitest";
import { classifyAdminError, maskReference } from "../lib/admin-display";
import { normalizePaymentQuery, periodDateRange } from "../lib/admin-metrics";

describe("admin release blocker contracts", () => {
  it("uses Asia/Jakarta calendar boundaries for daily, weekly, and monthly periods", () => {
    const now = new Date("2026-10-12T17:30:00.000Z"); // 2026-10-13 00:30 WIB
    expect(periodDateRange("daily", now)).toEqual({
      start: new Date("2026-10-12T17:00:00.000Z"),
      end: new Date("2026-10-13T17:00:00.000Z"),
    });
    expect(periodDateRange("weekly", now)).toEqual({
      start: new Date("2026-10-11T17:00:00.000Z"),
      end: new Date("2026-10-18T17:00:00.000Z"),
    });
    expect(periodDateRange("monthly", now)).toEqual({
      start: new Date("2026-09-30T17:00:00.000Z"),
      end: new Date("2026-10-31T17:00:00.000Z"),
    });
  });

  it("normalizes bounded server-side payment query inputs", () => {
    expect(
      normalizePaymentQuery({
        query: "  order-7  ",
        status: "FAILED",
        sort: "amount",
        dir: "asc",
        page: 2,
        pageSize: 500,
      }),
    ).toEqual({
      query: "order-7",
      status: "FAILED",
      sort: "amount",
      dir: "asc",
      page: 2,
      pageSize: 50,
    });
    expect(
      normalizePaymentQuery({ sort: "not-safe" as never, page: -1, pageSize: 0 }),
    ).toMatchObject({ sort: "updatedAt", dir: "desc", page: 0, pageSize: 50 });
  });

  it("returns only a safe reference suffix and normalized error category", () => {
    expect(maskReference("provider-secret-invoice-1234")).toBe("••••1234");
    expect(maskReference("provider-secret-invoice-1234")).not.toContain("provider-secret");
    expect(classifyAdminError("raw provider payload: timeout at https://secret.example")).toBe(
      "provider_timeout",
    );
    expect(classifyAdminError("token=super-secret unexpected response")).toBe("processing_failed");
    expect(classifyAdminError("token=super-secret unexpected response")).not.toContain(
      "super-secret",
    );
  });
});
