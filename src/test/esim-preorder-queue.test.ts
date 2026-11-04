import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), provision: vi.fn(), balance: vi.fn(), notify: vi.fn() }));
vi.mock("@/db/client.server", () => ({ pool: { query: mocks.query } }));
vi.mock("@/lib/mayar-provisioning.server", () => ({ provisionSettledTravelOrder: mocks.provision }));
vi.mock("@/lib/sellability.server", () => ({ getBalanceSnapshot: mocks.balance }));
vi.mock("@/lib/preorder-notifications.server", () => ({ notifyPreorderOrder: mocks.notify }));
import { processPreorderQueue, sweepExpiredPreorders } from "@/lib/esim-preorder-queue.server";
beforeEach(() => { vi.resetAllMocks(); mocks.balance.mockResolvedValue({ balanceUnits: 150 }); mocks.notify.mockResolvedValue({}); });
describe("paid preorder queue", () => {
  it("reserves spent balance and stops at the first order that cannot be covered", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "first" }, { id: "second" }, { id: "third" }] });
    mocks.provision.mockResolvedValueOnce({ started: true, status: "PROVISIONING", spentUnits: 100 })
      .mockResolvedValueOnce({ started: false, status: "PREORDER_WAITING_BALANCE" });
    const result = await processPreorderQueue();
    expect(mocks.provision.mock.calls).toEqual([["first", { balanceLimitUnits: 150 }], ["second", { balanceLimitUnits: 50 }]]);
    expect(result).toMatchObject({ started: 1, waitingBalance: 1 });
  });
  it("stops after an uncertain provider response before spending on later orders", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "first" }, { id: "second" }] });
    mocks.provision.mockRejectedValueOnce(new Error("provider timeout"));
    expect(await processPreorderQueue()).toMatchObject({ failed: ["first"] });
    expect(mocks.provision).toHaveBeenCalledTimes(1);
  });
  it("notifies orders moved to admin review without attempting a purchase", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "overdue" }] });
    expect(await sweepExpiredPreorders()).toEqual({ movedToReview: 1 });
    expect(mocks.notify).toHaveBeenCalledWith("overdue", "refund_review");
    expect(mocks.provision).not.toHaveBeenCalled();
  });
});
