import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryEditor } from "@/routes/my-trips.$tripId.$section";
import { patchItinerary, postItinerary } from "@/lib/my-trips.fn";
import { searchPlaces } from "@/lib/itinerary-map.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG } from "@/lib/itinerary-map";
import { registerMapSearch } from "@/lib/map-place-search";
import { searchPhotonInBrowser } from "@/lib/browser-photon";
import { countryBoundsFor } from "@/lib/trip-country-bounds";

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
  patchItinerary: vi.fn(),
}));
vi.mock("@/lib/itinerary-map.fn", () => ({
  searchPlaces: vi.fn(),
  getItineraryMapConfig: vi.fn(),
  getPlaceImage: vi.fn(async () => ({ image: null })),
  resolveItemImage: vi.fn(async () => ({ url: null, checked: true })),
  reversePlace: vi.fn(async () => ({ place: null, status: "ok" })),
}));
vi.mock("@/components/itinerary-map", () => ({
  default: ({
    pins,
    activeId,
    focusBounds,
  }: {
    pins: { id: string; n: number }[];
    activeId: string | null;
    focusBounds?: number[] | null;
  }) => (
    <div
      data-testid="map"
      data-pins={pins.map((p) => `${p.n}:${p.id}`).join(",")}
      data-active={activeId ?? ""}
      data-focus={focusBounds ? focusBounds.join(",") : ""}
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
    expect(screen.getByTestId("travel-hop")).toHaveTextContent(/Kereta · ≈\d+ mnt/);
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

  it("opens on the destination country before any activity has a pin", () => {
    render(
      <ItineraryEditor
        tripId="t"
        trip={{
          name: "Spring",
          destination_name: "Jepang",
          destination_code: "JP",
          departure_date: "2026-11-03",
          return_date: "2026-11-04",
        }}
        items={[{ ...items[1]!, id: "z" }]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.getByTestId("map").dataset["pins"]).toBe("");
    expect(screen.getByTestId("map").dataset["focus"]).toBe(countryBoundsFor("JP")!.join(","));
    expect(screen.getByText(/Cari tempat saat menambah aktivitas/)).toBeInTheDocument();
  });

  it("shows no map for a trip without a country and without points", () => {
    render(
      <ItineraryEditor
        tripId="t"
        items={[{ ...items[1]!, id: "z" }]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.queryByTestId("map")).not.toBeInTheDocument();
  });

  it("suggests places from the map even when the server search is unavailable", async () => {
    vi.mocked(searchPlaces).mockResolvedValue({ status: "unavailable", places: [] } as never);
    const off = registerMapSearch({
      search: () => ({
        places: [{ label: "Seizeriya Ueno", subtitle: "Makan", lat: 35.71, lng: 139.77 }],
        zoomedOut: false,
      }),
      focusOn: vi.fn(),
    });
    render(
      <ItineraryEditor
        tripId="t"
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "seizeriya" } });
    expect(await screen.findByRole("button", { name: /Seizeriya Ueno/ })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(screen.getByRole("button", { name: /Seizeriya Ueno/ })).toBeInTheDocument();
    expect(screen.queryByText(/sedang tidak tersedia/)).not.toBeInTheDocument();
    off();
  });

  it("adds venues from the browser's Photon search to the town suggestions", async () => {
    vi.mocked(searchPlaces).mockResolvedValue({
      status: "ok",
      places: [{ label: "Fuglen", subtitle: "Kota", lat: 35.7, lng: 139.7 }],
      attribution: "Data kota: GeoNames (CC BY 4.0)",
    } as never);
    vi.mocked(searchPhotonInBrowser).mockResolvedValue([
      { label: "Fuglen Tokyo", subtitle: "Shibuya, Tokyo", lat: 35.6658, lng: 139.6908 },
    ]);
    render(
      <ItineraryEditor
        tripId="t"
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText(/Lokasi|Cari tempat/), { target: { value: "fuglen" } });
    expect(
      await screen.findByRole("button", { name: /Fuglen Tokyo/ }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/© OpenStreetMap via Photon/)).toBeInTheDocument();
  });

  it("shows the GeoNames attribution under the suggestions it came from", async () => {
    vi.mocked(searchPlaces).mockResolvedValue({
      status: "ok",
      places: [{ label: "Ueno", subtitle: "Tokyo, Jepang", lat: 35.7148, lng: 139.77 }],
      attribution: "Data kota: GeoNames (CC BY 4.0)",
    } as never);
    render(
      <ItineraryEditor
        tripId="t"
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "ueno" } });
    expect(
      await screen.findByText("Data kota: GeoNames (CC BY 4.0)", {}, { timeout: 2000 }),
    ).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "Shibuya" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Shibuya Crossing/ }, { timeout: 2000 }),
    );
    expect(screen.getByText("Titik peta tersimpan.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
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

  it("puts the place first: a picked restaurant fills the title and category, and search is scoped to the city", async () => {
    vi.mocked(searchPlaces).mockResolvedValueOnce({
      places: [{ label: "Saizeriya Shinjuku", subtitle: "Makan · Tokyo", lat: 35.69, lng: 139.7 }],
      status: "ok",
      attribution: null,
    } as never);
    render(
      <ItineraryEditor
        tripId="t"
        trip={{
          name: "Jepang",
          destination_name: "Jepang",
          cities: [
            { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
            { name: "Osaka", lat: 34.6937, lng: 135.5023 },
          ],
          departure_date: null,
          return_date: null,
        }}
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "saizeriya" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /Saizeriya Shinjuku/ }, { timeout: 2000 }),
    );
    expect(screen.getByLabelText("Nama aktivitas")).toHaveValue("Makan di Saizeriya Shinjuku");
    expect(screen.getByLabelText("Kategori (opsional)")).toHaveValue("food");
    expect(searchPlaces).toHaveBeenCalledWith({
      data: { query: "saizeriya", near: { lat: 35.6762, lng: 139.6503 } },
    });
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
    fireEvent.change(screen.getByLabelText(/Cari tempat/), { target: { value: "Shibuya" } });
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("shows the time above the title and marks overlapping activities", () => {
    const rows = [
      {
        id: "x",
        activity_date: "2026-11-04",
        start_time: "10:30:00",
        end_time: "12:00:00",
        title: "Belanja",
        location: null,
      },
      {
        id: "y",
        activity_date: "2026-11-04",
        start_time: "10:00:00",
        end_time: "11:00:00",
        title: "Ngopi",
        location: null,
      },
    ];
    render(
      <ItineraryEditor tripId="t" items={rows} onSaved={vi.fn(async () => {})} mapConfig={null} />,
    );
    const titles = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(titles).toEqual(["Ngopi", "Belanja"]);
    expect(screen.getByText("10:00–11:00")).toBeInTheDocument();
    expect(screen.getAllByText("Jadwal bentrok")).toHaveLength(2);
  });

  it("warns before saving an activity that overlaps another and lets the user keep or change it", async () => {
    vi.mocked(postItinerary).mockResolvedValue({} as never);
    const rows = [
      {
        id: "y",
        activity_date: "2026-11-04",
        start_time: "10:00:00",
        end_time: "11:00:00",
        title: "Ngopi",
        location: null,
      },
    ];
    render(
      <ItineraryEditor tripId="t" items={rows} onSaved={vi.fn(async () => {})} mapConfig={null} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), { target: { value: "Makan" } });
    fireEvent.change(screen.getByLabelText("Mulai"), { target: { value: "10:30" } });
    fireEvent.change(screen.getByLabelText("Selesai"), { target: { value: "11:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Jadwal bertabrakan");
    expect(screen.getByRole("alert")).toHaveTextContent("Ngopi");
    expect(postItinerary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tetap simpan" }));
    await waitFor(() => expect(postItinerary).toHaveBeenCalledOnce());
  });

  it("saves straight away when the time is free", async () => {
    vi.mocked(postItinerary).mockResolvedValue({} as never);
    render(
      <ItineraryEditor tripId="t" items={[]} onSaved={vi.fn(async () => {})} mapConfig={null} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Tambah aktivitas" })[0]!);
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), { target: { value: "Makan" } });
    fireEvent.change(screen.getByLabelText("Mulai"), { target: { value: "10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(postItinerary).toHaveBeenCalledOnce());
  });

  it("edits an activity in place and does not flag it against itself", async () => {
    vi.mocked(patchItinerary).mockResolvedValue({} as never);
    const rows = [
      {
        id: "y",
        activity_date: "2026-11-04",
        start_time: "10:00:00",
        end_time: "11:00:00",
        title: "Ngopi",
        location: "Fuglen",
        activity_category: "food",
      },
    ];
    render(
      <ItineraryEditor tripId="t" items={rows} onSaved={vi.fn(async () => {})} mapConfig={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ubah Ngopi" }));
    expect(screen.getByRole("form", { name: "Ubah aktivitas" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama aktivitas")).toHaveValue("Ngopi");
    expect(screen.getByLabelText("Mulai")).toHaveValue("10:00");
    fireEvent.change(screen.getByLabelText("Nama aktivitas"), { target: { value: "Ngopi pagi" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() =>
      expect(patchItinerary).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: "y",
          title: "Ngopi pagi",
          startTime: "10:00",
          endTime: "11:00",
        }),
      }),
    );
    expect(postItinerary).not.toHaveBeenCalled();
  });

  it("keeps other days on the map in grey while numbering each day from 1", () => {
    const rows = [
      {
        id: "a",
        activity_date: "2026-11-04",
        start_time: "10:00:00",
        title: "A",
        latitude: 35.6,
        longitude: 139.7,
      },
      {
        id: "b",
        activity_date: "2026-11-05",
        start_time: "10:00:00",
        title: "B",
        latitude: 35.7,
        longitude: 139.8,
      },
    ];
    render(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.getByTestId("map").dataset["pins"]).toBe("1:a,1:b");
    expect(screen.getAllByLabelText("Titik 1 di peta")).toHaveLength(2);
  });

  it("shows a place photo when one is known, and nothing otherwise", () => {
    const rows = [
      {
        id: "a",
        activity_date: "2026-11-04",
        title: "Kuil Senso-ji",
        location: "Asakusa",
        latitude: 35.7,
        longitude: 139.8,
        place_image_url: "https://upload.wikimedia.org/x.jpg",
        place_image_checked_at: "2026-11-04",
      },
      {
        id: "b",
        activity_date: "2026-11-04",
        title: "Kafe",
        location: "Ueno",
        latitude: 35.71,
        longitude: 139.77,
        place_image_url: "https://evil.example/x.jpg",
        place_image_checked_at: "2026-11-04",
      },
    ];
    render(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    expect(screen.getByRole("img", { name: "Foto Asakusa" })).toHaveAttribute(
      "src",
      "https://upload.wikimedia.org/x.jpg",
    );
    expect(screen.queryByRole("img", { name: "Foto Ueno" })).not.toBeInTheDocument();
  });

  it("toggles focus mode and offers my-location only when Admin allows it", () => {
    const rows = [
      { id: "a", activity_date: "2026-11-04", title: "A", latitude: 35.6, longitude: 139.7 },
    ];
    const { rerender } = render(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    const focus = screen.getByRole("button", { name: /Mode fokus/ });
    expect(focus).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(focus);
    expect(screen.getByRole("button", { name: "Matikan mode fokus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Lokasi saya" })).toBeInTheDocument();
    rerender(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, locateMe: false }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Lokasi saya" })).not.toBeInTheDocument();
  });

  it("finds the traveler and offers to add an activity at that spot", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({
        coords: { latitude: 35.659, longitude: 139.7006, accuracy: 18 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    const rows = [
      { id: "a", activity_date: "2026-11-04", title: "A", latitude: 35.7, longitude: 139.8 },
    ];
    render(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lokasi saya" }));
    expect(await screen.findByText("Lokasi kamu")).toBeInTheDocument();
    expect(screen.getByText(/±18 m/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tambah di sini" }));
    expect(await screen.findByRole("form", { name: "Tambah aktivitas" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Cari tempat/ })).toHaveValue("Lokasi saya");
    expect(screen.getByText("Titik peta tersimpan.")).toBeInTheDocument();
  });

  it("says which trip the agenda belongs to", () => {
    render(
      <ItineraryEditor
        tripId="t"
        trip={{
          name: "spring",
          destination_name: "Tokyo",
          departure_date: "2026-11-03",
          return_date: "2026-11-09",
        }}
        items={[]}
        onSaved={vi.fn(async () => {})}
        mapConfig={null}
      />,
    );
    expect(screen.getByRole("heading", { name: "Mau ke mana saja di Tokyo?" })).toBeInTheDocument();
    expect(screen.getByText(/^spring · 3–9 Nov 2026$/)).toBeInTheDocument();
  });

  it("has the mascot ask friendly questions and act when tapped", async () => {
    const rows = [
      { id: "a", activity_date: "2026-11-04", title: "A", latitude: 35.6, longitude: 139.7 },
    ];
    render(
      <ItineraryEditor
        tripId="t"
        items={rows}
        onSaved={vi.fn(async () => {})}
        mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
      />,
    );
    const bubble = await screen.findByTestId("agenda-mascot-bubble");
    expect(bubble).toHaveTextContent("Ke mana lagi ya?");
    fireEvent.click(bubble);
    expect(await screen.findByRole("form", { name: "Tambah aktivitas" })).toBeInTheDocument();
    expect(screen.getByTestId("agenda-mascot-bubble")).toHaveTextContent("Yuk catat rencananya!");
  });

  it("turns on a map category when the mascot suggests it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const rows = [
        { id: "a", activity_date: "2026-11-04", title: "A", latitude: 35.6, longitude: 139.7 },
      ];
      render(
        <ItineraryEditor
          tripId="t"
          items={rows}
          onSaved={vi.fn(async () => {})}
          mapConfig={DEFAULT_ITINERARY_MAP_CONFIG}
        />,
      );
      expect(screen.getByRole("button", { name: /^Hotel$/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      for (let i = 0; i < 4; i += 1) await act(async () => void vi.advanceTimersByTime(6600));
      const bubble = screen.getByTestId("agenda-mascot-bubble");
      expect(bubble).toHaveTextContent("Perlu cari penginapan?");
      fireEvent.click(bubble);
      expect(screen.getByRole("button", { name: /^Hotel$/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
