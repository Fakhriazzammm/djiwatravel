import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SHIPPING_CONFIG, publicShippingConfig } from "@/lib/shipping";
import type { FlightOffer } from "@/lib/flights";
import {
  PUBLIC_FLIGHT_ROUTES,
  publicFlightMonths,
  selectPublicFares,
} from "@/lib/public-flight-fares";
import { getPublicFlightFares } from "@/lib/public-flight-fares.server";
import { buildPublicPricesText } from "@/lib/public-prices-text";
import { PUBLIC_SEARCH_PAGES, isNonSearchPage } from "@/lib/public-search-pages";

const { status, read } = vi.hoisted(() => ({ status: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/flights.server", () => ({
  getFlightsStatusHandler: status,
  readMonthOffers: read,
}));

const now = new Date("2026-11-27T09:00:00Z");
const offer = (overrides: Partial<FlightOffer> = {}): FlightOffer => ({
  id: "fare-1",
  origin: "CGK",
  destination: "SIN",
  airlineName: "Test Airline",
  airline: "TA",
  flightNumber: "1",
  departureAt: "2026-12-01T10:00:00+07:00",
  priceIdr: 620_000,
  returnAt: null,
  transfers: 0,
  durationMinutes: 75,
  bookingUrl: "https://www.aviasales.com/search/example?marker=broker",
  ...overrides,
});

describe("public prices", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now });
    read.mockReset();
    status.mockResolvedValue({ available: true, config: { guestSearch: true } });
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the cheapest future one-way fare per day without provider booking details", () => {
    const fares = selectPublicFares(
      [
        {
          at: +now,
          offers: [
            offer({ id: "expired", priceIdr: 5, expiresAt: now.toISOString() }),
            offer({ id: "departed", priceIdr: 10, departureAt: "2026-11-26T10:00:00Z" }),
            offer({ id: "return", priceIdr: 20, returnAt: "2026-12-10T09:00:00Z" }),
            offer({ id: "duplicate", priceIdr: 800_000 }),
            offer(),
          ],
        },
      ],
      +now,
    );
    expect(fares).toHaveLength(1);
    expect(fares[0]).toMatchObject({
      id: "fare-1",
      priceIdr: 620_000,
      checkedAt: now.toISOString(),
    });
    expect(fares[0]).not.toHaveProperty("bookingUrl");
    expect(publicFlightMonths(new Date("2026-12-31T00:00:00Z"))).toEqual(["2026-12", "2027-01"]);
  });

  it("honors Admin guest and service policy without querying Aviasales", async () => {
    status.mockResolvedValueOnce({ available: true, config: { guestSearch: false } });
    status.mockResolvedValueOnce({ available: false, config: { guestSearch: true } });
    await expect(getPublicFlightFares()).resolves.toEqual([]);
    await expect(getPublicFlightFares()).resolves.toEqual([]);
    await expect(getPublicFlightFares("unknown")).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps the available month on an upstream failure and cites its public canonical URL", async () => {
    read.mockRejectedValueOnce(new Error("provider timeout"));
    read.mockResolvedValueOnce({ at: +now, offers: [offer()] });
    const fares = await getPublicFlightFares("jakarta-singapura");
    expect(read).toHaveBeenCalledTimes(2);
    const text = buildPublicPricesText(fares, null, { priceIdr: 150_000, minKg: 1 });
    expect(text).toContain("Rp 620.000 IDR");
    expect(text).toContain("https://djiwatravel.com/tiket/jakarta-singapura");
    expect(text).toContain(now.toISOString());
    expect(text).toContain("Rp 150.000 per kg");
    expect(text).toContain("Harga paket belum tersedia.");
    expect(text).not.toContain("marker");
  });

  it("projects only the customer tariff and shipping terms", () => {
    const config = publicShippingConfig(DEFAULT_SHIPPING_CONFIG);
    expect(config.countries.JP).toEqual({
      rateIdrPerKg: DEFAULT_SHIPPING_CONFIG.countries.JP.rateIdrPerKg,
    });
    expect(config).not.toHaveProperty("hubs");
    expect(config).not.toHaveProperty("transport");
  });

  it("keeps commercial pages reachable and excludes private or tokenized routes", () => {
    const publicPaths = [
      ...PUBLIC_SEARCH_PAGES.map(({ path }) => path),
      ...PUBLIC_FLIGHT_ROUTES.map(({ slug }) => `/tiket/${slug}`),
      "/plan/sku",
      "/template/jepang-1",
    ];
    expect(publicPaths.every((path) => !isNonSearchPage(path))).toBe(true);
    for (const path of [
      "/admin",
      "/my-trips/a/agenda",
      "/order-status",
      "/share/a",
      "/titip-belanja/pesan/123",
      "/kirim-barang/a",
    ]) {
      expect(isNonSearchPage(path)).toBe(true);
    }
  });
});
