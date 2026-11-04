export const PREORDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1_000;

export type OrderFulfillmentDecision =
  | { mode: "instant" }
  | { mode: "preorder" }
  | {
      mode: "unavailable";
      reason: "balance_unknown" | "package_unaffordable" | "package_invalid";
    };

/** The browser can request preorder, but only the server's balance verdict makes it valid. */
export function classifyOrderFulfillment(input: {
  requestedPreorder: boolean;
  sellable: boolean;
  balanceKnown: boolean;
  packageValid?: boolean;
}): OrderFulfillmentDecision {
  if (input.sellable) return { mode: "instant" };
  if (!input.balanceKnown) return { mode: "unavailable", reason: "balance_unknown" };
  if (input.packageValid === false) return { mode: "unavailable", reason: "package_invalid" };
  return input.requestedPreorder
    ? { mode: "preorder" }
    : { mode: "unavailable", reason: "package_unaffordable" };
}

export function preorderDeadline(paidAt: string | Date): string {
  const paidAtMs = paidAt instanceof Date ? paidAt.getTime() : Date.parse(paidAt);
  if (!Number.isFinite(paidAtMs)) throw new Error("preorder_payment_time_invalid");
  return new Date(paidAtMs + PREORDER_WINDOW_MS).toISOString();
}

export type CustomerPreorderState =
  "awaiting_payment" | "awaiting_balance" | "processing" | "refund_review" | "fulfilled";

export function customerPreorderState(input: {
  fulfillmentMode: string | null | undefined;
  preorderStatus: string | null | undefined;
  orderStatus: string;
}): CustomerPreorderState | null {
  if (input.fulfillmentMode !== "preorder") return null;
  if (input.orderStatus === "READY" || input.preorderStatus === "fulfilled") return "fulfilled";
  if (input.preorderStatus === "refund_review") return "refund_review";
  if (input.preorderStatus === "pending_payment") return "awaiting_payment";
  if (input.orderStatus === "PROVISIONING" || input.preorderStatus === "processing")
    return "processing";
  return "awaiting_balance";
}

export function isPreorderExpired(input: {
  fulfillmentMode: string | null | undefined;
  preorderStatus: string | null | undefined;
  deadlineAt: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (
    input.fulfillmentMode !== "preorder" ||
    !["pending", "processing"].includes(input.preorderStatus ?? "") ||
    !input.deadlineAt
  )
    return false;
  const deadlineMs = Date.parse(input.deadlineAt);
  return Number.isFinite(deadlineMs) && deadlineMs <= (input.nowMs ?? Date.now());
}
