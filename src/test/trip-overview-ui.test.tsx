import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripOverview } from "@/components/trip-overview";
import { deleteItinerary, patchChecklist } from "@/lib/my-trips.fn";
import { getTripWeather } from "@/lib/trip-weather.fn";
import { DEFAULT_ITINERARY_MAP_CONFIG } from "@/lib/itinerary-map";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...(rest as object)}>{children}</a>
  ),
  useNavigate: () => navigate,
}));
vi.mock("@/lib/my-trips.fn", () => ({
  deleteItinerary: vi.fn(async () => ({})),
  patchChecklist: vi.fn(async () => ({})),
}));
vi.mock("@/components/itinerary-map", () => ({
  default: ({ pins, activeId }: { pins: { id: string }[]; activeId: string | null }) => (
    <div
      data-testid="map"
      data-pins={pins.map((p) => p.id).join(",")}
      data-active={activeId ?? ""}
    />
  ),
}));
vi.mock("@/lib/trip-weather.fn", () => ({
  getTripWeather: vi.fn(async () => ({ status: "ok", days: [] })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const day = new Date();
const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

const base = {
  tripId: "t1",
  name: "spring",
  destination: "Jepang",
  dayLabel: "Hari ke-2",
  datesLabel: "Jepang · 3 Nov – 4 Nov",
  itinerary: [
    {
      id: "a1",
      title: "ngopi",
      activity_date: key,
      start_time: "10:00",
      location: "Fuglen",
      latitude: 35.67,
      longitude: 139.69,
    },
    {
      id: "a2",
      title: "Makan siang",
      activity_date: key,
      start_time: "13:00",
      location: "Ichiran",
    },
  ],
  checklist: [{ id: "c1", title: "eSIM Jepang", is_completed: false }],
  bookings: [{ id: "b1", title: "Hotel", status: "confirmed" }],
  budgetSet: true,
  remainingLabel: "Rp 7.550.000",
  remainingMinor: 755_000_000,
  mapConfig: DEFAULT_ITINERARY_MAP_CONFIG,
  onMenu: vi.fn(),
  onChanged: vi.fn(async () => {}),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TripOverview (Ringkas)", () => {
  it("shows the day's pins, the stats and the agenda rows", () => {
    render(<TripOverview {...base} />);
    expect(screen.getByTestId("map").dataset["pins"]).toBe("a1");
    expect(screen.getAllByText("ngopi")[0]).toBeTruthy();
    expect(screen.getByText("Makan siang")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(screen.getByText("7,6 jt")).toBeTruthy();
    expect(screen.getByText("1 aktif")).toBeTruthy();
  });

  it("focuses a pin when its row is tapped", () => {
    render(<TripOverview {...base} />);
    fireEvent.click(screen.getAllByText("ngopi").at(-1)!);
    expect(screen.getByTestId("map").dataset["active"]).toBe("a1");
  });

  it("drops the map when Admin turns the Ringkas map off, keeping the lists", () => {
    render(
      <TripOverview {...base} mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, summaryMap: false }} />,
    );
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getAllByText("ngopi")[0]).toBeTruthy();
  });

  it("completes a checklist item without leaving the page", async () => {
    render(<TripOverview {...base} />);
    fireEvent.click(screen.getByLabelText("Tandai selesai: eSIM Jepang"));
    await waitFor(() =>
      expect(patchChecklist).toHaveBeenCalledWith({ data: { id: "c1", completed: true } }),
    );
    expect(base.onChanged).toHaveBeenCalled();
  });

  it("deletes an activity from the row menu after confirming", async () => {
    render(<TripOverview {...base} />);
    fireEvent.click(screen.getByLabelText("Menu ngopi"));
    fireEvent.click(await screen.findByText("Hapus"));
    fireEvent.click(await screen.findByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(deleteItinerary).toHaveBeenCalledWith({ data: { id: "a1" } }));
  });

  it("opens the right editor from the add sheet", async () => {
    render(<TripOverview {...base} />);
    fireEvent.click(screen.getByLabelText("Tambah"));
    fireEvent.click((await screen.findAllByText("Catat biaya")).at(-1)!);
    expect(navigate).toHaveBeenCalledWith({
      to: "/my-trips/$tripId/$section",
      params: { tripId: "t1", section: "expenses" },
      search: { add: true },
    });
  });

  it("merges Mode perjalanan: shows the next activity with a route link and the budget shortcut", () => {
    render(<TripOverview {...base} />);
    expect(screen.queryByText("Mode perjalanan")).toBeNull();
    expect(screen.getAllByText(/Berikutnya|Sedang berlangsung/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Catat biaya").length).toBe(1);
    expect(screen.getByText("Sisa anggaran")).toBeTruthy();
  });

  it("has the same three map buttons as the Agenda map", () => {
    render(<TripOverview {...base} />);
    const expand = screen.getByLabelText("Buka peta layar penuh");
    fireEvent.click(expand);
    expect(screen.getByLabelText("Tutup peta layar penuh")).toBeTruthy();
    const focus = screen.getByLabelText("Mode fokus: hanya titik agenda");
    fireEvent.click(focus);
    expect(screen.getByLabelText("Matikan mode fokus").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Lokasi saya")).toBeTruthy();
  });

  it("shows the forecast per day and selects a day from it", async () => {
    vi.mocked(getTripWeather).mockResolvedValueOnce({
      status: "ok",
      days: [{ date: key, code: 61, tempMax: 19, tempMin: 11, rainPercent: 70 }],
    });
    render(<TripOverview {...base} />);
    const card = await screen.findByLabelText(/^Hari ini: Hujan, 19 derajat/);
    expect(card.textContent).toContain("19°");
    expect(screen.getByText(/hujan 70%/)).toBeTruthy();
    expect(getTripWeather).toHaveBeenCalledWith({
      data: { places: [{ date: key, lat: 35.67, lng: 139.69 }] },
    });
  });

  it("hides the forecast when Admin turns weather off", () => {
    render(
      <TripOverview {...base} mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, weather: false }} />,
    );
    expect(getTripWeather).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Prakiraan cuaca")).toBeNull();
  });

  it("merges the day chips and the weather into one row above the next-activity card", async () => {
    vi.mocked(getTripWeather).mockResolvedValueOnce({
      status: "ok",
      days: [{ date: key, code: 61, tempMax: 19, tempMin: 11, rainPercent: 70 }],
    });
    render(<TripOverview {...base} />);
    const chip = await screen.findByLabelText(/^Hari ini: Hujan/);
    expect(chip.textContent).toContain("19°");
    expect(screen.queryByLabelText("Prakiraan cuaca")).toBeNull();
    const row = screen.getByLabelText("Hari dan cuaca");
    expect(row.contains(chip)).toBe(true);
    const nextCard = screen.getAllByText("Berikutnya")[0]!;
    expect(row.compareDocumentPosition(nextCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("links to Google Flights only when Admin leaves flight tickets on", () => {
    const url = "https://www.google.com/travel/flights?q=Flights%20to%20Jepang";
    const { rerender } = render(<TripOverview {...base} flightsUrl={url} />);
    const link = screen.getByRole("link", { name: /Cari tiket pesawat/ });
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    rerender(<TripOverview {...base} flightsUrl={null} />);
    expect(screen.queryByText("Cari tiket pesawat")).toBeNull();
  });
});
