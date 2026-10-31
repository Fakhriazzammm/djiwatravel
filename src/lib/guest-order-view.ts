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
import type { EsimStoredUsage } from "./esim-stored-usage";
import { effectivePaymentStatus } from "./payment-expiry";
import { storedPaymentMethod, type StoredPaymentMethod } from "./travel-payment-method";

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
  profileStatus?: string | null;
  usage?: EsimStoredUsage;
  esim?: EsimProfile;
  packageSnapshot: {
    name: string;
    locationCodes: string[];
    durationDays: number;
    volumeBytes: number | null;
    unlimited?: boolean;
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
  unlimited?: boolean;
  supportsTopUp: boolean;
  amount: number;
  method: StoredPaymentMethod;
  paymentReference?: string;
  status: GuestOrderStatus;
  createdAt: number;
  expiresAt?: number;
  paymentExpiresAt?: number | null;
  usedGb?: number;
  usageVolumeBytes?: number;
  usageMeasuredAt?: number;
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
  const normalizedStatus =
    serverStatus === "PAYMENT_PENDING"
      ? "WAITING_PAYMENT"
      : serverStatus === "PAYMENT_CONFIRMED"
        ? "PAID"
        : serverStatus;
  const savedStatus = knownStatuses.has(normalizedStatus as GuestOrderStatus)
    ? (normalizedStatus as GuestOrderStatus)
    : "ORDER_CREATED";
  const status =
    savedStatus === "READY" && ["IN_USE", "USED_UP"].includes(record.profileStatus ?? "")
      ? "INSTALLED"
      : savedStatus;
  return {
    id: record.id,
    publicOrderCode: record.publicOrderCode,
    packageId: record.packageCode,
    packageName: record.packageSnapshot.name,
    locationCodes: record.packageSnapshot.locationCodes,
    durationDays: record.packageSnapshot.durationDays,
    volumeBytes: record.packageSnapshot.volumeBytes,
    ...(record.packageSnapshot.unlimited === true ? { unlimited: true } : {}),
    supportsTopUp: record.packageSnapshot.supportsTopUp,
    amount: record.amount,
    method: storedPaymentMethod(record.paymentMethod),
    ...(record.paymentReference == null ? {} : { paymentReference: record.paymentReference }),
    ...(record.paymentUrl == null ? {} : { paymentUrl: record.paymentUrl }),
    ...(record.providerOrderNo == null ? {} : { providerOrderNo: record.providerOrderNo }),
    ...(record.usage == null ? {} : { usedGb: record.usage.usedBytes / 1_000_000_000 }),
    ...(record.usage?.totalBytes == null ? {} : { usageVolumeBytes: record.usage.totalBytes }),
    ...(record.usage?.measuredAtMs == null ? {} : { usageMeasuredAt: record.usage.measuredAtMs }),
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
