import { describe, expect, it } from "vitest";
import {
  projectAdminAmount,
  projectAdminCount,
  projectAdminCustomer,
  projectAdminTitle,
  toAdminCustomer,
} from "@/lib/admin-display";
import { MAX_PAYMENT_PAGE, normalizePaymentQuery } from "@/lib/admin-metrics";
import {
  toSafeAdminPaymentWebhook,
  toSafeAdminProviderWebhook,
} from "@/lib/admin-read-model.server";

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
