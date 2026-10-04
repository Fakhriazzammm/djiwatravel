import { describe, expect, it } from "vitest";
import { InMemoryResellerRepository } from "@/lib/reseller-repository";

describe("reseller repository contract", () => {
  it("enforces idempotency in the development adapter", async () => {
    const repo = new InMemoryResellerRepository();
    const order = { id: "o1", status: "PAYMENT_PENDING" as const, totalAmount: 22_000, currency: "IDR" as const, idempotencyKey: "payment-1", packageCode: "JC004", createdAt: 1 };
    await repo.createOrder(order);
    await expect(repo.createOrder({ ...order, id: "o2" })).rejects.toThrow("idempotency");
  });
});
