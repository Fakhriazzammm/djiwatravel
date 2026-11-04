import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceIdeasFeature } from "@/components/place-ideas";
import { loadPlaceIdeas } from "@/lib/place-ideas.fn";
import { deleteItinerary, postItinerary } from "@/lib/my-trips.fn";
import type { PlaceIdea } from "@/lib/place-ideas";

vi.mock("@/lib/place-ideas.fn", () => ({ loadPlaceIdeas: vi.fn() }));
vi.mock("@/lib/my-trips.fn", () => ({ postItinerary: vi.fn(), deleteItinerary: vi.fn() }));

const idea = (over: Partial<PlaceIdea> = {}): PlaceIdea => ({
  key: "tomigaya-park@35.668,139.688",
  name: "Tomigaya Park",
  category: "nature",
  why: "Taman kecil, sepi siang hari.",
  area: "Shibuya",
  lat: 35.668,
  lng: 139.688,
  sourceHost: "japan.travel",
  sourceUrl: "https://japan.travel/park",
  imageUrl: null,
  ...over,
});

const days = [
  {
    date: "2026-11-04",
    label: "Rab, 4 Nov",
    items: [{ start: "10:00", end: "11:00", lat: 35.67, lng: 139.69 }],
  },
  { date: "2026-11-05", label: "Kam, 5 Nov", items: [] },
];
const status = { available: true, showStrip: true, dailyLimit: 12, remaining: 11 };

function setup(over: Partial<React.ComponentProps<typeof PlaceIdeasFeature>> = {}) {
  const onOpenChange = vi.fn();
  const onAdded = vi.fn(async () => {});
  const utils = render(
    <PlaceIdeasFeature
      tripId="trip-1"
      destination="Tokyo"
      status={status}
      days={days}
      defaultDate="2026-11-04"
      open={false}
      onOpenChange={onOpenChange}
      onAdded={onAdded}
      {...over}
    />,
  );
  return { onOpenChange, onAdded, ...utils };
}

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadPlaceIdeas).mockResolvedValue({
    status: "ok",
    ideas: [idea(), idea({ key: "k2", name: "Koffee Mameya", category: "cafe" })],
    cached: true,
    remaining: 11,
    destination: "Tokyo",
  });
});

describe("ide tempat di Agenda", () => {
  it("renders nothing when the feature is unavailable and never calls the server", () => {
    const { container } = setup({ status: { ...status, available: false } });
    expect(container).toBeEmptyDOMElement();
    expect(loadPlaceIdeas).not.toHaveBeenCalled();
  });

  it("shows a small carousel on arrival, and Lainnya opens the sheet", async () => {
    const { onOpenChange } = setup();
    expect(await screen.findByText("Tomigaya Park")).toBeInTheDocument();
    expect(screen.getByText("Ide tempat di Tokyo")).toBeInTheDocument();
    expect(loadPlaceIdeas).toHaveBeenCalledWith({
      data: { tripId: "trip-1", category: "all", query: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lainnya" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("hides the carousel when Admin turns it off but keeps the sheet available", async () => {
    setup({ status: { ...status, showStrip: false } });
    expect(screen.queryByTestId("place-ideas-strip")).not.toBeInTheDocument();
    expect(loadPlaceIdeas).not.toHaveBeenCalled();
  });

  it("opens the list in the sheet and searches with a free-text query", async () => {
    setup({ open: true });
    expect(await screen.findByRole("heading", { name: "Ke mana lagi ya?" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cari tempat"), { target: { value: "ramen" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(loadPlaceIdeas).toHaveBeenCalledWith({
        data: { tripId: "trip-1", category: "all", query: "ramen" },
      }),
    );
  });

  it("adds an idea with its place, a suggested time after the last activity, and an undo", async () => {
    vi.mocked(postItinerary).mockResolvedValue({ id: "item-9" } as never);
    vi.mocked(deleteItinerary).mockResolvedValue({} as never);
    const { onAdded } = setup({ open: true });
    fireEvent.click((await screen.findAllByText("Tomigaya Park"))[0]!);
    // 10:00-11:00 is taken, so the suggestion starts at 11:30.
    expect(await screen.findByDisplayValue("11:30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12:30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tambah ke Rab, 4 Nov" }));
    await waitFor(() =>
      expect(postItinerary).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: "trip-1",
          title: "Tomigaya Park",
          activityDate: "2026-11-04",
          startTime: "11:30",
          endTime: "12:30",
          latitude: 35.668,
          longitude: 139.688,
          activityCategory: "attraction",
        }),
      }),
    );
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
  });

  it("suggests the free slot of another day when that day is chosen", async () => {
    setup({ open: true });
    fireEvent.click((await screen.findAllByText("Tomigaya Park"))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Kam, 5 Nov" }));
    expect(await screen.findByDisplayValue("10:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah ke Kam, 5 Nov" })).toBeInTheDocument();
  });

  it("explains a failed search and offers a retry while quota remains", async () => {
    vi.mocked(loadPlaceIdeas).mockResolvedValue({
      status: "error",
      message: "Ide belum bisa dimuat. Coba lagi sebentar.",
      remaining: 5,
    });
    setup({ open: true });
    expect(
      await screen.findByText("Ide belum bisa dimuat. Coba lagi sebentar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });
});
