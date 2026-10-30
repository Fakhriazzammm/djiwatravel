import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import {
  createTripShareLink,
  duplicateTripRecord,
  getTripSectionData,
  loadSharedTrip,
  revokeTripShareLink,
} from "@/lib/my-trips.server";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/google-calendar.server", () => ({ syncItineraryItem: vi.fn() }));

const tripId = "11111111-1111-4111-8111-111111111111";
const copyId = "33333333-3333-4333-8333-333333333333";
const ownerId = "better-auth-user-1";
const query = vi.mocked(pool.query);
const connect = vi.mocked(pool.connect);
const authenticate = vi.mocked(getAuthenticatedUser);

describe("My Trips duplication", () => {
  beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    authenticate.mockReset();
    authenticate.mockResolvedValue({ id: ownerId, email: "traveler@example.test" });
  });

  it("copies the plan into a new owned trip without copying expenses", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("select name,destination_code")) {
        return {
          rows: [
            {
              name: "Tokyo",
              destination_code: "JP",
              destination_name: "Jepang",
              departure_date: "2026-11-01",
              return_date: "2026-11-05",
              travelers_count: 2,
              primary_currency: "JPY",
              total_budget_minor: 500000,
              timezone: "Asia/Tokyo",
            },
          ],
        };
      }
      if (sql.includes("insert into travel_trips")) return { rows: [{ id: copyId }] };
      return { rows: [] };
    });
    const release = vi.fn();
    connect.mockResolvedValue({ query: clientQuery, release } as never);

    await expect(duplicateTripRecord(tripId)).resolves.toEqual({ id: copyId });

    const statements = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toBe("begin");
    expect(statements[1]).toContain("departure_date::text");
    expect(statements[1]).toContain("customer_auth_subject=$2");
    expect(statements[2]).toContain("insert into travel_trips");
    expect(statements.some((sql) => sql.includes("travel_budget_categories"))).toBe(true);
    expect(statements.some((sql) => sql.includes("travel_itinerary_items"))).toBe(true);
    expect(statements.some((sql) => sql.includes("travel_checklist_items"))).toBe(true);
    expect(statements.some((sql) => sql.includes("travel_bookings"))).toBe(true);
    expect(statements.some((sql) => sql.includes("travel_expenses"))).toBe(false);
    expect(statements.at(-1)).toBe("commit");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when the source trip is not owned by the session user", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("select name,destination_code")) return { rows: [] };
      return { rows: [] };
    });
    const release = vi.fn();
    connect.mockResolvedValue({ query: clientQuery, release } as never);

    await expect(duplicateTripRecord(tripId)).rejects.toThrow("Perjalanan tidak ditemukan");
    expect(clientQuery.mock.calls.map(([sql]) => String(sql)).slice(-1)).toEqual(["rollback"]);
    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("My Trips sharing", () => {
  beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    authenticate.mockReset();
    authenticate.mockResolvedValue({ id: ownerId, email: "traveler@example.test" });
  });

  it("creates a fresh bearer token and revokes older active links", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: tripId }] } as never);
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("insert into travel_trip_shares")) {
        return { rows: [{ token: "a".repeat(32), created_at: "2026-10-30T00:00:00.000Z" }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    connect.mockResolvedValue({ query: clientQuery, release } as never);

    const share = await createTripShareLink(tripId);

    expect(share.token).toHaveLength(32);
    expect(clientQuery.mock.calls[0]?.[0]).toBe("begin");
    expect(clientQuery.mock.calls[1]?.[0]).toContain("revoked_at=now()");
    expect(clientQuery.mock.calls[2]?.[0]).toContain("insert into travel_trip_shares");
    expect(clientQuery.mock.calls[2]?.[1]?.[1]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe("commit");
    expect(release).toHaveBeenCalledOnce();
  });

  it("revokes a link only inside a trip owned by the session user", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "share-1" }] } as never);

    await expect(revokeTripShareLink(tripId)).resolves.toEqual({ revoked: true });

    expect(query.mock.calls[0]?.[0]).toContain("t.customer_auth_subject=$2");
    expect(query.mock.calls[0]?.[1]).toEqual([tripId, ownerId]);
  });

  it("returns the public itinerary without touching private trip tables", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            token: "a".repeat(32),
            shared_at: "2026-10-30T00:00:00.000Z",
            id: tripId,
            name: "Tokyo",
            destination_name: "Jepang",
            departure_date: "2026-11-01",
            return_date: "2026-11-05",
            travelers_count: 2,
            primary_currency: "JPY",
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ id: "item-1", title: "Museum", activity_date: "2026-11-02" }],
      } as never);

    const shared = await loadSharedTrip("a".repeat(32));

    expect(shared?.itinerary).toHaveLength(1);
    expect(query.mock.calls[0]?.[0]).not.toContain("travel_expenses");
    expect(query.mock.calls[1]?.[0]).not.toContain("travel_checklist_items");
  });

  it("rejects malformed and revoked tokens without leaking trip data", async () => {
    await expect(loadSharedTrip("short")).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();

    query.mockResolvedValueOnce({ rows: [] } as never);
    await expect(loadSharedTrip("a".repeat(32))).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });
});

describe("My Trips budget per category", () => {
  beforeEach(() => {
    query.mockReset();
    authenticate.mockReset();
    authenticate.mockResolvedValue({ id: ownerId, email: "traveler@example.test" });
  });

  it("combines allocated, spent per category, and uncategorized spending", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: tripId,
            total_budget_minor: 1_000_000,
            departure_date: "2026-11-01",
            return_date: "2026-11-05",
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cat-1",
            name: "Penerbangan",
            allocated_minor: 500_000,
            spent_minor: "125000",
            expense_count: "2",
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ spent_minor: "50000", expense_count: "1" }],
      } as never);

    const data = await getTripSectionData(tripId, "budget");

    expect(data.items[0]).toMatchObject({
      allocated_minor: 500_000,
      spent_minor: 125_000,
      expense_count: 2,
    });
    expect(data.summary).toMatchObject({
      allocatedMinor: 500_000,
      spentMinor: 175_000,
      uncategorizedSpentMinor: 50_000,
      uncategorizedCount: 1,
      budgetMinor: 1_000_000,
    });
    expect(query.mock.calls[1]?.[0]).toContain("left join travel_expenses");
  });
});
