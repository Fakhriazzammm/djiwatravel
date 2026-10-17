import type { OrderStatus } from "./orders";

export type TravelLifecycle =
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "PROVISIONING"
  | "RETRYING"
  | "READY"
  | "FAILED_REVIEW"
  | "EXPIRED";

/** Attempt budget for provider provisioning; beyond this the order needs a human. */
export const MAX_PROVISIONING_ATTEMPTS = 5;

export type TravelLifecycleInput = {
  /** Payment window elapsed; only meaningful while the order is still unpaid. */
  paymentExpired?: boolean;
  provisioningStatus?: string | null;
  attemptCount?: number | null;
  maxAttempts?: number;
};

function normalizeInput(input: boolean | TravelLifecycleInput | undefined): TravelLifecycleInput {
  // Older callers passed the payment-expired flag positionally.
  return typeof input === "boolean" ? { paymentExpired: input } : (input ?? {});
}

/**
 * Canonical post-payment state machine.
 *
 * A paid order must never look dead: every non-ready state maps to something the customer can act
 * on. `RETRYING` is a failure the worker will pick up again, `FAILED_REVIEW` is one it will not,
 * so the two must stay distinguishable — otherwise a customer is either told to wait forever or
 * told to contact support for an order that repairs itself.
 */
export function toTravelLifecycle(
  status: OrderStatus,
  input: boolean | TravelLifecycleInput = {},
): TravelLifecycle {
  const {
    paymentExpired = false,
    provisioningStatus,
    attemptCount,
    maxAttempts = MAX_PROVISIONING_ATTEMPTS,
  } = normalizeInput(input);

  if (
    status === "EXPIRED" ||
    (paymentExpired && ["ORDER_CREATED", "WAITING_PAYMENT"].includes(status))
  )
    return "EXPIRED";
  if (status === "ORDER_CREATED" || status === "WAITING_PAYMENT") return "PAYMENT_PENDING";
  if (status === "PAID") return "PAYMENT_CONFIRMED";
  if (status === "PROVISIONING") return "PROVISIONING";
  if (status === "READY" || status === "INSTALLED") return "READY";
  if (status === "PROVISIONING_FAILED") {
    const attempts = Number(attemptCount ?? 0);
    const exhausted = Number.isFinite(attempts) && attempts >= maxAttempts;
    const terminal =
      provisioningStatus === "REVIEW_REQUIRED" || provisioningStatus === "FAILED_TERMINAL";
    // A provider refusal that exhausted its attempts, or one explicitly parked for review, is a
    // support case; anything else is still retryable.
    return exhausted || terminal ? "FAILED_REVIEW" : "RETRYING";
  }
  return "FAILED_REVIEW";
}

/** States where the order is settled (or settling) and the customer must not be asked to pay again. */
export function isSettledLifecycle(lifecycle: TravelLifecycle) {
  return lifecycle !== "PAYMENT_PENDING" && lifecycle !== "EXPIRED";
}

export const TRAVEL_LIFECYCLE_COPY: Record<TravelLifecycle, { title: string; action: string }> = {
  PAYMENT_PENDING: {
    title: "Menunggu pembayaran",
    action: "Selesaikan pembayaran sebelum kedaluwarsa.",
  },
  PAYMENT_CONFIRMED: {
    title: "Pembayaran terverifikasi",
    action: "eSIM sedang dimasukkan ke antrean proses.",
  },
  PROVISIONING: {
    title: "eSIM sedang disiapkan",
    action: "Tidak perlu membayar lagi. Kami memperbarui status secara berkala.",
  },
  RETRYING: {
    title: "Kami mencoba lagi",
    action: "Provider belum merespons; pesanan tetap aman dan akan dicoba kembali.",
  },
  READY: {
    title: "eSIM siap dipasang",
    action: "Gunakan QR atau detail manual untuk memasang eSIM.",
  },
  FAILED_REVIEW: {
    title: "Perlu bantuan support",
    action: "Pembayaran tetap tercatat. Hubungi support agar kami meninjau pesanan.",
  },
  EXPIRED: {
    title: "Pesanan kedaluwarsa",
    action: "Buat pesanan baru jika belum ada pembayaran yang berhasil.",
  },
};
