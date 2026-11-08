import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));

async function load() {
  vi.resetModules();
  return import("@/lib/flight-earnings.server");
}

const actions = {
  count: 3,
  actions: [
    {
      action_state: "processing",
      profit: "1.50",
      description: "Bali, Aviasales",
      booked_at: "2026-11-05 10:00:00",
    },
    { action_state: "paid", profit: "2.25", description: "Tokyo", booked_at: "2026-11-01 10:00:00" },
    { action_state: "cancelled", profit: "0", description: "x", booked_at: "2026-10-30 10:00:00" },
  ],
};

describe("summarizeEarnings", () => {
  it("sums commission per state and reads balance and payout in USD", async () => {
    const { summarizeEarnings } = await load();
    const out = summarizeEarnings(
      { balance: { usd: "10.5" } },
      { next_payout: { usd: "3" } },
      actions,
    );
    expect(out.balance).toBe(10.5);
    expect(out.nextPayout).toBe(3);
    expect(out.bookings).toBe(3);
    expect(out.profit).toEqual({ paid: 2.25, processing: 1.5, cancelled: 0 });
    expect(out.count.cancelled).toBe(1);
    expect(out.truncated).toBe(false);
  });

  it("survives unknown shapes", async () => {
    const { summarizeEarnings } = await load();
    const out = summarizeEarnings(null, "x", { actions: [null, 5] });
    expect(out.balance).toBeNull();
    expect(out.bookings).toBe(2);
  });
});

describe("getFlightEarningsHandler", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("get_user_balance")
          ? { balance: { usd: "5" } }
          : String(url).includes("next_payout")
            ? { next_payout: { usd: "1" } }
            : actions,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is unconfigured without a token and calls nothing", async () => {
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "");
    const { getFlightEarningsHandler } = await load();
    expect((await getFlightEarningsHandler()).status).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the token as a header only and caches the result", async () => {
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "secret-token");
    const { getFlightEarningsHandler } = await load();
    const first = await getFlightEarningsHandler();
    expect(first.balance).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("secret-token");
      expect(init.headers["X-Access-Token"]).toBe("secret-token");
    }
    await getFlightEarningsHandler();
    await getFlightEarningsHandler({ refresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports failed when the provider errors and nothing is cached", async () => {
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "t");
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getFlightEarningsHandler } = await load();
    expect((await getFlightEarningsHandler()).status).toBe("failed");
  });
});
