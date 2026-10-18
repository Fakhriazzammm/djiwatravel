import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectAdminAmount,
  projectAdminCount,
  projectAdminCustomer,
  projectAdminTitle,
  toAdminCustomer,
} from "@/lib/admin-display";
import { MAX_PAYMENT_PAGE, normalizePaymentQuery } from "@/lib/admin-metrics";
import {
  getAdminDashboard,
  getAdminOrderDetail,
  getAdminOrders,
  getAdminPayments,
  getAdminProvisioning,
  toSafeAdminPaymentWebhook,
  toSafeAdminProviderWebhook,
} from "@/lib/admin-read-model.server";

const { execute, requireAdmin } = vi.hoisted(() => ({
  execute: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/db/client.server", () => ({ db: { execute } }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin }));
// Exercise the actual handlers and DTO mappers without a server transport or DB.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));

describe("admin privacy projection", () => {
  it("masks every customer contact when private mode is enabled", () => {
    const customer = toAdminCustomer("person@example.com", "+62 812 3456 7890");
    expect(projectAdminCustomer(customer, true)).toEqual({
      label: "Customer — email masked",
      email: "••••",
      whatsapp: "••••",
    });
    expect(projectAdminCustomer(customer, false)).toEqual(customer);
  });

  it("masks amounts, counts, and titles without retaining sensitive tooltip values", () => {
    expect(projectAdminAmount(125000, "IDR", true)).toBe("IDR ••••");
    expect(projectAdminAmount(125000, "IDR", false)).toBe("IDR 125.000");
    expect(projectAdminCount(4, true)).toBe("••••");
    expect(projectAdminTitle("2026-10-12: 4", true)).toBeUndefined();
  });

  it("bounds absurd payment pages", () => {
    expect(normalizePaymentQuery({ page: Number.MAX_SAFE_INTEGER }).page).toBe(MAX_PAYMENT_PAGE);
    expect(normalizePaymentQuery({ page: -1 }).page).toBe(0);
  });
});

describe("admin DTO identifier contract", () => {
  it("does not expose provider event identifiers or raw references in webhook DTOs", () => {
    const payment = toSafeAdminPaymentWebhook({
      provider_event_id: "provider-secret-id",
      event_type: "payment.received",
      status: "PAID",
      amount: "125000",
      currency_code: "IDR",
      created_at: "2026-10-12T00:00:00Z",
    });
    const provider = toSafeAdminProviderWebhook({
      notify_id: "provider-secret-id",
      notify_type: "done",
    });
    expect(payment).not.toHaveProperty("providerEventId");
    expect(provider).not.toHaveProperty("notifyId");
    expect(JSON.stringify(payment)).not.toContain("provider-secret-id");
    expect(JSON.stringify(provider)).not.toContain("provider-secret-id");
  });
});

describe("admin browser DTO boundaries", () => {
  const raw = "private-provider-value-12345678";
  const orderId = "00000000-0000-0000-0000-000000000001";
  const row = {
    id: orderId,
    order_id: orderId,
    public_order_code: "ORDER-12345678",
    status: "FAILED",
    provisioning_status: "FAILED",
    order_status: "PROVISIONING_FAILED",
    payment_provider: raw,
    provider_status: raw,
    provider_event_id: raw,
    notify_id: raw,
    payment_reference: raw,
    provider_order_no: raw,
    provider_transaction_id: raw,
    provider_package_code: raw,
    processing_error: `timeout ${raw}`,
    last_error: `timeout ${raw}`,
    last_provisioning_error: `timeout ${raw}`,
    event_type: raw,
    notify_type: raw,
    currency_code: "IDR",
    total_amount: "125000",
    amount: "125000",
    attempt_count: 2,
    provisioning_attempts: 3,
  };

  beforeEach(() => {
    execute.mockReset();
    requireAdmin.mockReset();
  });

  function assertSafe(value: unknown) {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(raw);
    // UUIDs are permitted only in navigation links.
    if (Array.isArray(value)) return value.forEach(assertSafe);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      expect([
        "paymentProvider",
        "providerStatus",
        "providerEventId",
        "notifyId",
        "providerOrderNo",
        "providerTransactionId",
        "provider",
        "id",
        "orderId",
      ]).not.toContain(key);
      if (key === "detailHref") {
        expect(child).toBe(`/admin/orders/${orderId}`);
      } else {
        if (typeof child === "string") expect(child).not.toContain(orderId);
        assertSafe(child);
      }
    }
  }

  async function call(handler: unknown, data: object = {}) {
    return (handler as (args: { data: object }) => Promise<unknown>)({ data });
  }

  it("returns a deliberate not-found result for an invalid order id without querying SQL", async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await call(getAdminOrderDetail, { id: "not-a-uuid" })).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(requireAdmin).toHaveBeenCalledOnce();
  });

  it("projects order lists without raw payment or provider fields", async () => {
    execute.mockResolvedValue({ rows: [row] });
    const orders = await call(getAdminOrders);
    assertSafe(orders);
    expect(orders).toMatchObject([{ totalAmount: 125000, paymentProviderLabel: null }]);
    expect(requireAdmin).toHaveBeenCalledOnce();
  });

  it("projects detail, items, and nested payment/provider webhooks safely", async () => {
    execute.mockResolvedValueOnce({ rows: [row] });
    execute.mockResolvedValue({ rows: [row] });
    const detail = await call(getAdminOrderDetail, { id: orderId });
    assertSafe(detail);
    expect(detail).toMatchObject({
      provisioning: { status: "FAILED", attemptCount: 2, lastError: "provider_timeout" },
      items: [{ packageName: "Paket belum tersedia" }],
      payment: {
        providerLabel: null,
        webhooks: [{ processingError: "provider_timeout", eventType: null }],
      },
      providerWebhooks: [{ processingError: "provider_timeout", notifyType: null }],
    });
  });

  it("projects payment exceptions without raw provider fields or errors", async () => {
    execute.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    execute.mockResolvedValueOnce({ rows: [row] });
    const payments = await call(getAdminPayments);
    assertSafe(payments);
    expect(payments).toMatchObject({
      rows: [{ lastError: "provider_timeout", eventType: null }],
      total: 1,
    });
  });

  it("projects provisioning exceptions without raw provider status or errors", async () => {
    execute.mockResolvedValue({ rows: [row] });
    const provisioning = await call(getAdminProvisioning);
    assertSafe(provisioning);
    expect(provisioning).toMatchObject([{ status: "FAILED", lastError: "provider_timeout" }]);
  });

  it("projects dashboard exceptions without leaking extra database fields", async () => {
    execute.mockResolvedValue({ rows: [row] });
    const dashboard = await call(getAdminDashboard, { period: "daily" });
    assertSafe(dashboard);
    expect(dashboard).toMatchObject({ items: [{ status: "FAILED", amount: 125000 }] });
  });

  it("preserves only allowlisted provider labels and webhook display values", async () => {
    execute.mockResolvedValue({ rows: [{ ...row, payment_provider: "mayar" }] });
    expect(await call(getAdminOrders)).toMatchObject([{ paymentProviderLabel: "Mayar" }]);
    expect(toSafeAdminPaymentWebhook({ ...row, event_type: "payment.received" })).toMatchObject({
      eventType: "payment.received",
      processingError: "provider_timeout",
    });
    expect(toSafeAdminProviderWebhook({ ...row, notify_type: "SMDP_EVENT" })).toMatchObject({
      notifyType: "SMDP_EVENT",
      processingError: "provider_timeout",
    });
  });
});
