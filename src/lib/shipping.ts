/**
 * Kirim Barang (international shipping, Japan first): pure rules shared by the customer screens, the
 * server and Admin. No database, network or browser APIs, so every rule is unit-tested.
 */

export const SHIPPING_SETTING_KEY = "shipping";

/** Most proof photos a customer can attach to one shipment (and weigh-in photos Admin can attach). */
export const SHIPPING_MAX_PHOTOS = 4;

export type ShippingCountryCode = "JP";

export const SHIPPING_COUNTRIES: readonly { code: ShippingCountryCode; name: string }[] = [
  { code: "JP", name: "Jepang" },
];

export const SHIPPING_CATEGORIES: readonly string[] = [
  "Makanan kering",
  "Pakaian",
  "Kosmetik",
  "Dokumen",
  "Elektronik",
  "Lainnya",
];

export const JAPAN_PREFECTURES: readonly string[] = [
  "Hokkaido",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
  "Ibaraki",
  "Tochigi",
  "Gunma",
  "Saitama",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Yamanashi",
  "Nagano",
  "Gifu",
  "Shizuoka",
  "Aichi",
  "Mie",
  "Shiga",
  "Kyoto",
  "Osaka",
  "Hyogo",
  "Nara",
  "Wakayama",
  "Tottori",
  "Shimane",
  "Okayama",
  "Hiroshima",
  "Yamaguchi",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kochi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Kumamoto",
  "Oita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
];

/* ------------------------------------------------------------------ config */

export type ShippingCountryConfig = {
  enabled: boolean;
  /** What the customer pays per billed kilogram, in IDR. */
  rateIdrPerKg: number;
  /** What the courier partner charges Djiwa per kilogram. Admin only, used for the margin. */
  partnerCostIdrPerKg: number;
};

export type DropPoint = {
  name: string;
  address: string;
  /** Free text shown to customers, for example "09.00 sampai 17.00 WIB". */
  hours: string;
  mapUrl: string;
};

export type ShippingConfig = {
  /** Master switch: off keeps the Home tile on its waitlist and hides the customer flow. */
  enabled: boolean;
  countries: Record<ShippingCountryCode, ShippingCountryConfig>;
  /** The lightest chargeable weight. */
  minKg: number;
  /** The scale weight is rounded up to a multiple of this. */
  roundKg: number;
  /** Heaviest parcel one booking may carry. */
  maxKg: number;
  dropPoint: DropPoint;
  /** Days a customer has to bring the parcel before the booking lapses. */
  dropDeadlineDays: number;
  /** Hours to pay after the team sends the bill. */
  paymentWindowHours: number;
  /** Bookings a customer may keep waiting at once. */
  maxOpenBookings: number;
  /** Proof photos of the contents a customer must attach to a booking. */
  minPhotos: number;
  /** Courier names the team picks from when it ships a parcel. */
  couriers: string[];
  /** Things that cannot be sent, shown in the form and on the info page. */
  prohibited: string[];
};

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  enabled: false,
  countries: { JP: { enabled: true, rateIdrPerKg: 150_000, partnerCostIdrPerKg: 100_000 } },
  minKg: 1,
  roundKg: 0.5,
  maxKg: 30,
  dropPoint: {
    name: "Djiwa Tasikmalaya",
    address: "Jl. Bojong Tengah No. 34, Kec. Cipedes, Tasikmalaya, Jawa Barat",
    hours: "09.00 sampai 17.00 WIB",
    mapUrl: "",
  },
  dropDeadlineDays: 7,
  paymentWindowHours: 48,
  maxOpenBookings: 3,
  minPhotos: 1,
  couriers: ["Partner Djiwa"],
  prohibited: [
    "Cairan, parfum, dan aerosol",
    "Baterai lithium dan power bank",
    "Makanan segar, daging, dan produk hewan atau tumbuhan",
    "Obat, suplemen, dan alat kesehatan",
    "Rokok, vape, dan minuman beralkohol",
    "Barang tiruan atau yang dilarang bea cukai",
  ],
};

const bool = (value: unknown, label: string) => {
  if (typeof value !== "boolean") throw new Error(`shipping.${label} harus boolean`);
  return value;
};
const intIn = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`shipping.${label} harus bilangan bulat ${min}-${max}`);
  return value as number;
};
const numIn = (value: unknown, min: number, max: number, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`shipping.${label} harus angka ${min}-${max}`);
  return Math.round(value * 100) / 100;
};
const text = (value: unknown, min: number, max: number, label: string) => {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length < min || v.length > max)
    throw new Error(`shipping.${label} harus ${min}-${max} karakter`);
  return v;
};
const list = (value: unknown, fallback: string[], max: number, label: string) => {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`shipping.${label} harus daftar berisi maksimal ${max} teks`);
  return value.map((item) => text(item, 2, 80, `${label} (tiap baris)`));
};
const obj = (value: unknown, label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`shipping.${label} harus berupa objek`);
  return value as Record<string, unknown>;
};

export function parseShippingConfig(value: unknown): ShippingConfig {
  const raw = obj(value, "config");
  const d = DEFAULT_SHIPPING_CONFIG;

  const countries = { JP: { ...d.countries.JP } };
  if (raw["countries"] !== undefined) {
    const source = obj(raw["countries"], "countries");
    for (const { code } of SHIPPING_COUNTRIES) {
      if (source[code] === undefined) continue;
      const c = obj(source[code], `countries.${code}`);
      const base = countries[code];
      countries[code] = {
        enabled: c["enabled"] === undefined ? base.enabled : bool(c["enabled"], `${code}.enabled`),
        rateIdrPerKg:
          c["rateIdrPerKg"] === undefined
            ? base.rateIdrPerKg
            : intIn(c["rateIdrPerKg"], 1_000, 5_000_000, `${code}.rateIdrPerKg`),
        partnerCostIdrPerKg:
          c["partnerCostIdrPerKg"] === undefined
            ? base.partnerCostIdrPerKg
            : intIn(c["partnerCostIdrPerKg"], 0, 5_000_000, `${code}.partnerCostIdrPerKg`),
      };
    }
  }

  const dropPoint = { ...d.dropPoint };
  if (raw["dropPoint"] !== undefined) {
    const p = obj(raw["dropPoint"], "dropPoint");
    if (p["name"] !== undefined) dropPoint.name = text(p["name"], 2, 80, "dropPoint.name");
    if (p["address"] !== undefined)
      dropPoint.address = text(p["address"], 8, 300, "dropPoint.address");
    if (p["hours"] !== undefined) dropPoint.hours = text(p["hours"], 3, 120, "dropPoint.hours");
    if (p["mapUrl"] !== undefined) {
      const url = typeof p["mapUrl"] === "string" ? p["mapUrl"].trim() : "";
      if (url && !/^https:\/\/[^\s]{4,300}$/.test(url))
        throw new Error("shipping.dropPoint.mapUrl harus tautan https");
      dropPoint.mapUrl = url;
    }
  }

  const couriers = list(raw["couriers"], d.couriers, 8, "couriers");
  if (couriers.length === 0) throw new Error("shipping.couriers minimal satu kurir");

  const minKg = raw["minKg"] === undefined ? d.minKg : numIn(raw["minKg"], 0.1, 10, "minKg");
  const roundKg =
    raw["roundKg"] === undefined ? d.roundKg : numIn(raw["roundKg"], 0.1, 5, "roundKg");
  const maxKg = raw["maxKg"] === undefined ? d.maxKg : numIn(raw["maxKg"], 1, 100, "maxKg");
  if (maxKg < minKg) throw new Error("shipping.maxKg tidak boleh lebih kecil dari minKg");

  return {
    enabled: raw["enabled"] === undefined ? d.enabled : bool(raw["enabled"], "enabled"),
    countries,
    minKg,
    roundKg,
    maxKg,
    dropPoint,
    dropDeadlineDays:
      raw["dropDeadlineDays"] === undefined
        ? d.dropDeadlineDays
        : intIn(raw["dropDeadlineDays"], 1, 30, "dropDeadlineDays"),
    paymentWindowHours:
      raw["paymentWindowHours"] === undefined
        ? d.paymentWindowHours
        : intIn(raw["paymentWindowHours"], 1, 336, "paymentWindowHours"),
    maxOpenBookings:
      raw["maxOpenBookings"] === undefined
        ? d.maxOpenBookings
        : intIn(raw["maxOpenBookings"], 1, 20, "maxOpenBookings"),
    minPhotos:
      raw["minPhotos"] === undefined
        ? d.minPhotos
        : intIn(raw["minPhotos"], 0, SHIPPING_MAX_PHOTOS, "minPhotos"),
    couriers,
    prohibited: list(raw["prohibited"], d.prohibited, 12, "prohibited"),
  };
}

/** Read path: a stored value that no longer validates falls back to the defaults. */
export function normalizeShippingConfig(value: unknown): ShippingConfig {
  try {
    return parseShippingConfig(value);
  } catch {
    return DEFAULT_SHIPPING_CONFIG;
  }
}

export const shippingCountryEnabled = (config: ShippingConfig, code: ShippingCountryCode) =>
  config.enabled && config.countries[code]?.enabled === true;

/* ----------------------------------------------------------------- pricing */

export const formatIdr = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
export const formatKg = (n: number) =>
  `${(Math.round(n * 100) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`;

/** Scale weight rounded up to the next step (never below the minimum). 2,4 kg at 0,5 steps is 2,5 kg. */
export function billedWeightKg(weighedKg: number, rule: { minKg: number; roundKg: number }) {
  const steps = Math.ceil(weighedKg / rule.roundKg - 1e-9);
  const rounded = Math.round(steps * rule.roundKg * 100) / 100;
  return Math.max(rule.minKg, rounded);
}

export type ShippingQuote = { billedKg: number; freightIdr: number; totalIdr: number };

/** The bill: billed kilograms x tariff, plus an optional packing charge. */
export function quoteShipping(input: {
  weighedKg: number;
  rateIdrPerKg: number;
  minKg: number;
  roundKg: number;
  packingIdr?: number;
}): ShippingQuote {
  const billedKg = billedWeightKg(input.weighedKg, input);
  const freightIdr = Math.round(billedKg * input.rateIdrPerKg);
  return { billedKg, freightIdr, totalIdr: freightIdr + (input.packingIdr ?? 0) };
}

/** What the booking form shows before the parcel is weighed. */
export function estimateShippingIdr(
  estimatedKg: number,
  config: Pick<ShippingConfig, "minKg" | "roundKg">,
  rateIdrPerKg: number,
) {
  return quoteShipping({ weighedKg: estimatedKg, rateIdrPerKg, ...config }).totalIdr;
}

/** Margin on one parcel: the bill minus what the partner courier charges for the same kilograms. */
export const shippingMarginIdr = (order: {
  totalIdr: number | null;
  billedKg: number | null;
  partnerIdrPerKg: number;
}) =>
  order.totalIdr === null || order.billedKg === null
    ? null
    : order.totalIdr - Math.round(order.billedKg * order.partnerIdrPerKg);

/* ------------------------------------------------------------------ status */

export type ShippingStatus =
  | "AWAITING_DROP"
  | "RECEIVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "SHIPPED"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export const SHIPPING_STATUS_LABEL: Record<ShippingStatus, string> = {
  AWAITING_DROP: "Menunggu diantar",
  RECEIVED: "Diterima di drop point",
  PAYMENT_PENDING: "Menunggu pembayaran",
  PAID: "Dibayar",
  SHIPPED: "Dikirim ke Jepang",
  ARRIVED: "Tiba di Jepang",
  DELIVERED: "Selesai",
  CANCELLED: "Dibatalkan",
  REJECTED: "Ditolak",
  EXPIRED: "Kedaluwarsa",
};

/** The steps a customer sees on the timeline, in order. */
export const SHIPPING_STEPS: readonly ShippingStatus[] = [
  "AWAITING_DROP",
  "RECEIVED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPED",
  "ARRIVED",
  "DELIVERED",
];

export const SHIPPING_DEAD: readonly ShippingStatus[] = ["CANCELLED", "REJECTED", "EXPIRED"];
export const shippingIsDead = (s: ShippingStatus) => SHIPPING_DEAD.includes(s);

/** Statuses Admin may move forward with one button, and the label of that button. */
export const SHIPPING_ADMIN_NEXT: Partial<Record<ShippingStatus, ShippingStatus>> = {
  AWAITING_DROP: "RECEIVED",
  PAID: "SHIPPED",
  SHIPPED: "ARRIVED",
  ARRIVED: "DELIVERED",
};
export const SHIPPING_ADMIN_NEXT_LABEL: Partial<Record<ShippingStatus, string>> = {
  AWAITING_DROP: "Terima di drop point",
  PAID: "Tandai dikirim",
  SHIPPED: "Tandai tiba di Jepang",
  ARRIVED: "Tandai selesai",
};

/** The customer may cancel only while the parcel has not reached the drop point. */
export const customerCanCancel = (s: ShippingStatus) => s === "AWAITING_DROP";
/** Before payment Admin rejects (no refund); after payment and before shipping Admin cancels (refund). */
export const adminCanReject = (s: ShippingStatus) =>
  s === "AWAITING_DROP" || s === "RECEIVED" || s === "PAYMENT_PENDING" || s === "EXPIRED";
export const adminCanCancel = (s: ShippingStatus) => s === "PAID";
export const shippingIsPaid = (s: ShippingStatus) =>
  s === "PAID" || s === "SHIPPED" || s === "ARRIVED" || s === "DELIVERED";
/** Weighing and billing happen once the parcel is at the drop point (or its bill lapsed). */
export const adminCanBill = (s: ShippingStatus) => s === "RECEIVED" || s === "EXPIRED";

export const NOTIFY_TEXT: Partial<Record<ShippingStatus, string>> = {
  RECEIVED:
    "Paketmu sudah diterima di drop point Tasikmalaya. Kami timbang dan kirim tagihannya segera.",
  PAID: "Pembayaran diterima. Paketmu masuk jadwal kirim ke Jepang.",
  ARRIVED: "Paketmu tiba di Jepang dan segera diantar ke penerima.",
  DELIVERED: "Pengiriman selesai. Terima kasih sudah memakai Kirim Barang.",
};

/* -------------------------------------------------------------- validation */

export type ShippingRecipientInput = {
  recipientName: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
};

const LATIN = /^[\x20-\x7E]+$/;

/** "+81 90-1234-5678" and "0901234567" style input to "+819012345678"; null when it is not a Japan number. */
export function normalizeJapanPhone(raw: string): string | null {
  let v = raw.replace(/[\s\-().]/g, "");
  if (v.startsWith("+81")) v = v.slice(3);
  else if (v.startsWith("81") && v.length >= 11) v = v.slice(2);
  else if (v.startsWith("0")) v = v.slice(1);
  else return null;
  return /^\d{9,10}$/.test(v) ? `+81${v}` : null;
}

/** "1500002" or "150-0002" to "150-0002"; null when it is not seven digits. */
export function normalizeJapanPostal(raw: string): string | null {
  const v = raw.replace(/[\s-]/g, "");
  return /^\d{7}$/.test(v) ? `${v.slice(0, 3)}-${v.slice(3)}` : null;
}

export function validateShippingRecipient(a: ShippingRecipientInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (a.recipientName.trim().length < 2) errors["recipientName"] = "Nama penerima wajib diisi";
  else if (!LATIN.test(a.recipientName)) errors["recipientName"] = "Tulis nama dengan huruf latin";
  if (!normalizeJapanPhone(a.phone)) errors["phone"] = "Nomor telepon Jepang tidak valid (+81)";
  if (!normalizeJapanPostal(a.postalCode))
    errors["postalCode"] = "Kode pos 7 digit, contoh 150-0002";
  if (!JAPAN_PREFECTURES.includes(a.prefecture)) errors["prefecture"] = "Pilih prefektur";
  if (a.city.trim().length < 2) errors["city"] = "Kota atau kelurahan wajib diisi";
  else if (!LATIN.test(a.city)) errors["city"] = "Tulis dengan huruf latin";
  if (a.addressLine.trim().length < 5) errors["addressLine"] = "Alamat lengkap wajib diisi";
  else if (!LATIN.test(a.addressLine)) errors["addressLine"] = "Tulis alamat dengan huruf latin";
  return errors;
}

export type ShippingGoodsInput = {
  category: string;
  contents: string;
  declaredValueIdr: number;
  estimatedKg: number;
  acceptedRules: boolean;
};

export function validateShippingGoods(
  g: ShippingGoodsInput,
  config: Pick<ShippingConfig, "minKg" | "maxKg" | "roundKg">,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!SHIPPING_CATEGORIES.includes(g.category)) errors["category"] = "Pilih kategori barang";
  if (g.contents.trim().length < 3) errors["contents"] = "Tulis isi paket";
  if (
    !Number.isInteger(g.declaredValueIdr) ||
    g.declaredValueIdr < 0 ||
    g.declaredValueIdr > 100_000_000
  )
    errors["declaredValueIdr"] = "Nilai barang tidak valid";
  if (
    !Number.isFinite(g.estimatedKg) ||
    g.estimatedKg < config.minKg ||
    g.estimatedKg > config.maxKg
  )
    errors["estimatedKg"] = `Berat ${config.minKg} sampai ${config.maxKg} kg`;
  if (!g.acceptedRules) errors["acceptedRules"] = "Setujui daftar barang terlarang dulu";
  return errors;
}

export function validateShippingInbound(i: {
  mode: "SELF" | "COURIER";
  courier: string;
  tracking: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (i.mode === "COURIER") {
    if (i.courier.trim().length < 2) errors["inboundCourier"] = "Tulis nama kurir";
    if (i.tracking.trim().length < 4) errors["inboundTracking"] = "Tulis nomor resi";
  }
  return errors;
}

/* ------------------------------------------------------------------ codes */

export const shippingCodeFrom = (n: number) => `DJW-KR-${String(n).padStart(4, "0")}`;

export const dropDeadline = (createdAt: Date, days: number) =>
  new Date(createdAt.getTime() + days * 86_400_000);

/** Days after booking when the reminder goes out. */
export const REMINDER_AFTER_DAYS = 3;
/** Days after arrival in Japan when a parcel completes without the customer's confirmation. */
export const AUTO_COMPLETE_DAYS = 14;

/* ----------------------------------------------------------------- display */

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });

/** Google Maps link for the drop point: Admin's own link when set, else a search for its name and address. */
export const mapsSearchUrl = (point: Pick<DropPoint, "name" | "address">) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.name}, ${point.address}`)}`;

/* ------------------------------------------------------------- photo review */

export type PhotoReview = "PENDING" | "APPROVED" | "REDO";
export const PHOTO_REVIEW_LABEL: Record<PhotoReview, string> = {
  PENDING: "Menunggu ditinjau",
  APPROVED: "Foto disetujui",
  REDO: "Perlu foto ulang",
};

/* ---------------------------------------------------------------- QR and scan */

const CODE_PATTERN = /DJW-KR-\d{4,}/i;

/** What the QR on the parcel label holds: a link whose only data is the shipment code. */
export const scanUrl = (origin: string, code: string) =>
  `${origin.replace(/\/$/, "")}/admin/shipping?scan=${encodeURIComponent(code)}`;

/**
 * Reads a shipment code out of whatever a scanner delivers: the bare code, the label's link, or text
 * with stray characters around it (USB scanners add line breaks). Null when there is no code.
 */
export function parseScanCode(raw: string): string | null {
  const match = CODE_PATTERN.exec(raw.trim());
  return match ? match[0].toUpperCase() : null;
}

/* ----------------------------------------------------------------- documents */

export type LabelData = {
  code: string;
  qrValue: string;
  recipientName: string;
  phone: string;
  addressLines: string[];
  contents: string;
  estimatedKg: number;
  dropPointName: string;
  dropPointAddress: string;
};

export function buildLabelData(
  order: {
    code: string;
    recipientName: string;
    phone: string;
    addressLine: string;
    city: string;
    prefecture: string;
    postalCode: string;
    category: string;
    contents: string;
    estimatedKg: number;
  },
  dropPoint: Pick<DropPoint, "name" | "address">,
  origin: string,
): LabelData {
  return {
    code: order.code,
    qrValue: scanUrl(origin, order.code),
    recipientName: order.recipientName,
    phone: order.phone,
    addressLines: [order.addressLine, `${order.city}, ${order.prefecture} ${order.postalCode}`],
    contents: `${order.category}: ${order.contents}`,
    estimatedKg: order.estimatedKg,
    dropPointName: dropPoint.name,
    dropPointAddress: dropPoint.address,
  };
}

export const labelFileName = (code: string, ext: "png" | "pdf") =>
  `label-${code.replace(/[^A-Za-z0-9-]/g, "")}.${ext}`;
