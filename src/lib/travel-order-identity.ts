/**
 * Canonical order ownership.
 *
 * Two independent ownership paths exist and must stay separate:
 *  - member: the order carries the verified auth subject resolved server-side from the session;
 *  - guest:  the browser still holds the order's bearer access token.
 *
 * Ownership is never derived from an email, a phone number, or any browser-supplied user id.
 * `isBetterAuthUserId` proves the id shape Better Auth issues (opaque text, not a uuid), which is
 * why the ownership key is text: the earlier `customer_auth_id uuid` column could never hold a
 * real session subject.
 */

export type OrderOwnershipShape = { customerAuthSubject?: string | null };
export type OrderOwnershipInput = {
  /** Verified auth subject from the server session; never taken from the browser. */
  authSubject?: string | null;
  /** Browser-presented guest token; ownership is proven by its hash matching the stored hash. */
  guestTokenVerified?: boolean;
};

export type OrderOwnershipVerdict = "member" | "guest" | "none";

export function orderOwnership(order: OrderOwnershipShape, input: OrderOwnershipInput): OrderOwnershipVerdict {
  const subject = typeof input.authSubject === "string" ? input.authSubject.trim() : "";
  const owned = typeof order.customerAuthSubject === "string" ? order.customerAuthSubject.trim() : "";
  if (subject && owned && subject === owned) return "member";
  if (input.guestTokenVerified === true) return "guest";
  return "none";
}

export type ClaimDecision =
  | { claim: true; reason: "claimed" }
  | { claim: false; reason: "already_member" | "unverified" | "owned_by_other" };

export type ClaimInput = {
  authSubject: string;
  guestTokenVerified: boolean;
  orderSubject?: string | null;
};

/**
 * Guest-order claim/import after sign-in.
 *
 * Only a verified guest token (or an order already owned by this same subject) may attach an order
 * to a member account. A guest order already bound to a different subject is never re-assigned —
 * that would be an account takeover of someone else's purchase.
 *
 * Re-claiming an already-owned order returns `already_member` so the flow stays idempotent: the
 * claimed order appears exactly once, never twice.
 */
export function claimGuestOrder(input: ClaimInput): ClaimDecision {
  const subject = (input.authSubject ?? "").trim();
  if (!subject) return { claim: false, reason: "unverified" };
  const owned = typeof input.orderSubject === "string" ? input.orderSubject.trim() : "";
  if (owned && owned === subject) return { claim: false, reason: "already_member" };
  if (owned && owned !== subject) return { claim: false, reason: "owned_by_other" };
  if (!input.guestTokenVerified) return { claim: false, reason: "unverified" };
  return { claim: true, reason: "claimed" };
}

/** Merge member and guest reads without ever showing the same order twice. */
export function dedupeOrdersById<T extends { id: string }>(...lists: Array<readonly T[] | undefined>): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    for (const order of list ?? []) {
      if (!order || typeof order.id !== "string" || seen.has(order.id)) continue;
      seen.add(order.id);
      merged.push(order);
    }
  }
  return merged;
}
