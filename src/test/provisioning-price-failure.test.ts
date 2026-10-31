import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), prices: vi.fn(), order: vi.fn() }));
vi.mock("@/db/client.server", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/lib/esim-access", () => ({
  fetchEsimAccessPackagePrices: mocks.prices,
  orderEsimAccessProfilesServer: mocks.order,
}));

import { provisionSettledTravelOrder } from "@/lib/mayar-provisioning.server";

describe("provisioning price lookup failure", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["catalog", "order update"])(
    "recovers from a failed %s so the admin can retry",
    async (failure) => {
      const dialect = new PgDialect();
      let queue = "PENDING";
      let order = "PAYMENT_CONFIRMED";
      let failOrderUpdate = failure === "order update";
      mocks.execute.mockImplementation(async (statement) => {
        const query = dialect.sqlToQuery(statement).sql;
        if (query.startsWith("select id, status, provider_transaction_id"))
          return {
            rows:
              queue === "PENDING"
                ? []
                : [
                    {
                      status: queue,
                      provider_transaction_id: "DJIWA-00000000-0000-4000-8000-000000000001",
                    },
                  ],
          };
        if (query.startsWith("select status from public.customer_orders"))
          return { rows: [{ status: order }] };
        if (query.startsWith("select provider_package_code"))
          return { rows: [{ provider_package_code: "JP", quantity: 1, provider_unit_cost: 100 }] };
        if (query.includes("set status = 'PROVISIONING', lease_owner")) {
          queue = "PROVISIONING";
          return { rows: [{ id: "queue" }] };
        }
        if (query.includes("customer_orders set status = 'PROVISIONING'")) {
          if (failOrderUpdate) {
            failOrderUpdate = false;
            throw new Error("database temporarily unavailable");
          }
          order = "PROVISIONING";
        }
        if (query.includes("esim_provisioning_orders set status = 'FAILED'")) {
          queue = "FAILED";
          return { rows: [{ id: "queue" }] };
        }
        if (query.includes("customer_orders set status = 'PROVISIONING_FAILED'"))
          order = "PROVISIONING_FAILED";
        return { rows: [] };
      });
      if (failure === "catalog")
        mocks.prices.mockRejectedValueOnce(new Error("provider secret detail"));
      mocks.prices.mockResolvedValueOnce({ JP: 100 });
      mocks.order.mockResolvedValue({ success: true, obj: { orderNo: "provider-order" } });

      await expect(
        provisionSettledTravelOrder("00000000-0000-4000-8000-000000000001"),
      ).rejects.toThrow(failure === "catalog" ? "esim_catalog_unavailable" : "provisioning_failed");
      expect(queue).toBe("FAILED");
      expect(order).toBe("PROVISIONING_FAILED");
      expect(mocks.order).not.toHaveBeenCalled();
      await expect(
        provisionSettledTravelOrder("00000000-0000-4000-8000-000000000001"),
      ).resolves.toMatchObject({ started: true, status: "PROVISIONING" });
      expect(mocks.order).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "DJIWA-00000000-0000-4000-8000-000000000001" }),
      );
    },
  );
});
