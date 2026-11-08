import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { getRequestHeader } from "@tanstack/react-start/server";
import { DEFAULT_FLIGHTS_CONFIG, normalizeFlightIdeas, parseBudget } from "@/lib/flights";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: vi.fn() }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-guard.server", () => ({ getAdminEmailHandler: vi.fn() }));

const rows = [
  {
    destination_code: "DPS",
    destination_name: "Bali",
    price: 900000,
    departure_at: "2999-12-01",
    transfers: 0,
    duration: 115,
    link: "/x",
  },
  {
    destination_code: "DPS",
    destination_name: "Bali",
    price: 800000,
    departure_at: "2999-12-05",
    transfers: 1,
  },
  {
    destination_code: "CGK",
    destination_name: "Jakarta",
    price: 500000,
    departure_at: "2999-12-02",
  },
  { destination_code: "SUB", destination_name: "", price: 500000, departure_at: "2999-12-02" },
  { destination_code: "KNO", destination_name: "Medan", price: -1, departure_at: "2999-12-02" },
];

describe("ideas helpers", () => {
  it("keeps the cheapest row per destination, never the origin, cheapest first", () => {
    const ideas = normalizeFlightIdeas(rows, "CGK");
    expect(ideas.map((i) => [i.destination.code, i.priceIdr])).toEqual([["DPS", 800000]]);
    expect(ideas[0]?.departureDate).toBe("2999-12-05");
  });
  it("parses budgets inside the allowed range only", () => {
    expect(parseBudget("Rp 1.500.000")).toBe(1500000);
    expect(parseBudget(100)).toBeNull();
    expect(parseBudget("abc")).toBeNull();
    expect(parseBudget(60_000_000)).toBeNull();
  });
});

describe("searchFlightIdeasHandler", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ value_json: { ...DEFAULT_FLIGHTS_CONFIG }, version: 1 }],
    } as never);
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error("no session"));
    vi.mocked(getRequestHeader).mockImplementation(((n: string) =>
      n === "x-real-ip" ? "9.9.9.9" : undefined) as never);
    vi.stubEnv("TRAVELPAYOUTS_TOKEN", "tok");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: rows }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const load = async () => {
    vi.resetModules();
    return import("@/lib/flights.server");
  };

  it("searches under the budget with the token in a header and caches by rounded budget", async () => {
    const { searchFlightIdeasHandler } = await load();
    const res = await searchFlightIdeasHandler({ data: { origin: "jkt", budget: "1.000.000" } });
    expect(res.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("search_by_price_range");
    expect(String(url)).toContain("value_max=1000000");
    expect(String(url)).not.toContain("tok");
    expect(init.headers["X-Access-Token"]).toBe("tok");
    await searchFlightIdeasHandler({ data: { origin: "JKT", budget: 1_020_000 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is unavailable when Admin switches it off and rejects a bad budget", async () => {
    const { searchFlightIdeasHandler } = await load();
    expect((await searchFlightIdeasHandler({ data: { origin: "JKT", budget: 10 } })).status).toBe(
      "invalid",
    );
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ value_json: { ...DEFAULT_FLIGHTS_CONFIG, budgetSearch: false }, version: 1 }],
    } as never);
    const off = await load();
    expect(
      (await off.searchFlightIdeasHandler({ data: { origin: "JKT", budget: 1_000_000 } })).status,
    ).toBe("unavailable");
  });
});
