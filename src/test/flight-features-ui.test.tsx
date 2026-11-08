import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightSearch } from "@/components/flight-search";
import {
  createFlightAlert,
  createFlightShare,
  saveFlightToTrip,
  searchFlightPlaces,
  searchFlights,
} from "@/lib/flights.fn";
import { getMyTripsHome } from "@/lib/my-trips.fn";
import { DEFAULT_FLIGHTS_CONFIG, type FlightOffer, type FlightPlace } from "@/lib/flights";

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));

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
  createFlightAlert: vi.fn(),
  listFlightAlerts: vi.fn(async () => ({ alerts: [] })),
  deleteFlightAlert: vi.fn(),
  saveFlightToTrip: vi.fn(),
  createFlightShare: vi.fn(),
}));
vi.mock("@/lib/my-trips.fn", () => ({ getMyTripsHome: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackClick: vi.fn() }));
vi.mock("@/lib/use-better-auth-user", () => ({
  useBetterAuthUser: () => ({ user: auth.user, setUser: vi.fn(), loading: false }),
}));
vi.mock("@/components/customer-auth", () => ({
  CustomerAuth: () => <button>Masuk atau daftar</button>,
}));

const CGK: FlightPlace = { code: "CGK", name: "Jakarta", countryName: "Indonesia", type: "city" };
const TYO: FlightPlace = {
  code: "TYO",
  name: "Tokyo",
  countryName: "Jepang",
  countryCode: "JP",
  type: "city",
};
const DPS: FlightPlace = {
  code: "DPS",
  name: "Denpasar",
  countryName: "Indonesia",
  countryCode: "ID",
  type: "city",
};

const offer = (day: string, price: number, destination = "TYO"): FlightOffer => ({
  id: `TR-${day}`,
  origin: "CGK",
  destination,
  airline: "TR",
  airlineName: "Scoot",
  flightNumber: "285",
  departureAt: `${day}T22:10:00+07:00`,
  returnAt: null,
  transfers: 1,
  durationMinutes: 995,
  priceIdr: price,
  bookingUrl: "https://www.aviasales.com/search/x?marker=597030",
});

const mount = (to: FlightPlace, config = DEFAULT_FLIGHTS_CONFIG) => {
  vi.mocked(searchFlightPlaces).mockResolvedValue({ places: [to] } as never);
  return render(
    <FlightSearch
      prefill={{ toText: to.name, depart: "2999-12-20" }}
      config={{ ...config, whiteLabelId: "" }}
    />,
  );
};

beforeEach(() => {
  auth.user = null;
  window.localStorage.clear();
  window.localStorage.setItem("djiwa.flights.origin", JSON.stringify(CGK));
  vi.mocked(searchFlights).mockResolvedValue({
    status: "ok",
    offers: [offer("2999-12-20", 4_000_000), offer("2999-12-21", 3_400_000)],
  });
});
afterEach(cleanup);

describe("flight extras on the results screen", () => {
  it("points at the cheaper day and moves there in one tap", async () => {
    mount(TYO);
    expect(await screen.findByText(/Hemat Rp 600rb/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pindah" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { pressed: true }).textContent).toContain("21 Des"),
    );
  });

  it("hides the banner, the bell and the eSIM card when Admin switches them off", async () => {
    mount(TYO, {
      ...DEFAULT_FLIGHTS_CONFIG,
      dateInsight: false,
      priceAlerts: false,
      esimOffer: false,
      saveToTrip: false,
      share: false,
    });
    await screen.findByRole("button", { name: "Ubah pencarian" });
    expect(screen.queryByText(/Hemat Rp/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Pantau harga" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Termurah tercatat/ }));
    expect(await screen.findByText(/Harga tercatat, bisa berubah/)).toBeTruthy();
    expect(screen.queryByText(/eSIM Jepang/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Simpan ke perjalanan/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bandingkan/ })).toBeNull();
  });

  it("asks a guest to sign in before watching a price", async () => {
    mount(TYO);
    fireEvent.click(await screen.findByRole("button", { name: "Pantau harga" }));
    expect(await screen.findByText(/Masuk dulu agar kami bisa mengirim notifikasi/)).toBeTruthy();
    expect(createFlightAlert).not.toHaveBeenCalled();
  });

  it("saves a watch with the chosen target for a signed-in member", async () => {
    auth.user = { id: "u1" };
    vi.mocked(createFlightAlert).mockResolvedValue({
      alert: {
        id: "a1",
        origin: "CGK",
        destination: "TYO",
        origin_name: "Jakarta",
        destination_name: "Tokyo",
        departure_date: "2999-12-20",
        return_date: null,
        flexible: true,
        target_idr: 3_200_000,
        last_price_idr: null,
        notified_at: null,
      },
    } as never);
    mount(TYO);
    fireEvent.click(await screen.findByRole("button", { name: "Pantau harga" }));
    fireEvent.click(await screen.findByRole("button", { name: "turun 20%" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Pantau harga" }).at(-1)!);
    await waitFor(() => expect(createFlightAlert).toHaveBeenCalled());
    const data = (
      vi.mocked(createFlightAlert).mock.calls[0]?.[0] as { data: Record<string, unknown> }
    ).data;
    expect(data).toMatchObject({
      origin: "CGK",
      destination: "TYO",
      targetIdr: 3_200_000,
      flexible: true,
    });
    expect(await screen.findByText(/Dipantau/)).toBeTruthy();
  });

  it("offers the destination's eSIM abroad but not at home", async () => {
    mount(TYO);
    fireEvent.click(await screen.findByRole("button", { name: /Termurah tercatat/ }));
    expect(await screen.findByText("eSIM Jepang")).toBeTruthy();
    expect(screen.getByText("Lihat paket")).toBeTruthy();
    cleanup();
    vi.mocked(searchFlights).mockResolvedValue({
      status: "ok",
      offers: [offer("2999-12-20", 1_200_000, "DPS")],
    });
    mount(DPS);
    fireEvent.click(await screen.findByRole("button", { name: /Termurah tercatat/ }));
    await screen.findByText(/Harga tercatat, bisa berubah/);
    expect(screen.queryByText(/^eSIM /)).toBeNull();
  });

  it("saves a fare into a trip the member picks", async () => {
    auth.user = { id: "u1" };
    vi.mocked(getMyTripsHome).mockResolvedValue({
      trips: [
        { id: "t1", name: "Liburan Tokyo", status: "upcoming", departure_date: "2999-12-20" },
        { id: "t0", name: "Lama", status: "past", departure_date: "2000-01-01" },
      ],
    } as never);
    vi.mocked(saveFlightToTrip).mockResolvedValue({
      ok: true,
      itemIds: ["i1"],
      dates: ["2999-12-20"],
    } as never);
    mount(TYO);
    fireEvent.click(await screen.findByRole("button", { name: /Termurah tercatat/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Simpan ke perjalanan" }));
    expect(screen.queryByText("Lama")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Liburan Tokyo/ }));
    await waitFor(() => expect(saveFlightToTrip).toHaveBeenCalled());
    const data = (
      vi.mocked(saveFlightToTrip).mock.calls[0]?.[0] as {
        data: {
          tripId: string;
          offer: { origin: string; originName: string };
        };
      }
    ).data;
    expect(data.tripId).toBe("t1");
    expect(data.offer).toMatchObject({ origin: "CGK", originName: "Jakarta" });
    expect(await screen.findByText(/Tersimpan di Agenda/)).toBeTruthy();
  });

  it("collects up to three fares and turns them into a share link", async () => {
    auth.user = { id: "u1" };
    vi.mocked(createFlightShare).mockResolvedValue({
      token: "tok_abcdefghijklmnop",
      days: 7,
    } as never);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
    mount(TYO);
    fireEvent.click(await screen.findByRole("button", { name: /Termurah tercatat/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Bandingkan/ }));
    expect(await screen.findByText("Pembanding (1/3)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bagikan ke teman", hidden: true }));
    await waitFor(() => expect(createFlightShare).toHaveBeenCalled());
    const shared = vi.mocked(createFlightShare).mock.calls[0]?.[0] as {
      data: { offers: unknown[] };
    };
    expect(shared.data.offers).toHaveLength(1);
    expect(await screen.findByText(/Berlaku 7 hari/)).toBeTruthy();
  });
});
