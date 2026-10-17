/**
 * Shared two-stage payment progress.
 *
 * Long external calls (invoice creation, then the browser hand-off) need distinct copy: "preparing"
 * while the request is in flight and "opening" while the browser is leaving. Hardcoding a single
 * "Menyiapkan…" on every surface made slow requests look stalled and fast ones flash the wrong
 * stage, so every payment surface derives its label from this one place.
 */

export type PaymentProgressStage = "idle" | "preparing" | "redirecting";

export const PAYMENT_PROGRESS_COPY = {
  preparing: "Menyiapkan pembayaran…",
  redirecting: "Membuka halaman pembayaran…",
} as const;

/** Label for the primary payment button while a submission is in flight. */
export function paymentProgressLabel(stage: PaymentProgressStage): string {
  return stage === "redirecting"
    ? PAYMENT_PROGRESS_COPY.redirecting
    : PAYMENT_PROGRESS_COPY.preparing;
}

/**
 * Resolves a delayed redirect so the "opening" stage actually renders before the browser leaves.
 *
 * React commits the state update on the next frame; navigating in the same tick skipped straight
 * past it and the customer only ever saw "Menyiapkan…".
 */
export function nextFrame(delayMs = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
