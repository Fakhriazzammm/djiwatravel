import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import {
  canCreateGuestTrip,
  DEFAULT_GUEST_TRIPS_CONFIG,
  GUEST_TRIP_COOKIE,
  guestLimitMessage,
  isGuestSubject,
  normalizeGuestTripsConfig,
  parseGuestTripsConfig,
  remainingGuestTrips,
} from "@/lib/guest-trips";
import {
  claimGuestTripsHandler,
  getGuestTripStatusHandler,
  guestSubjectFor,
  resolveTripOwner,
  resolveTripOwnerForCreate,
} from "@/lib/guest-trips.server";
import { createTrip } from "@/lib/my-trips.server";
import { validateAdminSetting } from "@/lib/admin-settings";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/customer-session.fn", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/google-calendar.server", () => ({ syncItineraryItem: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: vi.fn(), setCookie: vi.fn() }));

const token = "a".repeat(43);
const query = vi.mocked(pool.query);
const connect = vi.mocked(pool.connect);
const authenticate = vi.mocked(getAuthenticatedUser);
const readCookie = vi.mocked(getCookie);
const writeCookie = vi.mocked(setCookie);

const noConfigRow = { rows: [] } as never;

describe("guest trip rules (pure)", () => {
  it("parses the Admin setting and rejects out-of-range limits", () => {
    expect(parseGuestTripsConfig({ enabled: true, limit: 1 })).toEqual({ enabled: true, limit: 1 });
    expect(() => parseGuestTripsConfig({ enabled: true, limit: 0 })).toThrow();
    expect(() => parseGuestTripsConfig({ enabled: true, limit: 6 })).toThrow();
    expect(() => parseGuestTripsConfig({ enabled: "yes", limit: 1 })).toThrow();
    expect(validateAdminSetting("guestTrips", { enabled: false, limit: 3 })).toBe(true);
    expect(() => validateAdminSetting("guestTrips", { enabled: true, limit: 9 })).toThrow();
  });

  it("falls back to the default when the stored setting is malformed", () => {
    expect(normalizeGuestTripsConfig(null)).toEqual(DEFAULT_GUEST_TRIPS_CONFIG);
    expect(normalizeGuestTripsConfig({ enabled: true, limit: 99 })).toEqual(
      DEFAULT_GUEST_TRIPS_CONFIG,
    );
  });

  it("allows creation only while the guest is under the limit", () => {
    expect(canCreateGuestTrip(0, 1)).toBe(true);
    expect(canCreateGuestTrip(1, 1)).toBe(false);
    expect(remainingGuestTrips(1, 3)).toBe(2);
    expect(remainingGuestTrips(5, 3)).toBe(0);
    expect(guestLimitMessage(1)).toMatch(/Masuk atau daftar/);
  });

  it("keeps guest owners in their own namespace, never equal to a member id", () => {
    const subject = guestSubjectFor(token);
    expect(isGuestSubject(subject)).toBe(true);
    expect(subject).toBe(guestSubjectFor(token));
    expect(subject).not.toContain(token);
    expect(isGuestSubject("better-auth-user-1")).toBe(false);
  });
});

describe("guest trip ownership (server)", () => {
  beforeEach(() => {
    query.mockReset();
    connect.mockReset();
    authenticate.mockReset();
    readCookie.mockReset();
    writeCookie.mockReset();
  });

  it("gives a guest without a cookie a new guest owner and sets the cookie", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));
    readCookie.mockReturnValueOnce(undefined);
    query.mockResolvedValueOnce(noConfigRow);

    const owner = await resolveTripOwnerForCreate();

    expect(owner.guest).toBe(true);
    expect(owner.limit).toBe(1);
    expect(owner.id.startsWith("guest:")).toBe(true);
    expect(writeCookie).toHaveBeenCalledWith(
      GUEST_TRIP_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("does not let a guest read trips when the cookie is absent", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));
    readCookie.mockReturnValueOnce(undefined);
    expect(await resolveTripOwner()).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("uses the guest owner for an existing guest cookie when guest trips are on", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));
    readCookie.mockReturnValueOnce(token);
    query.mockResolvedValueOnce(noConfigRow);
    const owner = await resolveTripOwner();
    expect(owner).toMatchObject({ id: guestSubjectFor(token), guest: true });
  });

  it("returns no guest owner when the Admin switch is off", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));
    readCookie.mockReturnValueOnce(token);
    query.mockResolvedValueOnce({
      rows: [{ value_json: { enabled: false, limit: 1 }, version: 2 }],
    } as never);
    expect(await resolveTripOwner()).toBeNull();
  });

  it("reports remaining guest trips as zero when the switch is off", async () => {
    readCookie.mockReturnValueOnce(token);
    query.mockResolvedValueOnce({
      rows: [{ value_json: { enabled: false, limit: 2 }, version: 2 }],
    } as never);
    expect(await getGuestTripStatusHandler()).toMatchObject({ enabled: false, remaining: 0 });
  });

  it("blocks a guest's second trip inside the create transaction", async () => {
    authenticate.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));
    readCookie.mockReturnValueOnce(token);
    query.mockResolvedValueOnce(noConfigRow);
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // begin
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ n: 1 }] }) // one trip already exists
      .mockResolvedValueOnce({ rows: [] }); // rollback
    const release = vi.fn();
    connect.mockResolvedValueOnce({ query: clientQuery, release } as never);

    await expect(
      createTrip({
        name: "Tokyo",
        destinationCode: "JP",
        destinationName: "Jepang",
        departureDate: "2027-03-01",
        returnDate: "2027-03-07",
        travelersCount: 1,
        primaryCurrency: "IDR",
        totalBudgetMinor: 0,
      }),
    ).rejects.toThrow(guestLimitMessage(1));
    expect(clientQuery).toHaveBeenCalledWith("rollback");
    expect(release).toHaveBeenCalled();
  });

  it("moves guest trips to the member account on login and clears the cookie", async () => {
    authenticate.mockResolvedValueOnce({ id: "member-1", email: "a@example.com" });
    readCookie.mockReturnValueOnce(token);
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await claimGuestTripsHandler();

    expect(result).toEqual({ claimed: 1 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set customer_auth_subject = $1"), [
      "member-1",
      guestSubjectFor(token),
    ]);
    expect(writeCookie).toHaveBeenCalledWith(
      GUEST_TRIP_COOKIE,
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
  });
});
