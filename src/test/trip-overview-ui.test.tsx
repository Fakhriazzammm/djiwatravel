import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripOverview } from "@/components/trip-overview";
import { deleteItinerary, patchChecklist } from "@/lib/my-trips.fn";
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
    expect(screen.getByText("ngopi")).toBeTruthy();
    expect(screen.getByText("Makan siang")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
    expect(screen.getByText("7,6 jt")).toBeTruthy();
    expect(screen.getByText("1 aktif")).toBeTruthy();
  });

  it("focuses a pin when its row is tapped", () => {
    render(<TripOverview {...base} />);
    fireEvent.click(screen.getByText("ngopi"));
    expect(screen.getByTestId("map").dataset["active"]).toBe("a1");
  });

  it("drops the map when Admin turns the Ringkas map off, keeping the lists", () => {
    render(
      <TripOverview {...base} mapConfig={{ ...DEFAULT_ITINERARY_MAP_CONFIG, summaryMap: false }} />,
    );
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByText("ngopi")).toBeTruthy();
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
    fireEvent.click(await screen.findByText("Catat biaya"));
    expect(navigate).toHaveBeenCalledWith({
      to: "/my-trips/$tripId/$section",
      params: { tripId: "t1", section: "expenses" },
      search: { add: true },
    });
  });
});
