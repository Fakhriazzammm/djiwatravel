import { describe, expect, it, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("../db/client.server", () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock("../lib/customer-session.fn", () => ({
  getAuthenticatedUser: async () => ({ id: "user-1", email: "a@b.co" }),
}));

import {
  getTravelStateHandler,
  saveNotifyPreferenceHandler,
  saveTripPlanHandler,
  saveTripPlanInput,
} from "../lib/customer-travel-state.server";

const orderId = "0b8f6c1e-2f4a-4d8e-9a3b-1c2d3e4f5a6b";

describe("customer travel state", () => {
  beforeEach(() => query.mockReset());

  it("scopes the write to the session owner and the owned order", async () => {
    query.mockResolvedValue({ rows: [{ order_id: orderId }], rowCount: 1 });
    const data = saveTripPlanInput({
      orderId,
      departureDate: "2026-12-01",
      completed: { bogus: 1 },
      updatedAt: 10,
    });
    const result = await saveTripPlanHandler({ data });
    expect(result.saved).toBe(true);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain("o.customer_auth_subject = $1");
    expect(params[0]).toBe("user-1");
    expect(params[3]).toBe("{}"); // unknown checklist keys are dropped
  });

  it("reports an ignored write when the order is not owned or the copy is stale", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    const data = saveTripPlanInput({ orderId, departureDate: null, completed: {}, updatedAt: 1 });
    expect((await saveTripPlanHandler({ data })).saved).toBe(false);
  });

  it("rejects an invalid departure date", () => {
    expect(() =>
      saveTripPlanInput({ orderId, departureDate: "2026-13-45", completed: {}, updatedAt: 1 }),
    ).toThrow();
  });

  it("reads plans and the notification choice for the session owner only", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { order_id: orderId, departure_date: "2026-12-01", completed: {}, client_updated_at: "5" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ esim_notify: true }] });
    const state = await getTravelStateHandler();
    expect(state.esimNotify).toBe(true);
    expect(state.tripPlans[0]).toMatchObject({ orderId, departureDate: "2026-12-01", updatedAt: 5 });
    expect(query.mock.calls.every(([, params]) => params[0] === "user-1")).toBe(true);
  });

  it("stores the notification choice under the session owner", async () => {
    query.mockResolvedValue({ rows: [] });
    await saveNotifyPreferenceHandler({ data: { enabled: true } });
    expect(query.mock.calls[0]![1]).toEqual(["user-1", true]);
  });
});
