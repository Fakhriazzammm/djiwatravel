import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUEST_ACCESS_TTL_MS } from "../lib/guest-access-policy";
import { isGhostGuestOrder } from "../lib/order-cache";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const DAY = 86_400_000;

describe("guest order access window", () => {
  it("outlives the checkout hour so a paid guest eSIM stays reachable", () => {
    expect(GUEST_ACCESS_TTL_MS).toBeGreaterThanOrEqual(14 * DAY);
  });

  it("extends rows that the old one-hour window already locked out", () => {
    const sql = readFileSync("migrations/029_extend_guest_order_access.sql", "utf8");
    expect(sql).toContain("GREATEST(expires_at");
    expect(sql).not.toMatch(/\bdelete\b/i);
  });
});

describe("ghost guest orders in the local cache", () => {
  const live = { status: "READY", createdAt: NOW - DAY };

  it("keeps anything the server returned and anything an account owns", () => {
    expect(isGhostGuestOrder({ ...live, status: "EXPIRED" }, true, NOW)).toBe(false);
    expect(
      isGhostGuestOrder({ ...live, status: "EXPIRED", fromMemberAccount: true }, false, NOW),
    ).toBe(false);
  });

  it("keeps a recent live order through a transient miss", () => {
    expect(isGhostGuestOrder(live, false, NOW)).toBe(false);
  });

  it("drops finished, payment-expired and out-of-window orders the server no longer knows", () => {
    expect(isGhostGuestOrder({ ...live, status: "EXPIRED" }, false, NOW)).toBe(true);
    expect(
      isGhostGuestOrder(
        { status: "WAITING_PAYMENT", createdAt: NOW - DAY, paymentExpiresAt: NOW - 1 },
        false,
        NOW,
      ),
    ).toBe(true);
    expect(
      isGhostGuestOrder({ status: "READY", createdAt: NOW - GUEST_ACCESS_TTL_MS - 1 }, false, NOW),
    ).toBe(true);
  });
});
