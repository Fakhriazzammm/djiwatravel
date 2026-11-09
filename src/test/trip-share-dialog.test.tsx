import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripShareDialog } from "@/components/trip-share-sheet";
import { getTripShare, postTripShare } from "@/lib/my-trips.fn";

vi.mock("@/lib/my-trips.fn", () => ({
  getTripShare: vi.fn(),
  postTripShare: vi.fn(),
  deleteTripShare: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const trip = { id: "t1", name: "spring", destination_name: "Jepang" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TripShareDialog (My Trips list)", () => {
  it("shows the trip's active link with copy and share actions", async () => {
    vi.mocked(getTripShare).mockResolvedValue({ token: "t".repeat(32), createdAt: "2026-11-04", handle: "fakhri" });
    render(<TripShareDialog trip={trip} onOpenChange={() => undefined} />);
    const input = await screen.findByLabelText("Tautan itinerary");
    await waitFor(() =>
      expect((input as HTMLInputElement).value).toContain(`/share/fakhri/${"t".repeat(32)}`),
    );
    expect(screen.getByText("Salin")).toBeTruthy();
    expect(screen.getByText("Bagikan ke Instagram Story")).toBeTruthy();
    expect(screen.getByText("WhatsApp")).toBeTruthy();
  });

  it("creates a link when the trip has none, then reloads it", async () => {
    vi.mocked(getTripShare)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ token: "u".repeat(32), createdAt: "2026-11-04", handle: "fakhri" });
    vi.mocked(postTripShare).mockResolvedValue({ token: "u".repeat(32), createdAt: "2026-11-04", handle: "fakhri" });
    render(<TripShareDialog trip={trip} onOpenChange={() => undefined} />);
    fireEvent.click(await screen.findByText("Buat tautan bagikan"));
    await waitFor(() => expect(postTripShare).toHaveBeenCalledWith({ data: { tripId: "t1" } }));
    expect(await screen.findByLabelText("Tautan itinerary")).toBeTruthy();
  });

  it("renders nothing without a trip", () => {
    const { container } = render(<TripShareDialog trip={null} onOpenChange={() => undefined} />);
    expect(container.innerHTML).toBe("");
    expect(getTripShare).not.toHaveBeenCalled();
  });
});
