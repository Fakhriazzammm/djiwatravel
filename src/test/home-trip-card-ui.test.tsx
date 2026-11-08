import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeMyTripsWidget } from "@/components/home-my-trips-widget";
import { buildMyTripsHome } from "@/lib/my-trips-home";
import { getTripWeather } from "@/lib/trip-weather.fn";
import { getItineraryMapConfig } from "@/lib/itinerary-map.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG } from "@/lib/itinerary-map";

const now = new Date();
const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...(rest as object)}>{children}</a>
  ),
}));
vi.mock("@/lib/my-trips.fn", () => ({
  getMyTripsHome: vi.fn(async () =>
    buildMyTripsHome(
      [
        {
          id: "t1",
          name: "spring",
          destination_name: "Jepang",
          status: "ongoing",
          departure_date: key,
          return_date: key,
          travelers_count: 1,
          primary_currency: "IDR",
          total_budget_minor: 1_000_000_000,
          spent_minor: 0,
          checklist_total: 2,
          checklist_done: 2,
          booking_count: 0,
        },
      ],
      [
        {
          id: "a1",
          trip_id: "t1",
          activity_date: key,
          start_time: "23:59:00",
          title: "ngopi",
          location: "Fuglen Tokyo",
          latitude: 35.67,
          longitude: 139.69,
        },
      ],
      [],
    ),
  ),
}));
vi.mock("@/components/itinerary-map", () => ({
  default: ({ pins }: { pins: { id: string; n: number; title: string }[] }) => (
    <div data-testid="map" data-pins={pins.map((p) => `${p.n}:${p.title}`).join(",")} />
  ),
}));
vi.mock("@/lib/itinerary-map.fn", () => ({
  getItineraryMapConfig: vi.fn(),
}));
vi.mock("@/lib/trip-weather.fn", () => ({ getTripWeather: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Home trip card (design C1)", () => {
  it("shows the route, weather, next activity, numbers and the Ringkas button", async () => {
    vi.mocked(getItineraryMapConfig).mockResolvedValue(DEFAULT_ITINERARY_MAP_CONFIG);
    vi.mocked(getTripWeather).mockResolvedValue({
      status: "ok",
      days: [{ date: key, code: 61, tempMax: 16, tempMin: 12, rainPercent: 94 }],
    });
    render(<HomeMyTripsWidget signedIn />);
    expect(await screen.findByText("Sedang berlangsung · Hari ke-1")).toBeTruthy();
    expect(screen.getByTestId("map").dataset["pins"]).toBe("1:ngopi");
    expect(screen.getByLabelText("Buka peta di Ringkas")).toBeTruthy();
    expect(await screen.findByText(/16°/)).toBeTruthy();
    expect(screen.getByText("ngopi")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(screen.getByText("10 jt")).toBeTruthy();
    expect(screen.getByText("Buka Ringkas")).toBeTruthy();
    expect(screen.queryByText("Lanjutkan persiapan")).toBeNull();
  });

  it("drops the route and the weather when Admin switches them off", async () => {
    vi.mocked(getItineraryMapConfig).mockResolvedValue({
      ...DEFAULT_ITINERARY_MAP_CONFIG,
      summaryMap: false,
      weather: false,
    });
    render(<HomeMyTripsWidget signedIn />);
    await screen.findByText("Buka Ringkas");
    await waitFor(() => expect(screen.queryByTestId("map")).toBeNull());
    expect(screen.getByText("ngopi")).toBeTruthy();
  });
});
