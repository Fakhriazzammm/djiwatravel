import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { createCustomerNotification } from "@/lib/push.server";
import { DEFAULT_FLIGHTS_CONFIG } from "@/lib/flights";

const flights = vi.hoisted(() => ({ config: {} as Record<string, unknown>, month: vi.fn() }));
vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: vi.fn(async () => "a@x.id") }));
vi.mock("@/lib/push.server", () => ({
  createCustomerNotification: vi.fn(async () => ({ created: true, notificationId: "n", sent: 0 })),
}));
vi.mock("@/lib/flights.server", () => ({
  getFlightsConfigHandler: vi.fn(async () => ({ ...DEFAULT_FLIGHTS_CONFIG, ...flights.config })),
  fetchMonthOffers: (...args: unknown[]) => flights.month(...args),
}));
const addItem = vi.hoisted(() => vi.fn());
vi.mock("@/lib/my-trips.server", () => ({ addItineraryItem: addItem }));

const query = vi.mocked(pool.query);
const user = vi.mocked(getAuthenticatedUser);
const notify = vi.mocked(createCustomerNotification);

const alertInput = {
  origin: "CGK",
  destination: "TYO",
  originName: "Jakarta",
  destinationName: "Tokyo",
  departureDate: "2999-12-20",
  flexible: true,
  targetIdr: 3_200_000,
};
const snap = {
  id: "o1",
  origin: "CGK",
  destination: "HND",
  departureAt: "2999-12-20T22:10:00+07:00",
  returnAt: "2999-12-27T23:55:00+09:00",
  priceIdr: 3_000_000,
  airlineName: "Scoot",
  airline: "TR",
  flightNumber: "285",
};

async function load() {
  return import("@/lib/flight-features.server");
}

beforeEach(() => {
  query.mockReset();
  notify.mockClear();
  addItem.mockReset();
  flights.config = {};
  flights.month.mockReset();
  user.mockResolvedValue({ id: "sub-1" } as never);
});

describe("price alerts", () => {
  it("refuses a guest and a switched-off feature", async () => {
    const { createFlightAlertHandler } = await load();
    user.mockRejectedValueOnce(new Error("no session"));
    await expect(createFlightAlertHandler({ data: alertInput })).rejects.toThrow();
    flights.config = { priceAlerts: false };
    await expect(createFlightAlertHandler({ data: alertInput })).rejects.toThrow(/dimatikan/);
    expect(query).not.toHaveBeenCalled();
  });

  it("stops at the member's allowance and never takes the owner from the request", async () => {
    const { createFlightAlertHandler } = await load();
    flights.config = { alertsPerMember: 2 };
    query.mockResolvedValueOnce({ rows: [{ n: 2 }] } as never);
    await expect(createFlightAlertHandler({ data: alertInput })).rejects.toThrow(/Maksimal 2/);
    query.mockResolvedValueOnce({ rows: [{ n: 0 }] } as never).mockResolvedValueOnce({
      rows: [{ id: "a1" }],
    } as never);
    await createFlightAlertHandler({ data: alertInput });
    expect(query.mock.calls.at(-1)![1]![0]).toBe("sub-1");
  });
});

describe("alert sweep", () => {
  const due = {
    id: "a1",
    customer_auth_subject: "sub-1",
    origin: "CGK",
    destination: "TYO",
    origin_name: "Jakarta",
    destination_name: "Tokyo",
    departure_date: "2999-12-20",
    flexible: true,
    target_idr: 3_200_000,
    notified_price_idr: null,
  };
  const fare = (day: string, price: number) => ({
    departureAt: `${day}T10:00:00+07:00`,
    priceIdr: price,
  });

  it("notifies once for a price at or under target inside the window", async () => {
    const { sweepFlightAlerts } = await load();
    query.mockResolvedValue({ rows: [] } as never);
    query
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [due] } as never);
    flights.month.mockResolvedValue([fare("2999-12-18", 3_100_000), fare("2999-12-30", 1_000_000)]);
    const result = await sweepFlightAlerts();
    expect(result).toMatchObject({ checked: 1, notified: 1, failed: 0 });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "sub-1",
        type: "trip_flight_price",
        eventKey: "flight-alert:a1:3100000",
        href: "/tiket?dari=CGK&ke=TYO&berangkat=2999-12-18",
      }),
    );
  });

  it("stays quiet when the price is above target or was already announced", async () => {
    const { sweepFlightAlerts } = await load();
    query.mockResolvedValue({ rows: [] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({
      rows: [due, { ...due, id: "a2", notified_price_idr: 3_100_000 }],
    } as never);
    flights.month
      .mockResolvedValueOnce([fare("2999-12-20", 3_900_000)])
      .mockResolvedValueOnce([fare("2999-12-20", 3_100_000)]);
    const result = await sweepFlightAlerts();
    expect(result.notified).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps going when one alert fails, and does nothing when switched off", async () => {
    const { sweepFlightAlerts } = await load();
    query.mockResolvedValue({ rows: [] } as never);
    query.mockResolvedValueOnce({ rows: [] } as never).mockResolvedValueOnce({
      rows: [due, { ...due, id: "a2" }],
    } as never);
    flights.month
      .mockRejectedValueOnce(new Error("provider 500"))
      .mockResolvedValueOnce([fare("2999-12-20", 3_000_000)]);
    const result = await sweepFlightAlerts();
    expect(result).toMatchObject({ failed: 1, notified: 1 });
    flights.config = { priceAlerts: false };
    query.mockClear();
    expect(await sweepFlightAlerts()).toMatchObject({ checked: 0 });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("save to trip", () => {
  it("checks the trip belongs to the member and adds one item per leg", async () => {
    const { saveFlightToTripHandler } = await load();
    const tripId = "11111111-1111-4111-8111-111111111111";
    query.mockResolvedValueOnce({ rows: [] } as never);
    await expect(saveFlightToTripHandler({ data: { tripId, offer: snap } })).rejects.toThrow(
      /tidak ditemukan/,
    );
    expect(addItem).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] } as never);
    addItem.mockResolvedValue({ id: "i" });
    const result = await saveFlightToTripHandler({ data: { tripId, offer: snap } });
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(addItem.mock.calls[0]![0]).toMatchObject({
      tripId,
      activityDate: "2999-12-20",
      startTime: "22:10",
      activityCategory: "flight",
    });
    expect(result.dates).toEqual(["2999-12-20", "2999-12-27"]);
    await expect(
      saveFlightToTripHandler({ data: { tripId, offer: { ...snap, origin: "??" } } }),
    ).rejects.toThrow(/tidak valid/);
  });
});

describe("shared fares", () => {
  const token = "abcdefghijklmnop1234";
  it("stores only validated snapshots, with an expiry from Admin's setting", async () => {
    const { createFlightShareHandler } = await load();
    flights.config = { shareDays: 3 };
    query
      .mockResolvedValueOnce({ rows: [{ n: 0 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    const res = await createFlightShareHandler({ data: { offers: [snap, { junk: true }] } });
    expect(res.days).toBe(3);
    const insert = query.mock.calls.at(-1)!;
    expect(JSON.parse(insert[1]![2] as string)).toHaveLength(1);
    expect(insert[1]![3]).toBe("3");
  });

  it("lets a guest look but not vote, and a member vote only for a shared fare", async () => {
    const { getFlightShareHandler, voteFlightShareHandler } = await load();
    query
      .mockResolvedValueOnce({
        rows: [{ offers: [{ ...snap }], expires_at: "2999-01-01" }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ offer_id: "o1", n: 2 }] } as never);
    user.mockRejectedValueOnce(new Error("guest"));
    const view = await getFlightShareHandler({ data: { token } });
    expect(view).toMatchObject({ signedIn: false, mine: null, counts: { o1: 2 } });
    query.mockResolvedValueOnce({ rows: [{ offers: [{ id: "o1" }] }] } as never);
    await expect(voteFlightShareHandler({ data: { token, offerId: "zzz" } })).rejects.toThrow(
      /tidak ada/,
    );
    query
      .mockResolvedValueOnce({ rows: [{ offers: [{ id: "o1" }] }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    await expect(voteFlightShareHandler({ data: { token, offerId: "o1" } })).resolves.toEqual({
      ok: true,
    });
    expect(query.mock.calls.at(-1)![1]).toEqual([token, "sub-1", "o1"]);
  });

  it("hides an expired or revoked link and a switched-off feature", async () => {
    const { getFlightShareHandler } = await load();
    query.mockResolvedValueOnce({ rows: [] } as never);
    expect(await getFlightShareHandler({ data: { token } })).toBeNull();
    flights.config = { share: false };
    query.mockClear();
    expect(await getFlightShareHandler({ data: { token } })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("lets Admin close every open link with an audit record", async () => {
    const { revokeFlightSharesHandler } = await load();
    query
      .mockResolvedValueOnce({ rowCount: 4 } as never)
      .mockResolvedValueOnce({ rows: [] } as never);
    expect(await revokeFlightSharesHandler({ data: { reason: "spam link" } })).toEqual({
      ok: true,
      revoked: 4,
    });
    expect(String(query.mock.calls.at(-1)![0])).toContain("admin_audit_logs");
  });
});
