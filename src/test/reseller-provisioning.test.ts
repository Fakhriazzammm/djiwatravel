import { describe, expect, it } from "vitest";
import { InMemoryResellerRepository } from "@/lib/reseller-repository";
import { provisionConfirmedOrder } from "@/lib/reseller-provisioning";

describe("reseller provisioning gate", () => {
  const input = { orderId: "o1", packageInfoList: [{ packageCode: "JC004", count: 1, price: 18000 }] };
  it("never calls provider before payment confirmation", async () => {
    const repo = new InMemoryResellerRepository();
    await repo.createOrder({ id: "o1", status: "PAYMENT_PENDING", totalAmount: 125000, currency: "IDR", idempotencyKey: "i1", packageCode: "JC004", createdAt: 1 });
    let calls = 0;
    await expect(provisionConfirmedOrder(repo, { provision: async () => { calls++; return { providerTransactionId: "x", status: "PENDING", payload: {} }; } }, input)).rejects.toThrow("setelah pembayaran");
    expect(calls).toBe(0);
  });
  it("calls provider only after PAYMENT_CONFIRMED", async () => {
    const repo = new InMemoryResellerRepository();
    await repo.createOrder({ id: "o1", status: "PAYMENT_CONFIRMED", totalAmount: 125000, currency: "IDR", idempotencyKey: "i1", packageCode: "JC004", createdAt: 1 });
    const result = await provisionConfirmedOrder(repo, { provision: async (draft) => ({ providerTransactionId: draft.transactionId, status: "PENDING", payload: draft }) }, input);
    expect(result.providerTransactionId).toBe("DJIWA-o1");
    expect((await repo.getOrder("o1"))?.status).toBe("PROVISIONING");
  });
});
