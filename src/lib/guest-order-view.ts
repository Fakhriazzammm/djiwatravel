export type GuestOrderStatus =
  | "ORDER_CREATED"
  | "WAITING_PAYMENT"
  | "PAID"
  | "PROVISIONING"
  | "READY"
  | "INSTALLED"
  | "EXPIRED"
  | "PROVISIONING_FAILED"
  | "CANCELLED"
  | "REFUNDED";

import type { EsimProfile } from "./providers";
import { effectivePaymentStatus } from "./payment-expiry";

export type GuestOrderRecord = {
  id: string;
  publicOrderCode: string;
  status: string;
  amount: number;
  createdAtMs: number;
  expiresAtMs?: number | null;
  paymentExpiresAtMs?: number | null;
  packageCode: string;
  paymentMethod: string;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  paymentUrl?: string;
  providerOrderNo?: string;
  esim?: EsimProfile;
  packageSnapshot: {
    name: string;
    locationCodes: string[];
    durationDays: number;
    volumeBytes: number | null;
    supportsTopUp: boolean;
  };
};

export type GuestOrderView = {
  id: string;
  publicOrderCode: string;
  packageId: string;
  packageName: string;
  locationCodes: string[];
  durationDays: number;
  volumeBytes: number | null;
  supportsTopUp: boolean;
  amount: number;
  method: "qris" | "va";
  paymentReference?: string;
  status: GuestOrderStatus;
  createdAt: number;
  expiresAt?: number;
  paymentExpiresAt?: number | null;
  priceSnapshot: { amountIdr: number; capturedAt: number; currency: "IDR"; packageId: string };
};

const knownStatuses = new Set<GuestOrderStatus>([
  "ORDER_CREATED",
  "WAITING_PAYMENT",
  "PAID",
  "PROVISIONING",
  "READY",
  "INSTALLED",
  "EXPIRED",
  "PROVISIONING_FAILED",
  "CANCELLED",
  "REFUNDED",
]);

export function mapGuestOrderRecord(record: GuestOrderRecord): GuestOrderView {
  const serverStatus = effectivePaymentStatus(record.status, record.paymentExpiresAtMs);
  const normalizedStatus = serverStatus === "PAYMENT_PENDING" ? "WAITING_PAYMENT" : serverStatus === "PAYMENT_CONFIRMED" ? "PAID" : serverStatus;
  const status = knownStatuses.has(normalizedStatus as GuestOrderStatus)
    ? (normalizedStatus as GuestOrderStatus)
    : "ORDER_CREATED";
  return {
    id: record.id,
    publicOrderCode: record.publicOrderCode,
    packageId: record.packageCode,
    packageName: record.packageSnapshot.name,
    locationCodes: record.packageSnapshot.locationCodes,
    durationDays: record.packageSnapshot.durationDays,
    volumeBytes: record.packageSnapshot.volumeBytes,
    supportsTopUp: record.packageSnapshot.supportsTopUp,
    amount: record.amount,
    method: record.paymentMethod === "va" ? "va" : "qris",
    ...(record.paymentReference == null ? {} : { paymentReference: record.paymentReference }),
    ...(record.paymentUrl == null ? {} : { paymentUrl: record.paymentUrl }),
    ...(record.providerOrderNo == null ? {} : { providerOrderNo: record.providerOrderNo }),
    ...(record.esim == null ? {} : { esim: record.esim }),
    status,
    createdAt: record.createdAtMs,
    ...(record.expiresAtMs == null ? {} : { expiresAt: record.expiresAtMs }),
    ...(record.paymentExpiresAtMs == null ? {} : { paymentExpiresAt: record.paymentExpiresAtMs }),
    priceSnapshot: {
      amountIdr: record.amount,
      capturedAt: record.createdAtMs,
      currency: "IDR",
      packageId: record.packageCode,
    },
  };
}
