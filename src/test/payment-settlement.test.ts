import { describe, expect, it } from "vitest";
import { InMemoryResellerRepository } from "@/lib/reseller-repository";
import { settlePaidPayment } from "@/lib/payment-settlement";

describe("payment settlement", () => {
  it("confirms only a matching PAID event and deduplicates it", async () => {
    const repo = new InMemoryResellerRepository();
    await repo.createOrder({
      id: "o1",
      status: "PAYMENT_PENDING",
      totalAmount: 125000,
      currency: "IDR",
      idempotencyKey: "i1",
      packageCode: "JC004",
      createdAt: 1,
    });
    const event = {
      eventId: "evt-1",
      orderId: "o1",
      status: "PAID" as const,
      amountIdr: 125000,
      occurredAt: "2026-10-04T00:00:00Z",
    };
    expect((await settlePaidPayment(repo, event, 125000)).order?.status).toBe("PAYMENT_CONFIRMED");
    expect((await settlePaidPayment(repo, event, 125000)).duplicate).toBe(true);
  });
  it("rejects amount mismatch", async () => {
    const repo = new InMemoryResellerRepository();
    await repo.createOrder({
      id: "o1",
      status: "PAYMENT_PENDING",
      totalAmount: 125000,
      currency: "IDR",
      idempotencyKey: "i1",
      packageCode: "JC004",
      createdAt: 1,
    });
    await expect(
      settlePaidPayment(
        repo,
        {
          eventId: "evt-1",
          orderId: "o1",
          status: "PAID",
          amountIdr: 1,
          occurredAt: "2026-10-04T00:00:00Z",
        },
        125000,
      ),
    ).rejects.toThrow("tidak cocok");
  });
});
