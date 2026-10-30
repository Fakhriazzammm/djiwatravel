import { describe, expect, it } from "vitest";
import { buildMyTripsHome, getMyTripsActions } from "@/lib/my-trips-home";
import { isLocalDevelopmentHost } from "@/lib/local-development";

const trip = (id: string, status: "upcoming" | "ongoing" | "past", departure: string) => ({
  id,
  name: id,
  destination_name: id,
  status,
  departure_date: departure,
  return_date: departure,
  travelers_count: 1,
  primary_currency: "IDR",
  total_budget_minor: 0,
  spent_minor: 0,
  checklist_total: 0,
  checklist_done: 0,
  itinerary_count: 0,
  booking_count: 0,
});

describe("my trips home read model", () => {
  it("prioritizes an ongoing trip over upcoming trips", () => {
    const result = buildMyTripsHome(
      [trip("future", "upcoming", "2026-11-01"), trip("now", "ongoing", "2026-10-20")],
      [{ trip_id: "now", title: "Check-in", activity_date: "2026-10-27" }],
      [{ trip_id: "now", id: "passport", title: "Passport", is_completed: false }],
    );

    expect(result.focusTrip?.id).toBe("now");
    expect(result.agenda).toHaveLength(1);
    expect(result.checklist).toHaveLength(1);
  });

  it("limits the auth bypass to loopback development hosts", () => {
    expect(isLocalDevelopmentHost("localhost")).toBe(true);
    expect(isLocalDevelopmentHost("127.0.0.1")).toBe(true);
    expect(isLocalDevelopmentHost("djiwatravel.com")).toBe(false);
  });

  it("returns a safe empty focus when there are no active trips", () => {
    const result = buildMyTripsHome([trip("past", "past", "2026-01-01")], [], []);

    expect(result.focusTrip).toBeNull();
    expect(result.agenda).toEqual([]);
    expect(result.checklist).toEqual([]);
  });

  it("keeps every saved trip available for the home list", () => {
    const result = buildMyTripsHome(
      [
        trip("now", "ongoing", "2026-10-20"),
        trip("next", "upcoming", "2026-11-01"),
        trip("past", "past", "2026-01-01"),
      ],
      [],
      [],
    );

    expect(result.focusTrip?.id).toBe("now");
    expect(result.trips.map((item) => item.id)).toEqual(["now", "next", "past"]);
  });

  it("keeps the empty state actionable with a new-trip action", () => {
    expect(getMyTripsActions(false)).toEqual([{ id: "new-trip", label: "Buat perjalanan" }]);
  });

  it("exposes every focus-trip action for the action sheet", () => {
    expect(getMyTripsActions(true).map((action) => action.id)).toEqual([
      "new-trip",
      "itinerary",
      "checklist",
      "budget",
      "bookings",
      "share",
    ]);
  });
});
