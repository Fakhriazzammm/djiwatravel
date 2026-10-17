import { describe, expect, it } from "vitest";
import { claimGuestOrder, dedupeOrdersById, orderOwnership } from "@/lib/travel-order-identity";

describe("order ownership", () => {
  it("grants member access only to the verified session subject", () => {
    expect(orderOwnership({ customerAuthSubject: "subject-a" }, { authSubject: "subject-a" })).toBe("member");
    expect(orderOwnership({ customerAuthSubject: "subject-a" }, { authSubject: "subject-b" })).toBe("none");
  });

  it("keeps the guest token path separate from member ownership", () => {
    expect(orderOwnership({ customerAuthSubject: null }, { guestTokenVerified: true })).toBe("guest");
    expect(orderOwnership({ customerAuthSubject: null }, {})).toBe("none");
  });

  it("never treats a browser-supplied subject as ownership without a verified session", () => {
    expect(orderOwnership({ customerAuthSubject: "subject-a" }, { authSubject: "  " })).toBe("none");
    expect(orderOwnership({ customerAuthSubject: "" }, { authSubject: "" })).toBe("none");
  });
});

describe("guest order claim", () => {
  it("claims an unowned order with a verified guest token", () => {
    expect(claimGuestOrder({ authSubject: "subject-a", guestTokenVerified: true })).toEqual({
      claim: true,
      reason: "claimed",
    });
  });

  it("refuses a claim without a verified token", () => {
    expect(claimGuestOrder({ authSubject: "subject-a", guestTokenVerified: false }).claim).toBe(false);
  });

  it("refuses to move an order already owned by another account", () => {
    expect(
      claimGuestOrder({ authSubject: "subject-b", guestTokenVerified: true, orderSubject: "subject-a" }),
    ).toEqual({ claim: false, reason: "owned_by_other" });
  });

  it("is idempotent: re-claiming an owned order does not duplicate it", () => {
    expect(
      claimGuestOrder({ authSubject: "subject-a", guestTokenVerified: true, orderSubject: "subject-a" }),
    ).toEqual({ claim: false, reason: "already_member" });
  });

  it("refuses an empty subject", () => {
    expect(claimGuestOrder({ authSubject: "", guestTokenVerified: true }).claim).toBe(false);
  });
});

describe("order merge", () => {
  it("deduplicates by canonical order id so a claimed order appears once", () => {
    const merged = dedupeOrdersById(
      [{ id: "order-1" }, { id: "order-2" }],
      [{ id: "order-1" }, { id: "order-3" }],
    );
    expect(merged.map((o) => o.id)).toEqual(["order-1", "order-2", "order-3"]);
  });

  it("tolerates a missing list", () => {
    expect(dedupeOrdersById([{ id: "order-1" }], undefined)).toHaveLength(1);
  });
});
