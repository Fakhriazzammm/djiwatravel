import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { getRequestHeader } from "@tanstack/react-start/server";
import { DEFAULT_FLIGHTS_CONFIG } from "@/lib/flights";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: vi.fn() }));

const query = vi.mocked(pool.query);
const authenticate = vi.mocked(getAuthenticatedUser);
const header = vi.mocked(getRequestHeader);

const prices = {
  success: true,
  currency: "idr",
  data: [
    {
      flight_number: "030",
      link: "/search/CGK0112DPS1?t=abc",
      origin_airport: "CGK",
      destination_airport: "DPS",
      departure_at: "2026-12-01T08:35:00+07:00",
      airline: "JT",
      price: 1265394,
      transfers: 0,
      duration_to: 115,
    },
  ],
};

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

async function load() {
  vi.resetModules();
  return import("@/lib/flights.server");
}

const config = (over: Record<string, unknown> = {}) =>
  query.mockResolvedValue({
    rows: [{ value_json: { ...DEFAULT_FLIGHTS_CONFIG, ...over }, version: 3 }],
  } as never);

const search = { origin: "CGK", destination: "DPS", departureDate: "2999-12-20" };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  query.mockReset();
  authenticate.mockReset();
  authenticate.mockRejectedValue(new Error("no session"));
  header.mockReset();
  header.mockImplementation(((name: string) =>
    name === "x-real-ip" ? "1.2.3.4" : undefined) as never);
  vi.stubEnv("TRAVELPAYOUTS_TOKEN", "test-token");
  config();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchFlightsHandler", () => {
  it("returns cheapest offers with the marker and sends the token as a header, not in the URL", async () => {
    fetchMock.mockResolvedValue(ok(prices));
    const { searchFlightsHandler } = await load();
    const result = await searchFlightsHandler({ data: search });
    expect(result.status).toBe("ok");
    expect(result.offers[0]).toMatchObject({ priceIdr: 1265394, airline: "JT" });
    expect(result.offers[0]!.bookingUrl).toContain("marker=597030");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("origin=CGK");
    expect(String(url)).toContain("one_way=true");
    expect(String(url)).not.toContain("test-token");
    expect((init as RequestInit).headers).toMatchObject({ "X-Access-Token": "test-token" });
  });

  it("sends a return date as a round trip", async () => {
    fetchMock.mockResolvedValue(ok(prices));
    const { searchFlightsHandler } = await load();
    await searchFlightsHandler({ data: { ...search, returnDate: "2999-12-27" } });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("return_at=2999-12-27");
    expect(url).toContain("one_way=false");
  });

  it("is unavailable without a token or when Admin turned it off, and never calls the provider", async () => {
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "");
    let mod = await load();
    expect((await mod.searchFlightsHandler({ data: search })).status).toBe("unavailable");
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "test-token");
    config({ enabled: false });
    mod = await load();
    expect((await mod.searchFlightsHandler({ data: search })).status).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks guests to log in only when Admin turned guest search off", async () => {
    config({ guestSearch: false });
    let mod = await load();
    expect((await mod.searchFlightsHandler({ data: search })).status).toBe("login_required");
    authenticate.mockResolvedValue({ id: "user-1", email: "a@b.c" } as never);
    fetchMock.mockResolvedValue(ok(prices));
    mod = await load();
    expect((await mod.searchFlightsHandler({ data: search })).status).toBe("ok");
  });

  it("rejects an invalid search before any provider call", async () => {
    const { searchFlightsHandler } = await load();
    const result = await searchFlightsHandler({
      data: { origin: "CGK", destination: "CGK", departureDate: "2999-12-20" },
    });
    expect(result.status).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports empty results and provider failures without leaking details", async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, data: [] }));
    const { searchFlightsHandler } = await load();
    expect((await searchFlightsHandler({ data: search })).status).toBe("empty");
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await searchFlightsHandler({
      data: { ...search, departureDate: "2999-11-20" },
    });
    expect(failed).toEqual({ status: "failed", offers: [] });
  });

  it("serves a repeat search from cache without spending the allowance", async () => {
    config({ searchesPerHour: 5 });
    fetchMock.mockResolvedValue(ok(prices));
    const { searchFlightsHandler } = await load();
    for (let i = 0; i < 8; i += 1) {
      expect((await searchFlightsHandler({ data: search })).status).toBe("ok");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rate limits one address on distinct searches and keeps other addresses working", async () => {
    config({ searchesPerHour: 5 });
    fetchMock.mockResolvedValue(ok(prices));
    const { searchFlightsHandler } = await load();
    const day = (n: number) => ({
      ...search,
      departureDate: `2999-12-${String(10 + n).padStart(2, "0")}`,
    });
    for (let i = 0; i < 5; i += 1) {
      expect((await searchFlightsHandler({ data: day(i) })).status).toBe("ok");
    }
    expect((await searchFlightsHandler({ data: day(6) })).status).toBe("rate_limited");
    header.mockImplementation(((name: string) =>
      name === "x-real-ip" ? "9.9.9.9" : undefined) as never);
    expect((await searchFlightsHandler({ data: day(6) })).status).toBe("ok");
  });
});

describe("searchFlightPlacesHandler", () => {
  it("returns cleaned places without a token and caches repeats", async () => {
    fetchMock.mockResolvedValue(
      ok([
        { type: "city", code: "DPS", name: "Denpasar (Bali)", country_name: "Indonesia" },
        { type: "country", code: "ID", name: "Indonesia" },
      ]),
    );
    const { searchFlightPlacesHandler } = await load();
    const first = await searchFlightPlacesHandler({ data: { term: "Bali" } });
    expect(first.places.map((p) => p.code)).toEqual(["DPS"]);
    await searchFlightPlacesHandler({ data: { term: "bali" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("autocomplete.travelpayouts.com");
    expect(url).not.toContain("test-token");
  });

  it("returns nothing when the provider fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const { searchFlightPlacesHandler } = await load();
    expect(await searchFlightPlacesHandler({ data: { term: "Bali" } })).toEqual({ places: [] });
  });
});

describe("Admin view", () => {
  it("reports whether the token exists but never the token", async () => {
    query.mockResolvedValueOnce({
      rows: [{ value_json: DEFAULT_FLIGHTS_CONFIG, version: 2 }],
    } as never);
    query.mockResolvedValueOnce({ rows: [{ n: 7 }] } as never);
    const { getAdminFlightsHandler } = await load();
    const view = await getAdminFlightsHandler();
    expect(view.tokenConfigured).toBe(true);
    expect(view.stats.clicks7d).toBe(7);
    expect(JSON.stringify(view)).not.toContain("test-token");
  });
});
