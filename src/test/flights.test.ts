import { describe, expect, it } from "vitest";
import { validateAdminSetting } from "@/lib/admin-settings";
import {
  DEFAULT_FLIGHTS_CONFIG,
  KNOWN_AIRLINES,
  airlineNameFor,
  aviasalesBookingUrl,
  compactFlightPrice,
  durationLabel,
  flightClock,
  flightSearchKey,
  flightsPathFor,
  isIataCode,
  normalizeAirlineNames,
  normalizeFlightOffers,
  normalizeFlightPlaces,
  normalizeFlightsConfig,
  parseFlightSearch,
  parseFlightsConfig,
  showFlightsHeroTab,
  showFlightsTile,
  transfersLabel,
  travelpayoutsScriptSrc,
  withinSearchAllowance,
} from "@/lib/flights";

const TODAY = "2026-11-07";

describe("flights config", () => {
  it("ships the Travelpayouts script, marker and every entry point on", () => {
    expect(travelpayoutsScriptSrc(DEFAULT_FLIGHTS_CONFIG)).toBe(
      "https://emrldtp.cc/NTk3MDMw.js?t=597030",
    );
    expect(DEFAULT_FLIGHTS_CONFIG).toMatchObject({
      enabled: true,
      heroTab: true,
      homeTile: true,
      guestSearch: true,
      waitForConsent: true,
    });
  });

  it("accepts a record saved before the search existed and fills the new keys", () => {
    const legacy = {
      enabled: true,
      googleFlights: true,
      travelpayouts: false,
      scriptId: "NTk3MDMw",
      partnerId: "597030",
      waitForConsent: true,
    };
    expect(parseFlightsConfig(legacy)).toMatchObject({
      travelpayouts: false,
      heroTab: true,
      homeTile: true,
      guestSearch: true,
      searchesPerHour: 20,
    });
  });

  it("rejects ids that could break out of the script URL and bad limits", () => {
    expect(() =>
      parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, scriptId: 'x"><script>' }),
    ).toThrow(/scriptId/);
    expect(() => parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, partnerId: "59 7" })).toThrow(
      /partnerId/,
    );
    expect(() => parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, enabled: "yes" })).toThrow();
    expect(() => parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, searchesPerHour: 1 })).toThrow();
    expect(() =>
      parseFlightsConfig({ ...DEFAULT_FLIGHTS_CONFIG, searchesPerHour: 5000 }),
    ).toThrow();
  });

  it("falls back to the default for a malformed stored value", () => {
    expect(normalizeFlightsConfig({ enabled: 1 })).toEqual(DEFAULT_FLIGHTS_CONFIG);
  });

  it("turns each entry point and the script off independently", () => {
    expect(travelpayoutsScriptSrc({ ...DEFAULT_FLIGHTS_CONFIG, enabled: false })).toBeNull();
    expect(travelpayoutsScriptSrc({ ...DEFAULT_FLIGHTS_CONFIG, travelpayouts: false })).toBeNull();
    expect(showFlightsHeroTab({ ...DEFAULT_FLIGHTS_CONFIG, heroTab: false })).toBe(false);
    expect(showFlightsTile({ ...DEFAULT_FLIGHTS_CONFIG, homeTile: false })).toBe(false);
    expect(showFlightsTile({ ...DEFAULT_FLIGHTS_CONFIG, enabled: false })).toBe(false);
    expect(showFlightsHeroTab(DEFAULT_FLIGHTS_CONFIG)).toBe(true);
  });

  it("is a valid Admin setting", () => {
    expect(() => validateAdminSetting("flights", DEFAULT_FLIGHTS_CONFIG)).not.toThrow();
  });

  it("counts the hourly allowance", () => {
    expect(withinSearchAllowance(19, DEFAULT_FLIGHTS_CONFIG)).toBe(true);
    expect(withinSearchAllowance(20, DEFAULT_FLIGHTS_CONFIG)).toBe(false);
  });
});

describe("parseFlightSearch", () => {
  const ok = { origin: "cgk", destination: "dps", departureDate: "2026-12-20" };

  it("upper-cases codes and keeps a valid round trip", () => {
    expect(parseFlightSearch({ ...ok, returnDate: "2026-12-27" }, TODAY)).toEqual({
      origin: "CGK",
      destination: "DPS",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
    });
  });

  it("accepts a one way search and a whole month", () => {
    expect(parseFlightSearch(ok, TODAY)).toEqual({
      origin: "CGK",
      destination: "DPS",
      departureDate: "2026-12-20",
    });
    expect(parseFlightSearch({ ...ok, departureDate: "2026-12" }, TODAY)?.departureDate).toBe(
      "2026-12",
    );
  });

  it.each([
    ["same city", { ...ok, destination: "CGK" }],
    ["not a code", { ...ok, origin: "Jakarta" }],
    ["past date", { ...ok, departureDate: "2026-11-01" }],
    ["past month", { ...ok, departureDate: "2026-10" }],
    ["impossible date", { ...ok, departureDate: "2026-02-31" }],
    ["return before departure", { ...ok, returnDate: "2026-12-01" }],
    ["return without a day", { ...ok, departureDate: "2026-12", returnDate: "2026-12-20" }],
    ["injection", { ...ok, origin: "CG&" }],
  ])("rejects %s", (_label, input) => {
    expect(parseFlightSearch(input, TODAY)).toBeNull();
  });

  it("gives equal searches the same cache key", () => {
    const a = parseFlightSearch(ok, TODAY)!;
    expect(flightSearchKey(a)).toBe(flightSearchKey({ ...a }));
    expect(flightSearchKey(a)).not.toBe(flightSearchKey({ ...a, returnDate: "2026-12-27" }));
  });

  it("knows what an IATA code is", () => {
    expect(isIataCode("DPS")).toBe(true);
    expect(isIataCode("dps")).toBe(false);
    expect(isIataCode("DPSX")).toBe(false);
  });
});

describe("Aviasales booking link", () => {
  const link = "/search/CGK0112DPS1?t=abc&search_date=03112026";

  it("adds our marker to a relative search link", () => {
    const url = new URL(aviasalesBookingUrl(link, "597030")!);
    expect(url.origin).toBe("https://www.aviasales.com");
    expect(url.pathname).toBe("/search/CGK0112DPS1");
    expect(url.searchParams.get("marker")).toBe("597030");
    expect(url.searchParams.get("t")).toBe("abc");
  });

  it("replaces a marker the provider already put there", () => {
    const url = new URL(aviasalesBookingUrl(`${link}&marker=111`, "597030")!);
    expect(url.searchParams.getAll("marker")).toEqual(["597030"]);
  });

  it.each([
    "https://evil.example/search/x",
    "//evil.example/search/x",
    "/other/path",
    "javascript:alert(1)",
    "",
    42,
    null,
  ])("never links to %s", (value) => {
    expect(aviasalesBookingUrl(value, "597030")).toBeNull();
  });

  it("needs a valid marker", () => {
    expect(aviasalesBookingUrl(link, "59 7")).toBeNull();
  });
});

describe("normalizing provider rows", () => {
  // Shape verified against the live prices_for_dates response.
  const row = (over: Record<string, unknown> = {}) => ({
    flight_number: "030",
    link: "/search/CGK0112DPS1?t=abc",
    origin_airport: "CGK",
    destination_airport: "DPS",
    departure_at: "2026-12-01T08:35:00+07:00",
    airline: "JT",
    destination: "DPS",
    origin: "JKT",
    price: 1265394,
    transfers: 0,
    duration_to: 115,
    ...over,
  });

  it("maps a row and sorts cheapest first", () => {
    const offers = normalizeFlightOffers(
      [row({ price: 1329806, flight_number: "818", airline: "QZ" }), row()],
      "597030",
    );
    expect(offers.map((o) => o.priceIdr)).toEqual([1265394, 1329806]);
    expect(offers[0]).toMatchObject({
      origin: "CGK",
      destination: "DPS",
      airline: "JT",
      flightNumber: "030",
      transfers: 0,
      durationMinutes: 115,
    });
    expect(offers[0]!.bookingUrl).toContain("marker=597030");
  });

  it("uses the airport, not the city code, for the origin", () => {
    expect(normalizeFlightOffers([row()], "597030")[0]!.origin).toBe("CGK");
  });

  it("skips rows without a usable price, route or time and drops duplicates", () => {
    const offers = normalizeFlightOffers(
      [
        row({ price: 0 }),
        row({ price: "abc" }),
        row({ origin_airport: "JAKARTA", origin: "JAKARTA" }),
        row({ departure_at: "besok" }),
        row(),
        row(),
        null,
        "x",
      ],
      "597030",
    );
    expect(offers).toHaveLength(1);
  });

  it("returns nothing for a body that is not a list", () => {
    expect(normalizeFlightOffers({ data: [] }, "597030")).toEqual([]);
    expect(normalizeFlightOffers(undefined, "597030")).toEqual([]);
  });

  it("keeps an offer but drops a bad link", () => {
    const offer = normalizeFlightOffers([row({ link: "https://evil.example" })], "597030")[0]!;
    expect(offer.bookingUrl).toBeNull();
  });

  it("keeps only city and airport places with a three-letter code", () => {
    const places = normalizeFlightPlaces([
      { type: "city", code: "DPS", name: "Denpasar (Bali)", country_name: "Indonesia" },
      { type: "city", code: "DPS", name: "duplicate" },
      { type: "country", code: "ID", name: "Indonesia" },
      { type: "airport", code: "CGK", name: "Soekarno-Hatta", country_name: "Indonesia" },
      { type: "city", code: "TOOLONG", name: "x" },
      { type: "city", code: "XYZ", name: "" },
    ]);
    expect(places.map((p) => p.code)).toEqual(["DPS", "CGK"]);
  });
});

describe("airline names", () => {
  it("reads the provider list, preferring name and falling back to the English translation", () => {
    expect(
      normalizeAirlineNames([
        { code: "JT", name: "Lion Air" },
        { code: "OD", name: null, name_translations: { en: "Batik Air Malaysia" } },
        { code: "X", name: "too short code" },
        { code: "ZZ", name: "" },
        null,
      ]),
    ).toEqual({ JT: "Lion Air", OD: "Batik Air Malaysia" });
    expect(normalizeAirlineNames({ not: "a list" })).toEqual({});
  });

  it("names by provider list, then the built-in list, then the code", () => {
    expect(airlineNameFor("JT", { JT: "Lion Air Group" })).toBe("Lion Air Group");
    expect(airlineNameFor("GA")).toBe("Garuda Indonesia");
    expect(airlineNameFor("ZZ")).toBe("ZZ");
    expect(KNOWN_AIRLINES["OD"]).toBe("Batik Air Malaysia");
  });

  it("puts the name on each offer", () => {
    const row = {
      link: "/search/CGK0112DPS1",
      origin_airport: "CGK",
      destination_airport: "DPS",
      departure_at: "2026-12-01T08:35:00+07:00",
      airline: "OD",
      flight_number: "393",
      price: 1000000,
    };
    expect(normalizeFlightOffers([row], "597030")[0]!.airlineName).toBe("Batik Air Malaysia");
    expect(normalizeFlightOffers([row], "597030", 12, { OD: "Batik" })[0]!.airlineName).toBe(
      "Batik",
    );
  });
});

describe("formatting", () => {
  it("shortens prices", () => {
    expect(compactFlightPrice(3_412_000)).toBe("Rp 3,4jt");
    expect(compactFlightPrice(850_000)).toBe("Rp 850rb");
  });
  it("labels transfers, duration and clock", () => {
    expect(transfersLabel(0)).toBe("Langsung");
    expect(transfersLabel(2)).toBe("2 transit");
    expect(durationLabel(115)).toBe("1j 55m");
    expect(durationLabel(120)).toBe("2j");
    expect(durationLabel(null)).toBe("");
    expect(flightClock("2026-12-01T08:35:00+07:00")).toBe("08.35");
  });
});

describe("flightsPathFor (Ringkas to /tiket)", () => {
  it("carries the destination and dates", () => {
    expect(
      flightsPathFor({
        destination: "Jepang",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
      }),
    ).toEqual({
      to: "/tiket",
      search: { tujuan: "Jepang", berangkat: "2026-12-20", pulang: "2026-12-27" },
    });
  });
  it("drops a return date before departure and has no link without a destination", () => {
    expect(
      flightsPathFor({
        destination: "Jepang",
        departureDate: "2026-12-20",
        returnDate: "2026-12-01",
      })?.search.pulang,
    ).toBeUndefined();
    expect(flightsPathFor({ destination: "  " })).toBeNull();
  });
});
