import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightSearch } from "@/components/flight-search";
import { searchFlightPlaces, searchFlights } from "@/lib/flights.fn";
import { trackClick } from "@/lib/analytics";
import type { FlightOffer, FlightPlace } from "@/lib/flights";

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

beforeEach(() => {
  window.localStorage.clear();
  places.mockReset();
  flights.mockReset();
  vi.mocked(trackClick).mockReset();
  places.mockImplementation((async ({ data }: { data: { term: string } }) => ({
    places: /dps|bali/i.test(data.term) ? [DPS] : [CGK],
  })) as never);
});
afterEach(cleanup);

describe("FlightSearch", () => {
  it("runs by itself from a trip prefill and lists the cheapest fare first", async () => {
    window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
    flights.mockResolvedValue({
      status: "ok",
      offers: [
        offer({ id: "a", priceIdr: 1265394 }),
        offer({ id: "b", airline: "GA", flightNumber: "874", priceIdr: 4_100_000, transfers: 1 }),
      ],
    });
    render(<FlightSearch prefill={{ toText: "Bali", depart: "2999-12-20" }} />);
    await screen.findByLabelText("Hasil pencarian tiket");
    expect(flights).toHaveBeenCalledTimes(1);
    expect(flights.mock.calls[0]![0]).toEqual({
      data: { origin: "CGK", destination: "DPS", departureDate: "2999-12-20" },
    });
    const rows = screen.getAllByRole("button", { name: /Rp/ });
    expect(rows[0]!.textContent).toContain("Lion Air");
    expect(rows[0]!.textContent).toContain("Rp 1,3jt");
    expect(rows[0]!.textContent).toContain("Termurah");
    expect(rows[1]!.textContent).toContain("1 transit");
  });

  it("opens Aviasales with the partner link in a new tab and reports the click", async () => {
    window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
    flights.mockResolvedValue({ status: "ok", offers: [offer()] });
    render(<FlightSearch prefill={{ toText: "Bali", depart: "2999-12-20" }} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Rp/ }))[0]!);
    // The sheet leads with the airline's name, not its two-letter code.
    expect((await screen.findAllByText("Lion Air")).length).toBeGreaterThan(0);
    const link = await screen.findByRole("link", { name: /Lihat & pesan di Aviasales/ });
    expect(link.getAttribute("href")).toContain("marker=597030");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // The traveler is told where they pay, never how Djiwa earns from the booking.
    expect(screen.getByText("Pembayaran dilakukan di Aviasales.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/komisi|commission|afiliasi/i);
    fireEvent.click(link);
    expect(trackClick).toHaveBeenCalledWith("/tiket", "flights_aviasales");
  });

  it("explains an empty result instead of showing an error", async () => {
    window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
    flights.mockResolvedValue({ status: "empty", offers: [] });
    render(<FlightSearch prefill={{ toText: "Bali", depart: "2999-12-20" }} />);
    expect(await screen.findByText(/Belum ada harga untuk tanggal ini/)).toBeTruthy();
  });

  it("tells the traveler when searching is rate limited", async () => {
    window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
    flights.mockResolvedValue({ status: "rate_limited", offers: [] });
    render(<FlightSearch prefill={{ toText: "Bali", depart: "2999-12-20" }} />);
    expect(await screen.findByText(/Terlalu banyak pencarian/)).toBeTruthy();
  });

  it("does not search an incomplete form and asks for a city from the list", async () => {
    render(<FlightSearch prefill={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cari tiket" }));
    expect(await screen.findByText(/Pilih kota asal dan tujuan dari daftar/)).toBeTruthy();
    expect(flights).not.toHaveBeenCalled();
  });

  it("filters to direct flights", async () => {
    window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
    flights.mockResolvedValue({
      status: "ok",
      offers: [offer({ id: "a" }), offer({ id: "b", transfers: 1, priceIdr: 900_000 })],
    });
    render(<FlightSearch prefill={{ toText: "Bali", depart: "2999-12-20" }} />);
    await screen.findByLabelText("Hasil pencarian tiket");
    expect(screen.getAllByRole("button", { name: /Rp/ })).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Langsung saja"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Rp/ })).toHaveLength(1));
  });
});
