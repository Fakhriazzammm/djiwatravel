/**
 * Titip Belanja chat: pure rules shared by the customer screens, Admin and the server.
 * No database, no network, no browser APIs, so every rule is unit-tested.
 */
import type { DiscoveryOffer } from "./shopper-discovery";
import { offerTotal } from "./shopper-discovery";
import { ORDER_STATUS_LABEL, type ShopperOrderStatus } from "./personal-shopper";

/* ------------------------------------------------------------------ types */

export type ChatKind = "REQUEST" | "ORDER";
export type ChatSender = "CUSTOMER" | "ADMIN" | "SYSTEM";

export type ChatCard =
  | {
      type: "request";
      requestId: string;
      title: string;
      note: string;
      sourceUrl: string | null;
      analysis: string | null;
      hasPhoto: boolean;
    }
  | {
      type: "offer";
      requestId: string;
      /** 1, 2, 3 … in the order the team sent them. */
      number: number;
      /** The request version this offer belongs to. */
      requestVersion: number;
      expiresAt: string;
      offer: DiscoveryOffer;
    }
  | { type: "order"; orderId: string; code: string };

export type OfferState =
  "open" | "expired" | "superseded" | "declined" | "accepted" | "paid" | "closed";

export type ChatMessageView = {
  id: string;
  sender: ChatSender;
  senderName: string;
  body: string;
  internal: boolean;
  at: string;
  attachmentUrl: string | null;
  card: (ChatCard & { state?: OfferState; photoUrl?: string | null }) | null;
};

export type ChatStage = {
  /** Dots finished (0-4): Dikirim, Dicari, Penawaran, Bayar. 4 means everything is done. */
  done: number;
  /** Short label for list pills and the header ("Penawaran", "Dicari"). */
  label: string;
  tone: "neutral" | "warn" | "ok" | "bad";
  /** The thread is finished or stopped: no tracker colour for "now". */
  closed: boolean;
  /** Who the next move belongs to. */
  waitingOn: "team" | "customer" | "payment" | "none";
};

export const STAGE_STEPS = ["Dikirim", "Dicari", "Penawaran", "Bayar"] as const;

const PAID_ORDER: readonly ShopperOrderStatus[] = [
  "PAID",
  "PURCHASED",
  "SHIPPED",
  "ARRIVED",
  "DELIVERED",
];

/** Where a request or order stands, for the tracker, the list pill and the quick replies. */
export function chatStage(input: {
  kind: ChatKind;
  requestStatus: string | null;
  orderStatus: ShopperOrderStatus | null;
}): ChatStage {
  const { kind, requestStatus: rs, orderStatus: os } = input;
  if (os) {
    if (PAID_ORDER.includes(os))
      return {
        done: 4,
        label: os === "DELIVERED" ? "Selesai" : kind === "ORDER" ? "Pesanan" : "Dibayar",
        tone: "ok",
        closed: os === "DELIVERED",
        waitingOn: os === "DELIVERED" ? "none" : "team",
      };
    if (os === "PAYMENT_PENDING")
      return { done: 3, label: "Bayar", tone: "warn", closed: false, waitingOn: "payment" };
    return {
      done: 3,
      label: ORDER_STATUS_LABEL[os] ?? "Ditutup",
      tone: "bad",
      closed: true,
      waitingOn: "none",
    };
  }
  switch (rs) {
    case "SUBMITTED":
      return { done: 0, label: "Baru", tone: "bad", closed: false, waitingOn: "team" };
    case "SEARCHING":
      return { done: 1, label: "Dicari", tone: "neutral", closed: false, waitingOn: "team" };
    case "NEEDS_INFO":
      return { done: 1, label: "Perlu info", tone: "warn", closed: false, waitingOn: "customer" };
    case "OFFERED":
      return { done: 2, label: "Penawaran", tone: "warn", closed: false, waitingOn: "customer" };
    case "DECLINED":
      return { done: 2, label: "Ditolak", tone: "bad", closed: true, waitingOn: "none" };
    case "UNAVAILABLE":
      return { done: 1, label: "Belum ditemukan", tone: "bad", closed: true, waitingOn: "none" };
    case "CANCELLED":
      return { done: 0, label: "Dibatalkan", tone: "bad", closed: true, waitingOn: "none" };
    case "ORDERED":
      return { done: 3, label: "Bayar", tone: "warn", closed: false, waitingOn: "payment" };
    default:
      return { done: 0, label: "Baru", tone: "neutral", closed: false, waitingOn: "team" };
  }
}

/** One-tap replies that fit the moment. The customer can still type anything. */
export function quickReplies(stage: ChatStage, kind: ChatKind): string[] {
  if (kind === "ORDER" || stage.done >= 4)
    return ["Kapan barang sampai?", "Minta nomor resi", "Ubah alamat"];
  if (stage.waitingOn === "payment") return ["Bagaimana cara bayar?", "Ubah alamat", "Batalkan"];
  if (stage.label === "Penawaran") return ["Tanya warna", "Ada yang lebih murah?", "Setuju"];
  if (stage.closed) return ["Coba cari lagi", "Cari yang serupa"];
  return ["Kirim foto lain", "Tanya estimasi harga", "Warna lain?"];
}

/** The state of one offer card, from the request it belongs to. */
export function offerState(input: {
  cardRequestVersion: number;
  isLatest: boolean;
  requestStatus: string;
  requestVersion: number;
  expiresAt: string | null;
  orderStatus: ShopperOrderStatus | null;
  hasOrder: boolean;
  now?: number;
}): OfferState {
  if (!input.isLatest) return "superseded";
  if (input.hasOrder) {
    if (input.orderStatus && PAID_ORDER.includes(input.orderStatus)) return "paid";
    if (input.orderStatus === "PAYMENT_PENDING" || input.orderStatus === null) return "accepted";
    return "closed";
  }
  if (input.requestStatus === "DECLINED") return "declined";
  if (input.requestStatus !== "OFFERED") return "closed";
  const expires = input.expiresAt ? new Date(input.expiresAt).getTime() : 0;
  return expires > (input.now ?? Date.now()) ? "open" : "expired";
}

export const offerSummaryTotal = (offer: DiscoveryOffer) => offerTotal(offer);

/** What to call the thread in lists: the offered item, what the photo showed, or the note. */
export function threadTitle(input: {
  offerName?: string | null | undefined;
  analysis?: string | null | undefined;
  note?: string | null | undefined;
  sourceUrl?: string | null | undefined;
}): string {
  const clean = (v?: string | null) => (v ?? "").replace(/\s+/g, " ").trim();
  const pick =
    clean(input.offerName) ||
    clean(input.analysis) ||
    clean(input.note) ||
    (input.sourceUrl ? hostLabel(input.sourceUrl) : "");
  return (pick || "Barang incaran dari Jepang").slice(0, 80);
}

function hostLabel(url: string) {
  try {
    return `Link ${new URL(url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Link produk";
  }
}

/** A short line for the list: the text, or what kind of item arrived. */
export function messagePreview(input: {
  body: string;
  hasPhoto?: boolean;
  card?: ChatCard | null;
}): string {
  const body = input.body.replace(/\s+/g, " ").trim();
  if (body) return body.slice(0, 120);
  if (input.card?.type === "offer") {
    return `Penawaran ${input.card.number} siap, total ${formatRp(offerTotal(input.card.offer))}`;
  }
  if (input.hasPhoto) return "Foto";
  return "Pesan";
}

export const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/* ------------------------------------------------------------ opening hours */

const WIB_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Hours are in WIB. Server and tests use the same arithmetic, no time zone database needed. */
export function isOpenAt(at: Date, openHour: number, closeHour: number): boolean {
  const local = (at.getTime() + WIB_MS) % DAY_MS;
  const hour = local / 3_600_000;
  return hour >= openHour && hour < closeHour;
}

/** The next opening moment strictly after `at` when closed, or `at` when open. */
function nextOpening(at: Date, openHour: number, closeHour: number): number {
  if (isOpenAt(at, openHour, closeHour)) return at.getTime();
  const local = at.getTime() + WIB_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const todayOpen = dayStart + openHour * 3_600_000;
  const target = local < todayOpen ? todayOpen : todayOpen + DAY_MS;
  return target - WIB_MS;
}

/**
 * When a customer message should have a reply: `targetMinutes` of opening time after it.
 * Outside hours the clock starts at the next opening; time that would run past closing
 * carries over to the next day.
 */
export function responseDueAt(
  at: Date,
  targetMinutes: number,
  openHour: number,
  closeHour: number,
): Date {
  let cursor = nextOpening(at, openHour, closeHour);
  let remaining = targetMinutes * 60_000;
  for (let guard = 0; guard < 4; guard++) {
    const local = cursor + WIB_MS;
    const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
    const closeMs = dayStart + closeHour * 3_600_000 - WIB_MS;
    const room = closeMs - cursor;
    if (remaining <= room) return new Date(cursor + remaining);
    remaining -= room;
    cursor = nextOpening(new Date(closeMs), openHour, closeHour);
  }
  return new Date(cursor + remaining);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Terlambat";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}` : `${two(m)}:${two(s)}`;
}

/** Customer-facing line about when the team answers. */
export function replyPromise(input: {
  now: Date;
  openHour: number;
  closeHour: number;
  targetMinutes: number;
}): string {
  const hours = `${String(input.openHour).padStart(2, "0")}.00–${String(input.closeHour % 24).padStart(2, "0")}.00 WIB`;
  return isOpenAt(input.now, input.openHour, input.closeHour)
    ? `Tim membalas rata-rata ${input.targetMinutes} mnt · ${hours}`
    : `Tim sedang di luar jam layanan (${hours}). Kami balas begitu buka.`;
}

/* ------------------------------------------------------------------- input */

export const MAX_MESSAGE = 2000;
export const MAX_LINKS = 3;

/** Control characters out, edges trimmed, runs of blank lines collapsed. */
export function cleanMessage(raw: string): string {
  let out = "";
  for (const ch of raw.replace(/\r\n?/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 10 && code !== 9) || code === 127) continue;
    out += ch;
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function messageLinks(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/** Returns an error for text the chat should not accept, or null. */
export function messageProblem(text: string): string | null {
  if (text.length > MAX_MESSAGE) return `Pesan maksimal ${MAX_MESSAGE} karakter.`;
  const links = messageLinks(text);
  if (links.length > MAX_LINKS) return `Maksimal ${MAX_LINKS} link dalam satu pesan.`;
  if (links.some((l) => !/^https:\/\//i.test(l))) return "Gunakan link HTTPS.";
  return null;
}

/** Splits a message into text and safe https links for display. */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/https:\/\/[^\s<>"']+/gi)) {
    const start = m.index ?? 0;
    const href = m[0].replace(/[.,;:!?)]+$/, "");
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: href, href });
    last = start + href.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** A customer name for the team, from an e-mail address. */
export function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  if (!local) return "Pelanggan";
  return local
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
    .slice(0, 40);
}

/* ------------------------------------------------------------- offer money */

/** The service fee the Admin form suggests: percent of the goods in IDR, rounded up to Rp 100. */
export function suggestedFee(goodsIdr: number, feePercent: number): number {
  return Math.ceil((goodsIdr * feePercent) / 100 / 100) * 100;
}
