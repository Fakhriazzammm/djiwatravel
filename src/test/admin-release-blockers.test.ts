import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyAdminError, maskReference } from "../lib/admin-display";
import { normalizePaymentQuery, periodDateRange } from "../lib/admin-metrics";
import {
  toSafeAdminPaymentWebhook,
  toSafeAdminProviderWebhook,
} from "../lib/admin-read-model.server";
import {
  projectAdminIdentifier,
  projectAdminPrivacy,
  projectAdminTitle,
} from "../lib/admin-display";

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

  it("projects payment/provider webhook rows without raw identifiers or errors", () => {
    const payment = toSafeAdminPaymentWebhook({
      provider_event_id: "evt-secret-123",
      event_type: "payment.received",
      status: "FAILED",
      processing_error: "raw provider token=secret",
      amount: "1200",
      created_at: "2026-10-12T00:00:00Z",
    });
    const provider = toSafeAdminProviderWebhook({
      notify_id: "notify-secret-456",
      notify_type: "ESIM_STATUS",
      processing_error: "provider payload secret",
    });
    expect(payment).not.toHaveProperty("eventId");
    expect(provider).not.toHaveProperty("notifyId");
    expect(JSON.stringify(payment)).not.toContain("evt-secret-123");
    expect(JSON.stringify(provider)).not.toContain("notify-secret-456");
    expect(payment.processingError).toBe("processing_failed");
    expect(provider.processingError).toBe("processing_failed");
  });

  it("keeps dashboard payment exception KPI on an independent exact count query", () => {
    const source = readFileSync("src/lib/admin-read-model.server.ts", "utf8");
    expect(source).toContain("select count(*)::int as total from public.payment_webhook_events");
    expect(source).toContain("paymentExceptionCountResult");
    expect(source).toContain("limit ${LIMIT}");
  });

  it("uses one privacy projection for identifiers, counts, and DOM titles", () => {
    expect(projectAdminIdentifier("ORDER-SECRET", true)).toBe("••••");
    expect(projectAdminPrivacy(123456, true)).toBe("••••");
    expect(projectAdminTitle("ORDER-SECRET: 123456", true)).toBeUndefined();
    expect(projectAdminTitle("ORDER-SECRET: 123456", false)).toContain("123456");
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
