import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightSearch, type FlightPrefill } from "@/components/flight-search";
import { searchFlightPlaces, searchFlights } from "@/lib/flights.fn";
import { trackClick } from "@/lib/analytics";
import {
  DEFAULT_FLIGHTS_CONFIG,
  type FlightOffer,
  type FlightPlace,
  type FlightsConfig,
} from "@/lib/flights";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...(rest as object)}>{children}</a>
  ),
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/flights.fn", () => ({
  searchFlightPlaces: vi.fn(),
  searchFlights: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ trackClick: vi.fn() }));

const places = vi.mocked(searchFlightPlaces);
const flights = vi.mocked(searchFlights);

const CGK: FlightPlace = { code: "CGK", name: "Jakarta", countryName: "Indonesia", type: "city" };
const DPS: FlightPlace = {
  code: "DPS",
  name: "Denpasar (Bali)",
  countryName: "Indonesia",
  type: "city",
};

const offer = (over: Partial<FlightOffer> = {}): FlightOffer => ({
  id: "JT-030",
  origin: "CGK",
  destination: "DPS",
  airline: "JT",
  airlineName: "Lion Air",
  flightNumber: "030",
  departureAt: "2999-12-20T08:35:00+07:00",
  returnAt: null,
  transfers: 0,
  durationMinutes: 115,
  priceIdr: 1265394,
  bookingUrl: "https://www.aviasales.com/search/CGK2012DPS1?marker=597030",
  ...over,
});

const WL: FlightsConfig = { ...DEFAULT_FLIGHTS_CONFIG, whiteLabelId: "12345" };
/** Recorded fares only: no White Label set up. */
const NO_WL: FlightsConfig = { ...DEFAULT_FLIGHTS_CONFIG, whiteLabelId: "" };
const prefill: FlightPrefill = { toText: "Bali", depart: "2999-12-20" };

const mount = (config: FlightsConfig = NO_WL, p = prefill) =>
  render(<FlightSearch prefill={p} config={config} />);

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
  places.mockReset();
  flights.mockReset();
  vi.mocked(trackClick).mockReset();
  places.mockImplementation((async ({ data }: { data: { term: string } }) => ({
    places: /dps|bali/i.test(data.term) ? [DPS] : [CGK],
  })) as never);
});
afterEach(cleanup);

describe("FlightSearch results screen (design B)", () => {
  it("runs by itself from a trip and asks for the whole month once", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount();
    await screen.findByLabelText("Hasil pencarian tiket");
    expect(flights).toHaveBeenCalledTimes(1);
    expect(flights.mock.calls[0]![0]).toEqual({
      data: { origin: "CGK", destination: "DPS", departureDate: "2999-12" },
    });
    expect(screen.getByRole("heading", { name: /CGK\s*DPS/ })).toBeTruthy();
  });

  it("shows the cheapest recorded fare per day and the chosen day selected", async () => {
    flights.mockResolvedValue({
      status: "ok",
      offers: [
        offer({ id: "a", departureAt: "2999-12-19T08:00:00+07:00", priceIdr: 900_000 }),
        offer({ id: "b", departureAt: "2999-12-20T08:00:00+07:00", priceIdr: 1_265_394 }),
      ],
    });
    mount();
    const group = await screen.findByRole("group", { name: "Pilih tanggal berangkat" });
    const chips = Array.from(group.querySelectorAll("button"));
    expect(chips).toHaveLength(7);
    const selected = chips.find((chip) => chip.getAttribute("aria-pressed") === "true")!;
    expect(selected.textContent).toContain("Rp 1,3jt");
    expect(chips.some((chip) => chip.textContent?.includes("Rp 900rb"))).toBe(true);
    expect(chips.some((chip) => chip.textContent?.includes("—"))).toBe(true);
  });

  it("picking another day of the same month moves the selection without another search", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount();
    const group = await screen.findByRole("group", { name: "Pilih tanggal berangkat" });
    const other = Array.from(group.querySelectorAll("button")).find(
      (chip) => chip.getAttribute("aria-pressed") === "false",
    )!;
    fireEvent.click(other);
    await waitFor(() => expect(other.getAttribute("aria-pressed")).toBe("true"));
    expect(flights).toHaveBeenCalledTimes(1);
  });

  it("shifts a round trip's return date with the day and searches the next month when crossed", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount(WL, { ...prefill, depart: "2999-12-30", back: "2999-12-31" });
    const group = await screen.findByRole("group", { name: "Pilih tanggal berangkat" });
    window.localStorage.setItem("djiwa.flights.embed-ok", "1");
    const buttons = Array.from(group.querySelectorAll("button"));
    fireEvent.click(buttons[buttons.length - 1]!); // 2 Jan 3000
    await waitFor(() => expect(flights).toHaveBeenCalledTimes(2));
    expect(flights.mock.calls[1]![0]).toEqual({
      data: { origin: "CGK", destination: "DPS", departureDate: "3000-01" },
    });
  });

  it("without a White Label lists the cheapest fares and lets the traveler book on Aviasales", async () => {
    flights.mockResolvedValue({
      status: "ok",
      offers: [
        offer({
          id: "b",
          airline: "GA",
          airlineName: "Garuda Indonesia",
          priceIdr: 4_100_000,
          transfers: 1,
        }),
        offer(),
      ],
    });
    mount();
    expect(await screen.findByText("2 harga termurah")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    const rows = screen.getAllByRole("button", { name: /Rp/ }).filter((b) => b.closest("ul"));
    expect(rows[0]!.textContent).toContain("Lion Air");
    expect(rows[0]!.textContent).toContain("Termurah");
    fireEvent.click(rows[0]!);
    const link = await screen.findByRole("link", { name: /Lihat & pesan di Aviasales/ });
    expect(link.getAttribute("href")).toContain("marker=597030");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(document.body.textContent).not.toMatch(/komisi|commission|afiliasi/i);
    fireEvent.click(link);
    expect(trackClick).toHaveBeenCalledWith("/tiket", "flights_aviasales");
  });

  it("filters the fallback list to direct flights", async () => {
    flights.mockResolvedValue({
      status: "ok",
      offers: [offer({ id: "a" }), offer({ id: "b", transfers: 1, priceIdr: 900_000 })],
    });
    mount();
    await screen.findByText("2 harga termurah");
    fireEvent.click(screen.getByLabelText("Langsung saja"));
    expect(await screen.findByText("1 harga termurah")).toBeTruthy();
  });

  it("explains an empty or rate limited result without a White Label", async () => {
    flights.mockResolvedValueOnce({ status: "empty", offers: [] });
    mount();
    expect(await screen.findByText(/Belum ada harga untuk tanggal ini/)).toBeTruthy();
    cleanup();
    flights.mockResolvedValueOnce({ status: "rate_limited", offers: [] });
    mount();
    expect(await screen.findByText(/Terlalu banyak pencarian/)).toBeTruthy();
  });

  it("shows the route and dates with one clear way to change them", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount();
    const title = await screen.findByRole("heading", { name: /CGK/ });
    expect(title.textContent).toContain("DPS");
    expect(screen.getByText(/sekali jalan$/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Ubah pencarian" })).toHaveLength(1);
  });

  it("goes back to the form from the results", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Ubah pencarian" }));
    expect(await screen.findByRole("button", { name: "Cari tiket" })).toBeTruthy();
  });
});

const frameOf = () => document.querySelector("iframe");

describe("FlightSearch with a White Label widget", () => {
  it("asks before loading the third-party results, then shows them in a frame", async () => {
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount(WL, { ...prefill, back: "2999-12-27" });
    expect(await screen.findByText("Lihat semua penerbangan")).toBeTruthy();
    expect(frameOf()).toBeNull();
    expect(trackClick).not.toHaveBeenCalledWith("/tiket", "flights_embed_open");
    fireEvent.click(screen.getByRole("button", { name: "Setuju dan buka" }));
    await waitFor(() => expect(frameOf()).not.toBeNull());
    // Our search (12-20, back 12-27, one adult) goes to the widget in the frame address, so the
    // app page keeps its own address and styles.
    expect(frameOf()!.getAttribute("src")).toBe(
      "/tiket-widget.html?flightSearch=CGK2012DPS27121#12345",
    );
    expect(new URL(window.location.href).searchParams.has("flightSearch")).toBe(false);
    expect(document.getElementById("tpwl-tickets")).toBeNull();
    expect(trackClick).toHaveBeenCalledWith("/tiket", "flights_embed_open");
    // The recorded-fare list gives way to the full results.
    expect(screen.queryByText(/harga termurah$/)).toBeNull();
  });

  it("remembers the agreement", async () => {
    window.localStorage.setItem("djiwa.flights.embed-ok", "1");
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount(WL);
    await waitFor(() => expect(frameOf()).not.toBeNull());
    expect(screen.getByText("Semua penerbangan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Setuju dan buka" })).toBeNull();
  });

  it("keeps the full results when no price is recorded for the day", async () => {
    window.localStorage.setItem("djiwa.flights.embed-ok", "1");
    flights.mockResolvedValue({ status: "empty", offers: [] });
    mount(WL);
    await waitFor(() => expect(frameOf()).not.toBeNull());
    expect(screen.queryByText(/Belum ada harga untuk tanggal ini/)).toBeNull();
  });

  it("opens a new frame for the day picked in the calendar", async () => {
    window.localStorage.setItem("djiwa.flights.embed-ok", "1");
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount(WL);
    await waitFor(() => expect(frameOf()).not.toBeNull());
    const group = screen.getByRole("group", { name: "Pilih tanggal berangkat" });
    const next = Array.from(group.querySelectorAll("button")).find((chip) =>
      chip.textContent?.includes("21 Des"),
    )!;
    fireEvent.click(next);
    await waitFor(() => expect(frameOf()!.getAttribute("src")).toContain("CGK2112DPS1"));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("does not load anything third-party when Admin has not set a White Label", async () => {
    window.localStorage.setItem("djiwa.flights.embed-ok", "1");
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    mount(NO_WL);
    await screen.findByText("1 harga termurah");
    expect(frameOf()).toBeNull();
  });
});

describe("FlightSearch form", () => {
  it("does not search an incomplete form and asks for a city from the list", async () => {
    window.localStorage.clear();
    mount(NO_WL, {});
    fireEvent.click(screen.getByRole("button", { name: "Cari tiket" }));
    expect(await screen.findByText(/Pilih kota asal dan tujuan dari daftar/)).toBeTruthy();
    expect(flights).not.toHaveBeenCalled();
  });
});
