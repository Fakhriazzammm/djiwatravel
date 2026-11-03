import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryEditor } from "@/routes/my-trips.$tripId.$section";
import { postItinerary } from "@/lib/my-trips.fn";
import { searchPlaces } from "@/lib/itinerary-map.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG } from "@/lib/itinerary-map";

vi.mock("@/lib/my-trips.fn", () => ({
  deleteBookingRecord: vi.fn(),
  deleteBudgetCategoryRecord: vi.fn(),
  postBudgetCategory: vi.fn(),
  deleteChecklist: vi.fn(),
  deleteExpense: vi.fn(),
  deleteItinerary: vi.fn(),
  getTripSection: vi.fn(),
  patchBudget: vi.fn(),
  patchChecklist: vi.fn(),
  postBooking: vi.fn(),
  postChecklist: vi.fn(),
  postExpense: vi.fn(),
  postItinerary: vi.fn(),
}));
vi.mock("@/lib/itinerary-map.fn", () => ({
  searchPlaces: vi.fn(),
  getItineraryMapConfig: vi.fn(),
}));
vi.mock("@/components/itinerary-map", () => ({
  default: ({ pins, activeId }: { pins: { id: string; n: number }[]; activeId: string | null }) => (
    <div
      data-testid="map"
      data-pins={pins.map((p) => `${p.n}:${p.id}`).join(",")}
      data-active={activeId ?? ""}
    />
  ),
}));

const items = [
  {
    id: "a",
    activity_date: "2026-11-03",
    start_time: "10:00",
    title: "Makan",
    location: "Shibuya",
    latitude: 35.659,
    longitude: 139.7006,
  },
  {
    id: "b",
    activity_date: "2026-11-03",
    start_time: "12:00",
    title: "Istirahat",
    location: null,
    latitude: null,
    longitude: null,
  },
  {
    id: "c",
    activity_date: "2026-11-03",
    start_time: "14:00",
    title: "Kuil Senso-ji",
    location: "Asakusa",
    latitude: 35.7148,
    longitude: 139.7967,
  },
];

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

describe("agenda map", () => {
  it("numbers pinned activities, links each to Google Maps and highlights on tap", () => {
    render(
      <ItineraryEditor
        tripId="t"
        items={items}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.getByTestId("map").dataset["pins"]).toBe("1:a,2:c");
    expect(screen.getByLabelText("Titik 2 di peta")).toBeInTheDocument();
    const route = screen.getByRole("link", { name: /Rute ke Makan/ });
    expect(route).toHaveAttribute(
      "href",
      expect.stringContaining("destination=35.659000%2C139.700600"),
    );
    expect(route).toHaveAttribute("target", "_blank");
    expect(screen.getAllByRole("link", { name: /Rute ke/ })).toHaveLength(2);
    expect(screen.getAllByText(/±/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Kuil Senso-ji"));
    expect(screen.getByTestId("map").dataset["active"]).toBe("c");
  });

  it("hides the map when Admin turns it off but keeps the list", () => {
    render(
      <ItineraryEditor
        tripId="t"
        items={items}
        onSaved={vi.fn(async () => {})}
        mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, enabled: false }}
      />,
    );
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
    expect(screen.getByText("Makan")).toBeInTheDocument();
  });

  it("explains how to get pins when no activity has a point yet", () => {
    render(
      <ItineraryEditor
        tripId="t"
        items={[{ ...items[1]!, id: "z" }]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.getByText(/Cari tempat saat menambah aktivitas/)).toBeInTheDocument();
  });

  it("saves coordinates when a place suggestion is chosen, and none for typed text", async () => {
    vi.mocked(searchPlaces).mockResolvedValue({
      status: "ok",
      places: [{ label: "Shibuya Crossing", subtitle: "Tokyo, Japan", lat: 35.659, lng: 139.7006 }],
    } as never);
    vi.mocked(postItinerary).mockResolvedValue({} as never);
    render(
      <ItineraryEditor
        tripId="t"
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), { target: { value: "Makan" } });
    fireEvent.change(screen.getByLabelText(/Lokasi/), { target: { value: "Shibuya" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Shibuya Crossing/ }, { timeout: 2000 }),
    );
    expect(screen.getByText("Titik peta tersimpan.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simpan aktivitas" }));
    await waitFor(() =>
      expect(postItinerary).toHaveBeenCalledWith({
        data: expect.objectContaining({
          location: "Shibuya Crossing",
          latitude: 35.659,
          longitude: 139.7006,
        }),
      }),
    );
  });

  it("does not search when Admin disabled place search", () => {
    render(
      <ItineraryEditor
        tripId="t"
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, placeSearch: false }}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText(/Lokasi/), { target: { value: "Shibuya" } });
    expect(searchPlaces).not.toHaveBeenCalled();
  });
});
