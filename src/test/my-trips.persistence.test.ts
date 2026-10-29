import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { syncItineraryItem } from "@/lib/google-calendar.server";
import {
  addBooking,
  addChecklistItem,
  addExpense,
  addItineraryItem,
  deleteTrip,
  deleteBooking,
  deleteChecklistItem,
  deleteItineraryItem,
  deleteTripItem,
  patchBudgetCategory,
  toggleChecklist,
} from "@/lib/my-trips.server";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/google-calendar.server", () => ({ syncItineraryItem: vi.fn() }));

const tripId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const ownerId = "better-auth-user-1";
const query = vi.mocked(pool.query);
const authenticate = vi.mocked(getAuthenticatedUser);
const syncCalendar = vi.mocked(syncItineraryItem);

function queueOwnedTripAndItem(row: Record<string, unknown> = { id: itemId }) {
  query.mockResolvedValueOnce({ rows: [{ id: tripId }] } as never);
  query.mockResolvedValueOnce({ rows: [row] } as never);
}

describe("My Trips isolated persistence flows", () => {
  beforeEach(() => {
    query.mockReset();
    authenticate.mockReset();
    syncCalendar.mockReset();
    syncCalendar.mockResolvedValue(undefined);
    authenticate.mockResolvedValue({ id: ownerId, email: "traveler@example.test" });
  });

  it("persists an itinerary with date, local times, and category after checking trip ownership", async () => {
    queueOwnedTripAndItem({ id: itemId, title: "Museum" });

    await expect(
      addItineraryItem({
        tripId,
        activityDate: "2026-11-01",
        startTime: "09:30",
        endTime: "10:30",
        title: "Museum",
        location: "Tokyo",
        activityCategory: "attraction",
      }),
    ).resolves.toMatchObject({ title: "Museum" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("customer_auth_subject = $2");
    expect(query.mock.calls[1]?.[0]).toContain("insert into travel_itinerary_items");
    expect(query.mock.calls[1]?.[1]).toEqual([
      tripId,
      "2026-11-01",
      "09:30",
      "10:30",
      null,
      "Museum",
      "Tokyo",
      null,
      null,
      null,
      null,
      "attraction",
    ]);
    expect(syncCalendar).toHaveBeenCalledWith(itemId, ownerId);
  });

  it("persists an itinerary that continues past midnight", async () => {
    queueOwnedTripAndItem({ id: itemId, title: "Night train" });

    await expect(
      addItineraryItem({
        tripId,
        activityDate: "2026-11-01",
        startTime: "22:00",
        endTime: "02:00",
        title: "Night train",
      }),
    ).resolves.toMatchObject({ title: "Night train" });
  });

  it("waits for the new itinerary item calendar sync before completing", async () => {
    let releaseSync!: () => void;
    syncCalendar.mockImplementation(
      () => new Promise<void>((resolve) => {
        releaseSync = resolve;
      }),
    );
    queueOwnedTripAndItem({ id: itemId, title: "Museum" });

    let completed = false;
    const save = addItineraryItem({
      tripId,
      activityDate: "2026-11-01",
      title: "Museum",
    }).then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(syncCalendar).toHaveBeenCalled());
    expect(completed).toBe(false);

    releaseSync();
    await save;
    expect(completed).toBe(true);
  });

  it("persists a booking after checking trip ownership", async () => {
    queueOwnedTripAndItem({ id: itemId, title: "Hotel" });

    await expect(
      addBooking({ tripId, category: "Hotel", title: "Hotel Shinjuku", provider: "Example" }),
    ).resolves.toMatchObject({ title: "Hotel" });

    expect(query.mock.calls[1]?.[0]).toContain("insert into travel_bookings");
    expect(query.mock.calls[1]?.[1]).toEqual([
      tripId,
      "Hotel",
      "Hotel Shinjuku",
      null,
      "Example",
      null,
      null,
    ]);
  });

  it("deletes only a trip owned by the authenticated user", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: tripId }] } as never);

    await expect(deleteTrip({ id: tripId })).resolves.toEqual({ id: tripId });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("delete from travel_trips");
    expect(query.mock.calls[0]?.[1]).toEqual([tripId, ownerId]);
  });

  it("persists original and converted expense amounts in minor units", async () => {
    queueOwnedTripAndItem({ id: itemId, description: "Train" });

    await addExpense({
      tripId,
      description: "Train",
      transactionDate: "2026-11-01",
      originalAmountMinor: 125000,
      originalCurrency: "jpy",
      convertedAmountMinor: 1350000,
      convertedCurrency: "idr",
    });

    expect(query.mock.calls[1]?.[0]).toContain("insert into travel_expenses");
    expect(query.mock.calls[1]?.[1]).toEqual([
      tripId,
      null,
      "Train",
      "2026-11-01",
      125000,
      "JPY",
      null,
      null,
      "manual",
      1350000,
      "IDR",
      null,
      null,
    ]);
  });

  it("persists a checklist item with an incremented sort order", async () => {
    queueOwnedTripAndItem({ id: itemId, title: "Passport" });

    await addChecklistItem({ tripId, title: "Passport" });

    expect(query.mock.calls[1]?.[0]).toContain("insert into travel_checklist_items");
    expect(query.mock.calls[1]?.[1]).toEqual([tripId, "Passport", null]);
  });

  it("updates budget only for a category owned by the authenticated user", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: itemId, allocated_minor: 500000 }] } as never);

    await patchBudgetCategory({ id: itemId, allocatedMinor: 500000 });

    expect(query.mock.calls[0]?.[0]).toContain("t.customer_auth_subject=$3");
    expect(query.mock.calls[0]?.[1]).toEqual([500000, itemId, ownerId]);
  });

  it("persists checklist completion only for an item owned by the authenticated user", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: itemId, is_completed: true }] } as never);

    await toggleChecklist({ id: itemId, completed: true });

    expect(query.mock.calls[0]?.[0]).toContain("t.customer_auth_subject=$3");
    expect(query.mock.calls[0]?.[1]).toEqual([true, itemId, ownerId]);
  });

  it.each([
    ["expense", deleteTripItem, "travel_expenses"],
    ["itinerary", deleteItineraryItem, "travel_itinerary_items"],
    ["checklist", deleteChecklistItem, "travel_checklist_items"],
    ["booking", deleteBooking, "travel_bookings"],
  ] as const)("deletes only the authenticated user's %s", async (_label, remove, table) => {
    query.mockResolvedValueOnce({ rows: [{ id: itemId }] } as never);

    await remove({ id: itemId });

    expect(query.mock.calls[0]?.[0]).toContain(`delete from ${table}`);
    expect(query.mock.calls[0]?.[0]).toContain("t.customer_auth_subject=$2");
    expect(query.mock.calls[0]?.[1]).toEqual([itemId, ownerId]);
  });

  it("does not attempt database reads or writes when the session is missing", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));

    await expect(
      addItineraryItem({ tripId, activityDate: "2026-11-01", title: "Museum" }),
    ).rejects.toThrow("Autentikasi diperlukan");

    expect(query).not.toHaveBeenCalled();
  });

  it("does not insert items when the authenticated user does not own the trip", async () => {
    query.mockResolvedValueOnce({ rows: [] } as never);

    await expect(
      addBooking({ tripId, category: "Hotel", title: "Hotel Shinjuku" }),
    ).rejects.toThrow("Perjalanan tidak ditemukan");

    expect(query).toHaveBeenCalledOnce();
  });
});
