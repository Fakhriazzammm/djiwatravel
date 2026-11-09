import { beforeEach, describe, expect, it, vi } from "vitest";
import { tripStoryImages } from "@/lib/trip-share-image";
import { getSharedTrip } from "@/lib/my-trips.fn";
import { renderShareCard } from "@/lib/share-card";

vi.mock("@/lib/my-trips.fn", () => ({ getSharedTrip: vi.fn() }));
vi.mock("@/lib/share-card", async (original) => ({
  ...(await original<typeof import("@/lib/share-card")>()),
  renderShareCard: vi.fn(async () => [new Blob(["png"], { type: "image/png" })]),
}));

function fixture(title: string, notes: string) {
  return {
    owner: { firstName: "Rani", handle: "rani" },
    trip: {
      name: "Tokyo",
      destination_name: "Jepang",
      departure_date: "2026-11-08",
      return_date: "2026-11-15",
      travelers_count: 2,
    },
    itinerary: [
      {
        activity_date: "2026-11-08",
        start_time: "10:00",
        end_time: "12:00",
        title,
        location: "Asakusa",
        activity_category: "attraction",
        notes,
        place_image_url: null,
      },
    ],
  } as unknown as Awaited<ReturnType<typeof getSharedTrip>>;
}

beforeEach(() => vi.clearAllMocks());

describe("fresh itinerary image exports", () => {
  it("re-reads the public token for each export and includes the latest names, category, duration and traveler count", async () => {
    vi.mocked(getSharedTrip)
      .mockResolvedValueOnce(fixture("Temple", "Buka 06:00-17:00"))
      .mockResolvedValueOnce(fixture("Museum", "Buka 09:30-17:00"));
    const first = await tripStoryImages(
      "public-token",
      "https://djiwatravel.com/share/rani/public-token",
    );
    const second = await tripStoryImages(
      "public-token",
      "https://djiwatravel.com/share/rani/public-token",
    );
    expect(getSharedTrip).toHaveBeenCalledTimes(2);
    expect(first).toHaveLength(1);
    expect(second[0]?.type).toBe("image/png");
    expect(renderShareCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        owner: "Rani",
        travelers: 2,
        days: 1,
        activities: 1,
        highlights: [
          expect.objectContaining({
            title: "Museum",
            notes: "Buka 09:30-17:00",
            category: "attraction",
            durationMinutes: 120,
          }),
        ],
      }),
    );
  });

  it("refuses an export after the public share has been revoked instead of using old page data", async () => {
    vi.mocked(getSharedTrip).mockResolvedValue(null);
    await expect(
      tripStoryImages("revoked", "https://djiwatravel.com/share/revoked"),
    ).rejects.toThrow("share unavailable");
    expect(renderShareCard).not.toHaveBeenCalled();
  });
});
