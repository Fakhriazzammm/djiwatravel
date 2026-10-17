import type { OrderStatus } from "./orders";
import { maskSensitive } from "./sensitive-data";
import { ORDER_STATUS_LABEL } from "./esim-status";

/* ------------------------------------------------------------------ *
 * Contextual customer support
 *
 * The customer never has to describe their own situation: the topic list is derived
 * from the real order state, and the payload shown before sending is the same
 * (already redacted) payload that reaches the support channel.
 * ------------------------------------------------------------------ */

export type SupportCategory =
  "payment" | "provisioning" | "activation" | "connectivity" | "quota" | "receipt";

export type SupportTopic = {
  id: string;
  category: SupportCategory;
  /** Short label shown in the topic list. */
  label: string;
  /** What we will tell support on the customer's behalf. */
  request: string;
};

const TOPICS: Record<string, SupportTopic> = {
  payment_pending: {
    id: "payment_pending",
    category: "payment",
    label: "Pembayaran belum terverifikasi",
    request: "Mohon bantu periksa status pembayaran pesanan ini.",
  },
  payment_refund: {
    id: "payment_refund",
    category: "payment",
    label: "Status pembatalan atau refund",
    request: "Mohon bantu periksa status pembatalan/pengembalian dana pesanan ini.",
  },
  provisioning_stuck: {
    id: "provisioning_stuck",
    category: "provisioning",
    label: "eSIM belum selesai diproses",
    request: "Mohon bantu cek proses penyiapan eSIM pesanan ini.",
  },
  activation_failed: {
    id: "activation_failed",
    category: "activation",
    label: "Aktivasi eSIM gagal",
    request: "Aktivasi eSIM saya gagal. Mohon bantu proses ulang tanpa membuat order baru.",
  },
  activation_install: {
    id: "activation_install",
    category: "activation",
    label: "Tidak bisa memasang eSIM",
    request: "Saya tidak berhasil memasang eSIM dari QR/kode aktivasi di pesanan ini.",
  },
  connectivity: {
    id: "connectivity",
    category: "connectivity",
    label: "Internet tidak berjalan",
    request: "eSIM sudah terpasang tetapi internet belum berjalan. Mohon bantu cek.",
  },
  quota_low: {
    id: "quota_low",
    category: "quota",
    label: "Kuota hampir habis",
    request: "Kuota eSIM saya hampir habis. Mohon info pilihan tambahan kuota.",
  },
  quota_expired: {
    id: "quota_expired",
    category: "quota",
    label: "Paket sudah berakhir",
    request: "Paket eSIM saya sudah berakhir. Mohon info pilihan perpanjangan.",
  },
  receipt: {
    id: "receipt",
    category: "receipt",
    label: "QR atau struk tidak terbuka",
    request: "Saya tidak bisa membuka QR/struk pesanan ini. Mohon bantu.",
  },
};

export function supportTopicsFor(
  status: OrderStatus,
  options: { quotaLow?: boolean; hasQr?: boolean } = {},
): SupportTopic[] {
  const ids: string[] = [];
  switch (status) {
    case "ORDER_CREATED":
    case "WAITING_PAYMENT":
      ids.push("payment_pending", "receipt");
      break;
    case "PAID":
    case "PROVISIONING":
      ids.push("provisioning_stuck", "payment_pending");
      break;
    case "READY":
    case "INSTALLED":
      ids.push("activation_install", "connectivity");
      if (options.quotaLow) ids.push("quota_low");
      ids.push("receipt");
      break;
    case "PROVISIONING_FAILED":
      ids.push("activation_failed", "provisioning_stuck");
      break;
    case "EXPIRED":
      ids.push("quota_expired", "receipt");
      break;
    case "CANCELLED":
    case "REFUNDED":
      ids.push("payment_refund", "payment_pending");
      break;
    default:
      ids.push("receipt");
  }
  return ids.map((id) => TOPICS[id]).filter((topic): topic is SupportTopic => topic !== undefined);
}

export type SupportContextInput = {
  topic: SupportTopic;
  status: OrderStatus;
  orderId: string;
  orderCode?: string | null;
  packageName: string;
  destination: string;
  iccid?: string | null;
  lastSyncedAt?: number | null;
  appVersion?: string;
};

export type SupportContext = {
  category: SupportCategory;
  topicLabel: string;
  request: string;
  /** Masked order reference: safe to place in a message or query string. */
  orderReference: string;
  /** Masked eSIM reference, or null when the order has no profile yet. */
  esimReference: string | null;
  packageName: string;
  destination: string;
  activationState: string;
  lastSyncedAtLabel: string;
  appVersion: string;
};

export const DEFAULT_APP_VERSION = "djiwa-travel-web";

function formatSyncedAt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "belum tersinkron";
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Builds the shareable payload. Only masked identifiers leave the device: the guest access
 * token, the full ICCID and the QR payload are never part of it.
 */
export function buildSupportContext(input: SupportContextInput): SupportContext {
  const reference = input.orderCode && input.orderCode.length > 0 ? input.orderCode : input.orderId;
  return {
    category: input.topic.category,
    topicLabel: input.topic.label,
    request: input.topic.request,
    orderReference: maskSensitive(reference, 4, 4),
    esimReference: input.iccid ? maskSensitive(input.iccid, 6, 4) : null,
    packageName: input.packageName,
    destination: input.destination,
    activationState: ORDER_STATUS_LABEL[input.status],
    lastSyncedAtLabel: formatSyncedAt(input.lastSyncedAt),
    appVersion: input.appVersion ?? DEFAULT_APP_VERSION,
  };
}

export function supportMessage(context: SupportContext): string {
  return [
    `Halo Djiwa Travel, saya butuh bantuan (${context.topicLabel}).`,
    "",
    `Pesanan: ${context.orderReference}`,
    `Paket: ${context.packageName}`,
    `Destinasi: ${context.destination}`,
    `Status eSIM: ${context.activationState}`,
    ...(context.esimReference ? [`eSIM: ${context.esimReference}`] : []),
    `Terakhir diperbarui: ${context.lastSyncedAtLabel}`,
    `Aplikasi: ${context.appVersion}`,
    "",
    context.request,
  ].join("\n");
}

export function supportUrl(context: SupportContext, baseUrl: string): string {
  return `${baseUrl}?text=${encodeURIComponent(supportMessage(context))}`;
}

/* ------------------------------------------------------------------ *
 * Send de-duplication
 *
 * Opening the same support topic repeatedly for one order produces duplicate
 * conversations. A short window keeps retries possible without spamming.
 * ------------------------------------------------------------------ */

export const SUPPORT_SEND_WINDOW_MS = 10 * 60 * 1000;
const SUPPORT_LOG_KEY = "djiwa.travel.support-log";

export function supportDedupeKey(context: SupportContext): string {
  return `${context.category}:${context.orderReference}:${context.topicLabel}`;
}

function readLog(now: number): Record<string, number> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(SUPPORT_LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return {};
    const log: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        now - value < SUPPORT_SEND_WINDOW_MS
      ) {
        log[key] = value;
      }
    }
    return log;
  } catch {
    return {};
  }
}

function writeLog(log: Record<string, number>): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SUPPORT_LOG_KEY, JSON.stringify(log));
  } catch {
    // ignore
  }
}

export function shouldSuppressSupportSend(key: string, now = Date.now()): boolean {
  const last = readLog(now)[key];
  return typeof last === "number" && now - last < SUPPORT_SEND_WINDOW_MS;
}

export function recordSupportSend(key: string, now = Date.now()): void {
  writeLog({ ...readLog(now), [key]: now });
}

export function clearSupportSendLog(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SUPPORT_LOG_KEY);
  } catch {
    // ignore
  }
}
