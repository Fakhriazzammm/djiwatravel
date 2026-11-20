import type { AdminCustomerDetail } from "./admin-customers.server";

/**
 * Customer analysis for the Admin detail page. Pure: everything is derived from the detail the
 * server already returns (no extra queries), so each rule is unit-tested.
 */

type Detail = NonNullable<AdminCustomerDetail>;

const DAY = 86_400_000;
const PAID_ORDER = new Set(["PAYMENT_CONFIRMED", "PROVISIONING", "READY", "INSTALLED"]);

export const isPaidOrder = (o: Detail["orders"][number]) =>
  Boolean(o.paidAt) || PAID_ORDER.has(o.status);

export type Money = { idr: number; paidOrders: number };

export function spend(detail: Detail) {
  const esim = detail.orders
    .filter((o) => isPaidOrder(o) && o.currency === "IDR")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const shopping = detail.shopping.filter((o) => Boolean(o.paidAt));
  const shop = shopping.reduce((sum, o) => sum + o.totalIdr, 0);
  const ship = detail.shipping
    .filter((o) => o.paidAt)
    .reduce((sum, o) => sum + (o.totalIdr ?? 0), 0);
  const paidOrders =
    detail.orders.filter(isPaidOrder).length +
    detail.shipping.filter((o) => o.paidAt).length +
    shopping.length;
  return { esim, shop, ship, total: esim + shop + ship, paidOrders };
}

export type FeatureUse = { id: string; label: string; count: number; weight: number };

export function featureUsage(detail: Detail): FeatureUse[] {
  return [
    { id: "esim", label: "eSIM", count: detail.orders.length, weight: 25 },
    { id: "trip", label: "Perjalanan", count: detail.trips.length, weight: 15 },
    { id: "shopping", label: "Titip Belanja", count: detail.shopping.length, weight: 15 },
    { id: "shipping", label: "Kirim Barang", count: detail.shipping.length, weight: 15 },
    {
      id: "feeds",
      label: "Feeds",
      count: detail.feeds.posts.length + detail.feeds.comments + detail.feeds.likes,
      weight: 10,
    },
  ];
}

/** 0-100: features tried, a paid purchase, a complete profile and answered consents. */
export function engagementScore(detail: Detail): number {
  let score = 0;
  for (const f of featureUsage(detail)) if (f.count > 0) score += f.weight;
  if (spend(detail).paidOrders > 0) score += 10;
  if (detail.profile?.nationality && detail.profile.dateOfBirth && detail.profile.gender)
    score += 5;
  if (detail.whatsapp) score += 3;
  if (detail.consents.length > 0) score += 2;
  return Math.min(100, score);
}

export type Segment = { id: string; label: string; tone: "good" | "warn" | "neutral" | "info" };

export function lastActivity(detail: Detail): string | null {
  return timeline(detail)[0]?.at ?? null;
}

export function customerSegment(detail: Detail, now = Date.now()): Segment {
  const paid = spend(detail).paidOrders;
  const last = lastActivity(detail);
  const idle = last ? (now - new Date(last).getTime()) / DAY : null;
  if (detail.kind === "guest") return { id: "guest", label: "Tamu", tone: "neutral" };
  if (paid >= 3) return { id: "loyal", label: "Pelanggan setia", tone: "good" };
  if (paid > 0 && idle !== null && idle > 60)
    return { id: "slipping", label: "Hampir pergi", tone: "warn" };
  if (paid > 0) return { id: "buyer", label: "Sudah membeli", tone: "good" };
  const joined = detail.profile ? new Date(detail.profile.createdAt).getTime() : null;
  if (joined !== null && now - joined <= 14 * DAY)
    return { id: "new", label: "Baru", tone: "info" };
  if (idle !== null && idle > 60) return { id: "dormant", label: "Tidak aktif", tone: "warn" };
  return { id: "browsing", label: "Belum membeli", tone: "neutral" };
}

export type Alert = { tone: "warn" | "bad" | "info"; text: string };

export function healthAlerts(detail: Detail, now = Date.now()): Alert[] {
  const out: Alert[] = [];
  const hours = (iso: string) => (now - new Date(iso).getTime()) / 3_600_000;
  const stuckEsim = detail.orders.filter(
    (o) =>
      !isPaidOrder(o) &&
      !["CANCELLED", "EXPIRED", "FAILED"].includes(o.status) &&
      hours(o.createdAt) > 24,
  );
  if (stuckEsim.length)
    out.push({
      tone: "warn",
      text: `${stuckEsim.length} pesanan eSIM belum dibayar lebih dari 24 jam.`,
    });
  const waitingPay = detail.shipping.filter((o) => o.status === "PAYMENT_PENDING");
  if (waitingPay.length)
    out.push({
      tone: "warn",
      text: `${waitingPay.length} kiriman menunggu pembayaran dari pelanggan.`,
    });
  const problems = detail.shipping.filter((o) => o.status === "PROBLEM");
  if (problems.length)
    out.push({ tone: "bad", text: `${problems.length} kiriman berstatus bermasalah.` });
  if (detail.kind === "member" && !detail.whatsapp)
    out.push({ tone: "info", text: "Nomor WhatsApp belum tersimpan, sulit dihubungi." });
  if (detail.kind === "member" && !detail.profile)
    out.push({ tone: "info", text: "Profil belum dilengkapi." });
  const seg = customerSegment(detail, now);
  if (seg.id === "slipping")
    out.push({
      tone: "warn",
      text: "Pernah membeli, tetapi sepi lebih dari 60 hari. Layak dihubungi.",
    });
  const consentOff = detail.consents.filter((c) => !c.granted).length;
  if (consentOff > 0)
    out.push({
      tone: "info",
      text: `${consentOff} persetujuan data ditolak, hormati saat mengirim promo atau AI.`,
    });
  return out;
}

export type TimelineEvent = {
  at: string;
  kind: "esim" | "trip" | "shopping" | "shipping" | "feed" | "consent" | "profile";
  title: string;
  detail?: string | undefined;
};

export function timeline(detail: Detail): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const o of detail.orders) {
    events.push({
      at: o.createdAt,
      kind: "esim",
      title: `Memesan eSIM ${o.code ?? ""}`.trim(),
      detail: o.items || undefined,
    });
    if (o.paidAt)
      events.push({ at: o.paidAt, kind: "esim", title: `Membayar eSIM ${o.code ?? ""}`.trim() });
  }
  for (const t of detail.trips)
    events.push({
      at: t.createdAt,
      kind: "trip",
      title: `Membuat perjalanan ${t.name}`,
      detail: t.destination,
    });
  for (const s of detail.shopping)
    events.push({
      at: s.createdAt,
      kind: "shopping",
      title: `Titip Belanja ${s.code}`,
      detail: s.status,
    });
  for (const s of detail.shipping) {
    events.push({
      at: s.createdAt,
      kind: "shipping",
      title: `Kirim Barang ${s.code}`,
      detail: s.status,
    });
    if (s.paidAt)
      events.push({ at: s.paidAt, kind: "shipping", title: `Membayar kiriman ${s.code}` });
  }
  for (const p of detail.feeds.posts)
    events.push({
      at: p.createdAt,
      kind: "feed",
      title: `Posting di Feeds (${p.kind})`,
      detail: p.excerpt,
    });
  for (const c of detail.consents)
    events.push({
      at: c.at,
      kind: "consent",
      title: `${c.granted ? "Menyetujui" : "Menolak"} ${c.purpose}`,
    });
  if (detail.profile)
    events.push({ at: detail.profile.createdAt, kind: "profile", title: "Membuat profil" });
  return events
    .filter((e) => e.at && !Number.isNaN(new Date(e.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** Events per month for the last `months` months, oldest first (for the activity chart). */
export function monthlyActivity(detail: Detail, months = 12, now = new Date()) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const e of timeline(detail)) {
    const d = new Date(e.at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}
