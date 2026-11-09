/**
 * Titip Belanja (personal shopper): pure rules shared by the customer screens, the server and Admin.
 * No database, no network, no browser APIs here, so every rule is unit-tested.
 */

export const SHOPPER_SETTING_KEY = "personalShopper";

export type ShopperCountryCode = "JP" | "KR" | "TH" | "SG";
export type ShopperBrandId = "uniqlo" | "gu" | "legato" | "anello" | "longchamp" | "donki" | "muji";
export type ShopperCategory = "Atasan" | "Bawahan" | "Jaket" | "Inner" | "Tas" | "Lainnya";
export type ShopperSort = "pop" | "best" | "low" | "high" | "new";

export const SHOPPER_COUNTRIES: readonly {
  code: ShopperCountryCode;
  name: string;
  short: string;
  currency: string;
  symbol: string;
}[] = [
  { code: "JP", name: "Jepang", short: "Jepang", currency: "JPY", symbol: "¥" },
  { code: "KR", name: "Korea Selatan", short: "Korea", currency: "KRW", symbol: "₩" },
  { code: "TH", name: "Thailand", short: "Thailand", currency: "THB", symbol: "฿" },
  { code: "SG", name: "Singapura", short: "Singapura", currency: "SGD", symbol: "S$" },
];

export const SHOPPER_BRANDS: readonly {
  id: ShopperBrandId;
  name: string;
  monogram: string;
  color: string;
  country: ShopperCountryCode;
  /** Brands with a working catalog adapter. The others are shown as "Segera". */
  adapter: boolean;
  /** Official mark kept on our own origin. "fill" logos are square art, "fit" ones sit on white. */
  logo: { src: string; mode: "fill" | "fit" };
}[] = [
  {
    id: "uniqlo",
    name: "Uniqlo",
    monogram: "UQ",
    color: "#e60012",
    country: "JP",
    adapter: true,
    logo: { src: "/shopper-brands/uniqlo.svg", mode: "fill" },
  },
  {
    id: "gu",
    name: "GU",
    monogram: "GU",
    color: "#1d1d1f",
    country: "JP",
    adapter: true,
    logo: { src: "/shopper-brands/gu.svg", mode: "fill" },
  },
  {
    id: "legato",
    name: "Legato Largo",
    monogram: "LL",
    color: "#1f6f5c",
    country: "JP",
    adapter: true,
    logo: { src: "/shopper-brands/legato.svg", mode: "fit" },
  },
  {
    id: "anello",
    name: "anello",
    monogram: "AN",
    color: "#e8663d",
    country: "JP",
    adapter: true,
    logo: { src: "/shopper-brands/anello.png", mode: "fit" },
  },
  {
    id: "longchamp",
    name: "Longchamp",
    monogram: "LC",
    color: "#0b2a5b",
    country: "JP",
    adapter: true,
    logo: { src: "/shopper-brands/longchamp.png", mode: "fill" },
  },
  {
    id: "donki",
    name: "Don Quijote",
    monogram: "DQ",
    color: "#d99100",
    country: "JP",
    adapter: false,
    logo: { src: "/shopper-brands/donki.jpg", mode: "fill" },
  },
  {
    id: "muji",
    name: "MUJI",
    monogram: "MJ",
    color: "#7d1f1f",
    country: "JP",
    adapter: false,
    logo: { src: "/shopper-brands/muji.svg", mode: "fit" },
  },
];

export const SHOPPER_CATEGORIES: readonly ShopperCategory[] = [
  "Atasan",
  "Bawahan",
  "Jaket",
  "Inner",
  "Tas",
];

export const SHOPPER_SORTS: readonly { id: ShopperSort; label: string }[] = [
  { id: "pop", label: "Paling populer" },
  { id: "best", label: "Terlaris" },
  { id: "low", label: "Harga terendah" },
  { id: "high", label: "Harga tertinggi" },
  { id: "new", label: "Terbaru" },
];

export const countryByCode = (code: string) => SHOPPER_COUNTRIES.find((c) => c.code === code);
export const brandById = (id: string) => SHOPPER_BRANDS.find((b) => b.id === id);

/* ------------------------------------------------------------------ config */

export type MarketSite = "mercari" | "rakuten";
export const MARKET_SITES: readonly MarketSite[] = ["mercari", "rakuten"];
export type MarketConfig = {
  enabled: boolean;
  sites: Record<MarketSite, boolean>;
  /** Estimated delivery inside Japan, charged once per marketplace item, in IDR. */
  domesticIdr: number;
  /** Link lookups one member may make per day. */
  lookupsPerDay: number;
  /** A fetched listing younger than this is reused. */
  cacheMinutes: number;
};

export type ShopperConfig = {
  /** Master switch: off hides the Home tile and the whole customer flow. */
  enabled: boolean;
  /** Countries customers can order from. Others show "Segera hadir" with a waitlist. */
  countries: Record<ShopperCountryCode, boolean>;
  brands: Record<ShopperBrandId, boolean>;
  /** Service fee on the goods subtotal, in percent. */
  feePercent: number;
  /** One shipping charge per order, in IDR. */
  shippingIdr: number;
  /** IDR for one unit of the country's currency (for example 105 for 1 JPY). */
  rates: Record<string, number>;
  /** How long the quoted rate holds while the customer pays, in minutes. */
  paymentWindowMinutes: number;
  maxQtyPerItem: number;
  maxLinesPerOrder: number;
  /** A catalog older than this is refreshed by the scheduled task. */
  catalogRefreshHours: number;
  showTrending: boolean;
  showBestSellers: boolean;
  /** Things the team will not buy or ship, shown to customers as "Tidak bisa dititip". */
  prohibited: string[];
  /** Mercari and Rakuten links priced from the item page (Japan only). */
  market: MarketConfig;
};

export const DEFAULT_SHOPPER_CONFIG: ShopperConfig = {
  enabled: false,
  countries: { JP: true, KR: false, TH: false, SG: false },
  brands: {
    uniqlo: true,
    gu: true,
    legato: true,
    anello: true,
    longchamp: true,
    donki: false,
    muji: false,
  },
  feePercent: 10,
  shippingIdr: 60_000,
  rates: { JPY: 105, KRW: 11.5, THB: 460, SGD: 12_000 },
  paymentWindowMinutes: 60,
  maxQtyPerItem: 5,
  maxLinesPerOrder: 20,
  catalogRefreshHours: 12,
  showTrending: true,
  showBestSellers: true,
  prohibited: [
    "Makanan dan minuman segar atau cepat basi",
    "Obat, suplemen, dan alat kesehatan",
    "Rokok, vape, dan minuman beralkohol",
    "Power bank dan baterai lithium lepasan",
    "Barang tiruan atau yang dilarang bea cukai",
  ],
  market: {
    enabled: false,
    sites: { mercari: true, rakuten: true },
    domesticIdr: 35_000,
    lookupsPerDay: 30,
    cacheMinutes: 10,
  },
};

const bool = (value: unknown, label: string) => {
  if (typeof value !== "boolean") throw new Error(`personalShopper.${label} harus boolean`);
  return value;
};
const intIn = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`personalShopper.${label} harus bilangan bulat ${min}-${max}`);
  return value as number;
};

function parseProhibited(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length > 12)
    throw new Error("personalShopper.prohibited harus daftar berisi maksimal 12 teks");
  return value.map((item) => {
    const text = typeof item === "string" ? item.trim() : "";
    if (text.length < 2 || text.length > 80)
      throw new Error("personalShopper.prohibited: tiap baris 2-80 karakter");
    return text;
  });
}

function parseMarketConfig(value: unknown): MarketConfig {
  const d = DEFAULT_SHOPPER_CONFIG.market;
  if (value === undefined) return d;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("personalShopper.market harus berupa objek");
  const raw = value as Record<string, unknown>;
  const sites = { ...d.sites };
  if (raw["sites"] !== undefined) {
    const source = raw["sites"];
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw new Error("personalShopper.market.sites harus berupa objek");
    for (const site of MARKET_SITES) {
      const v = (source as Record<string, unknown>)[site];
      if (v !== undefined) sites[site] = bool(v, `market.sites.${site}`);
    }
  }
  return {
    enabled: raw["enabled"] === undefined ? d.enabled : bool(raw["enabled"], "market.enabled"),
    sites,
    domesticIdr:
      raw["domesticIdr"] === undefined
        ? d.domesticIdr
        : intIn(raw["domesticIdr"], 0, 1_000_000, "market.domesticIdr"),
    lookupsPerDay:
      raw["lookupsPerDay"] === undefined
        ? d.lookupsPerDay
        : intIn(raw["lookupsPerDay"], 1, 200, "market.lookupsPerDay"),
    cacheMinutes:
      raw["cacheMinutes"] === undefined
        ? d.cacheMinutes
        : intIn(raw["cacheMinutes"], 1, 120, "market.cacheMinutes"),
  };
}

export function parseShopperConfig(value: unknown): ShopperConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("personalShopper harus berupa objek");
  const raw = value as Record<string, unknown>;
  const d = DEFAULT_SHOPPER_CONFIG;
  const flags = <K extends string>(
    key: string,
    ids: readonly K[],
    fallback: Record<K, boolean>,
  ): Record<K, boolean> => {
    const source = raw[key];
    if (source === undefined) return fallback;
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw new Error(`personalShopper.${key} harus berupa objek`);
    const out = { ...fallback };
    for (const id of ids) {
      const v = (source as Record<string, unknown>)[id];
      if (v !== undefined) out[id] = bool(v, `${key}.${id}`);
    }
    return out;
  };
  const rates = { ...d.rates };
  if (raw["rates"] !== undefined) {
    if (!raw["rates"] || typeof raw["rates"] !== "object" || Array.isArray(raw["rates"]))
      throw new Error("personalShopper.rates harus berupa objek");
    for (const country of SHOPPER_COUNTRIES) {
      const v = (raw["rates"] as Record<string, unknown>)[country.currency];
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1_000_000)
        throw new Error(`personalShopper.rates.${country.currency} harus angka positif`);
      rates[country.currency] = Math.round(v * 10_000) / 10_000;
    }
  }
  const fee = raw["feePercent"] === undefined ? d.feePercent : raw["feePercent"];
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 50)
    throw new Error("personalShopper.feePercent harus 0-50");
  return {
    enabled: raw["enabled"] === undefined ? d.enabled : bool(raw["enabled"], "enabled"),
    countries: flags(
      "countries",
      SHOPPER_COUNTRIES.map((c) => c.code),
      d.countries,
    ),
    brands: flags(
      "brands",
      SHOPPER_BRANDS.map((b) => b.id),
      d.brands,
    ),
    feePercent: Math.round(fee * 100) / 100,
    shippingIdr:
      raw["shippingIdr"] === undefined
        ? d.shippingIdr
        : intIn(raw["shippingIdr"], 0, 5_000_000, "shippingIdr"),
    rates,
    paymentWindowMinutes:
      raw["paymentWindowMinutes"] === undefined
        ? d.paymentWindowMinutes
        : intIn(raw["paymentWindowMinutes"], 10, 1440, "paymentWindowMinutes"),
    maxQtyPerItem:
      raw["maxQtyPerItem"] === undefined
        ? d.maxQtyPerItem
        : intIn(raw["maxQtyPerItem"], 1, 20, "maxQtyPerItem"),
    maxLinesPerOrder:
      raw["maxLinesPerOrder"] === undefined
        ? d.maxLinesPerOrder
        : intIn(raw["maxLinesPerOrder"], 1, 50, "maxLinesPerOrder"),
    catalogRefreshHours:
      raw["catalogRefreshHours"] === undefined
        ? d.catalogRefreshHours
        : intIn(raw["catalogRefreshHours"], 1, 168, "catalogRefreshHours"),
    showTrending:
      raw["showTrending"] === undefined
        ? d.showTrending
        : bool(raw["showTrending"], "showTrending"),
    showBestSellers:
      raw["showBestSellers"] === undefined
        ? d.showBestSellers
        : bool(raw["showBestSellers"], "showBestSellers"),
    prohibited: parseProhibited(raw["prohibited"], d.prohibited),
    market: parseMarketConfig(raw["market"]),
  };
}

/** Read path: a stored value that no longer validates falls back to the defaults. */
export function normalizeShopperConfig(value: unknown): ShopperConfig {
  try {
    return parseShopperConfig(value);
  } catch {
    return DEFAULT_SHOPPER_CONFIG;
  }
}

export const countryEnabled = (config: ShopperConfig, code: ShopperCountryCode) =>
  config.enabled && config.countries[code];
export const brandEnabled = (config: ShopperConfig, id: ShopperBrandId) => {
  const brand = brandById(id);
  return Boolean(brand?.adapter && config.brands[id] && countryEnabled(config, brand.country));
};

export const marketEnabled = (config: ShopperConfig, site: MarketSite) =>
  countryEnabled(config, "JP") && config.market.enabled && config.market.sites[site];

/* ------------------------------------------------------------------ pricing */

/** IDR for an amount in the store's minor units (whole yen for Japan). */
export const toIdr = (minor: number, rate: number) => Math.round(minor * rate);

export type QuoteLine = { unitMinor: number; quantity: number };
export type OrderQuote = {
  subtotalIdr: number;
  /** Delivery inside Japan for marketplace items. Zero for store catalog orders. */
  domesticIdr: number;
  feeIdr: number;
  shippingIdr: number;
  totalIdr: number;
  rate: number;
};

/**
 * The one price rule. The fee is rounded up to the next Rp 100 so the total stays a friendly number
 * and the service never loses a fraction on rounding. Used by the cart (estimate) and by the server
 * (the amount that is billed), so both always agree.
 */
export function quoteShopperOrder(
  lines: readonly QuoteLine[],
  rate: number,
  config: Pick<ShopperConfig, "feePercent" | "shippingIdr">,
  domesticIdr = 0,
): OrderQuote {
  const subtotalIdr = lines.reduce((sum, l) => sum + toIdr(l.unitMinor, rate) * l.quantity, 0);
  const feeIdr =
    subtotalIdr === 0 ? 0 : Math.ceil((subtotalIdr * config.feePercent) / 100 / 100) * 100;
  const shippingIdr = subtotalIdr === 0 ? 0 : config.shippingIdr;
  const domestic = subtotalIdr === 0 ? 0 : domesticIdr;
  return {
    subtotalIdr,
    domesticIdr: domestic,
    feeIdr,
    shippingIdr,
    totalIdr: subtotalIdr + domestic + feeIdr + shippingIdr,
    rate,
  };
}

export const formatIdr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
/** "Rp 135rb" style used on cards. */
export const formatIdrShort = (n: number) =>
  n >= 1_000_000
    ? `Rp ${(n / 1_000_000)
        .toFixed(2)
        .replace(/\.?0+$/, "")
        .replace(".", ",")}jt`
    : `Rp ${Math.round(n / 1000)}rb`;
export const formatMinor = (minor: number, symbol: string) =>
  `${symbol}${Math.round(minor).toLocaleString("id-ID")}`;
export const formatCount = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")}rb` : String(n);

/* ------------------------------------------------------------------ products */

export type ShopperColor = { code: string; name: string; image: string | null };

export type ShopperProduct = {
  id: string;
  brand: ShopperBrandId;
  code: string;
  name: string;
  /** Indonesian reading of the store name when we have one, shown first. */
  nameId: string | null;
  category: ShopperCategory;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  productUrl: string;
  rating: number | null;
  ratingCount: number;
  /** 0-100, from the store's own ordering across our seed searches. */
  trend: number;
  /** Units Djiwa customers paid for (last 90 days). Zero until orders exist. */
  sold: number;
  isNew: boolean;
  sizes: string[];
  colors: ShopperColor[];
  /** Extra shots from the store (back, detail, styling), full size, never the colour photos. */
  gallery: string[];
};

export const productTitle = (p: Pick<ShopperProduct, "name" | "nameId">) => p.nameId || p.name;

export type ShopperFilters = {
  brand: ShopperBrandId | "all";
  category: ShopperCategory | "all";
  /** Max price in the store's currency (minor units); null means no limit. */
  maxPrice: number | null;
  onlySale: boolean;
  query: string;
  sort: ShopperSort;
};

export const DEFAULT_SHOPPER_FILTERS: ShopperFilters = {
  brand: "all",
  category: "all",
  maxPrice: null,
  onlySale: false,
  query: "",
  sort: "pop",
};

/** Customers type English or Indonesian; store names are Japanese, so common words are mapped. */
const SEARCH_ALIASES: Record<string, string[]> = {
  heattech: ["ヒートテック", "heattech"],
  airism: ["エアリズム", "airism"],
  fleece: ["フリース"],
  down: ["ダウン"],
  jacket: ["ジャケット", "ブルゾン", "パーカ"],
  jaket: ["ジャケット", "ブルゾン", "パーカ", "ダウン"],
  coat: ["コート"],
  shirt: ["シャツ"],
  kemeja: ["シャツ"],
  tee: ["tシャツ", "t"],
  kaos: ["tシャツ"],
  tshirt: ["tシャツ"],
  sweater: ["スウェット", "ニット"],
  sweat: ["スウェット"],
  knit: ["ニット"],
  cardigan: ["カーディガン"],
  pants: ["パンツ"],
  celana: ["パンツ", "ジーンズ"],
  jeans: ["ジーンズ", "デニム"],
  skirt: ["スカート"],
  rok: ["スカート"],
  dress: ["ワンピース"],
  vest: ["ベスト"],
  linen: ["リネン"],
  cargo: ["カーゴ"],
  wide: ["ワイド"],
  socks: ["ソックス"],
  kaos_kaki: ["ソックス"],
  tas: ["バッグ", "ポーチ"],
  bag: ["バッグ"],
  ransel: ["リュック"],
  backpack: ["リュック"],
  rucksack: ["リュック"],
  tote: ["トート"],
  selempang: ["ショルダー", "ポシェット"],
  shoulder: ["ショルダー"],
  sling: ["ショルダー", "ボディ"],
  pouch: ["ポーチ"],
  dompet: ["財布", "ウォレット"],
  wallet: ["財布", "ウォレット"],
  pliage: ["プリアージュ"],
};

/** Lower-case terms (original + aliases) that a product name may contain. */
export function searchTerms(query: string): string[][] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => [word, ...(SEARCH_ALIASES[word] ?? [])]);
}

export function matchesQuery(p: ShopperProduct, query: string) {
  const groups = searchTerms(query);
  if (groups.length === 0) return true;
  const hay =
    `${p.name} ${p.nameId ?? ""} ${p.code} ${brandById(p.brand)?.name ?? ""} ${p.category}`.toLowerCase();
  return groups.every((alts) => alts.some((term) => hay.includes(term)));
}

const trendKey = (p: ShopperProduct) => p.trend * 1000 + Math.min(p.ratingCount, 999);
const bestKey = (p: ShopperProduct) => p.sold * 1_000_000 + p.ratingCount;

export function filterShopperProducts(
  products: readonly ShopperProduct[],
  filters: ShopperFilters,
): ShopperProduct[] {
  const out = products.filter(
    (p) =>
      (filters.brand === "all" || p.brand === filters.brand) &&
      (filters.category === "all" || p.category === filters.category) &&
      (filters.maxPrice === null || p.price <= filters.maxPrice) &&
      (!filters.onlySale || p.originalPrice !== null) &&
      matchesQuery(p, filters.query),
  );
  const compare: Record<ShopperSort, (a: ShopperProduct, b: ShopperProduct) => number> = {
    pop: (a, b) => trendKey(b) - trendKey(a),
    best: (a, b) => bestKey(b) - bestKey(a),
    low: (a, b) => a.price - b.price,
    high: (a, b) => b.price - a.price,
    new: (a, b) => Number(b.isNew) - Number(a.isNew) || trendKey(b) - trendKey(a),
  };
  return out.sort(compare[filters.sort]);
}

export const trendingProducts = (products: readonly ShopperProduct[], limit = 6) =>
  [...products].sort((a, b) => trendKey(b) - trendKey(a)).slice(0, limit);
export const bestSellerProducts = (products: readonly ShopperProduct[], limit = 6) =>
  [...products].sort((a, b) => bestKey(b) - bestKey(a)).slice(0, limit);

/** "12 terjual" once Djiwa has real sales, otherwise the store's review count, never a made-up number. */
export function soldLabel(p: Pick<ShopperProduct, "sold" | "ratingCount">) {
  if (p.sold > 0) return `${formatCount(p.sold)} terjual`;
  if (p.ratingCount > 0) return `${formatCount(p.ratingCount)} ulasan`;
  return "Baru di katalog";
}

export const activeFilterCount = (f: ShopperFilters) =>
  Number(f.category !== "all") + Number(f.maxPrice !== null) + Number(f.onlySale);

/* ------------------------------------------------------------ store adapters */

export type CatalogSeed = { query: string; category: ShopperCategory };

/** Searches that fill the cache. Japanese terms because the store search is Japanese. */
export const SHOPPER_SEEDS: Record<"uniqlo" | "gu", readonly CatalogSeed[]> = {
  uniqlo: [
    { query: "ヒートテック", category: "Inner" },
    { query: "エアリズム", category: "Inner" },
    { query: "Tシャツ", category: "Atasan" },
    { query: "シャツ", category: "Atasan" },
    { query: "スウェット", category: "Atasan" },
    { query: "ニット", category: "Atasan" },
    { query: "パンツ", category: "Bawahan" },
    { query: "ジーンズ", category: "Bawahan" },
    { query: "ダウン", category: "Jaket" },
    { query: "フリース", category: "Jaket" },
    { query: "ブルゾン", category: "Jaket" },
    { query: "コート", category: "Jaket" },
  ],
  gu: [
    { query: "Tシャツ", category: "Atasan" },
    { query: "シャツ", category: "Atasan" },
    { query: "スウェット", category: "Atasan" },
    { query: "ニット", category: "Atasan" },
    { query: "カーディガン", category: "Atasan" },
    { query: "パンツ", category: "Bawahan" },
    { query: "スカート", category: "Bawahan" },
    { query: "ジーンズ", category: "Bawahan" },
    { query: "ジャケット", category: "Jaket" },
    { query: "ベスト", category: "Jaket" },
    { query: "ブルゾン", category: "Jaket" },
    { query: "ヒートテック", category: "Inner" },
  ],
};

export const STORE_HOSTS: Record<"uniqlo" | "gu", string> = {
  uniqlo: "https://www.uniqlo.com/jp",
  gu: "https://www.gu-global.com/jp",
};

export type CatalogRow = {
  brand: ShopperBrandId;
  productCode: string;
  name: string;
  category: ShopperCategory;
  priceMinor: number;
  originalMinor: number | null;
  imageUrl: string | null;
  productUrl: string;
  rating: number | null;
  ratingCount: number;
  trendScore: number;
  isNew: boolean;
  sizes: string[];
  colors: ShopperColor[];
  gallery: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const imageOk = (v: unknown) => {
  const url = str(v);
  return /^https:\/\/image\.uniqlo\.com\//.test(url) ? url : null;
};

/**
 * One item of the Uniqlo/GU commerce API to our row. Returns null for anything we cannot sell
 * safely (no code, no JPY price, no name), so a changed provider format drops items instead of
 * writing bad rows. `position` is the item's place in the store's own ordering for the seed search.
 */
export function mapStoreItem(
  raw: unknown,
  brand: "uniqlo" | "gu",
  category: ShopperCategory,
  position: number,
  total: number,
): CatalogRow | null {
  if (!isRecord(raw)) return null;
  const code = str(raw["productId"]);
  const name = str(raw["name"]);
  if (!/^[A-Za-z0-9-]{3,40}$/.test(code) || !name) return null;
  const prices = isRecord(raw["prices"]) ? raw["prices"] : {};
  const base = isRecord(prices["base"]) ? prices["base"] : {};
  const promo = isRecord(prices["promo"]) ? prices["promo"] : null;
  const baseCurrency = isRecord(base["currency"]) ? str(base["currency"]["code"]) : "";
  const baseValue = Number(base["value"]);
  const promoValue = promo ? Number(promo["value"]) : NaN;
  if (baseCurrency !== "JPY" || !Number.isFinite(baseValue) || baseValue <= 0) return null;
  const onSale = Number.isFinite(promoValue) && promoValue > 0 && promoValue < baseValue;
  const priceMinor = Math.round(onSale ? promoValue : baseValue);
  const priceGroup = str(raw["priceGroup"]) || "00";

  const images =
    isRecord(raw["images"]) && isRecord(raw["images"]["main"]) ? raw["images"]["main"] : {};
  const colorList = Array.isArray(raw["colors"]) ? raw["colors"] : [];
  const colors: ShopperColor[] = [];
  for (const c of colorList.slice(0, 12)) {
    if (!isRecord(c)) continue;
    const display = str(c["displayCode"]);
    const colorName = str(c["name"]);
    if (!display || !colorName) continue;
    const entry = isRecord(images[display]) ? images[display] : {};
    colors.push({ code: display, name: colorName.slice(0, 40), image: imageOk(entry["image"]) });
  }
  const representative = str(raw["representativeColorDisplayCode"]);
  const repImage = isRecord(images[representative])
    ? imageOk(images[representative]["image"])
    : null;
  const imageUrl = repImage ?? colors.find((c) => c.image)?.image ?? null;

  const sizes = (Array.isArray(raw["sizes"]) ? raw["sizes"] : [])
    .map((s) => (isRecord(s) ? str(s["name"]) : ""))
    .filter((s) => s.length > 0 && s.length <= 20)
    .slice(0, 16);

  const subImages =
    isRecord(raw["images"]) && Array.isArray(raw["images"]["sub"]) ? raw["images"]["sub"] : [];
  const gallery: string[] = [];
  for (const entry of subImages) {
    const url = isRecord(entry) ? imageOk(entry["image"]) : null;
    if (url && !gallery.includes(url)) gallery.push(url);
    if (gallery.length >= 8) break;
  }

  const rating = isRecord(raw["rating"]) ? raw["rating"] : {};
  const average = Number(rating["average"]);
  const count = Number(rating["count"]);
  const flags =
    isRecord(raw["representative"]) && isRecord(raw["representative"]["flags"])
      ? raw["representative"]["flags"]
      : {};
  const productFlags = Array.isArray(flags["productFlags"]) ? flags["productFlags"] : [];
  const isNew = productFlags.some((f) => isRecord(f) && /new/i.test(str(f["code"])));

  const trendScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (position / Math.max(total, 1)) * 60 + (isNew ? 5 : 0))),
  );
  return {
    brand,
    productCode: code,
    name: name.slice(0, 300),
    category,
    priceMinor,
    originalMinor: onSale ? Math.round(baseValue) : null,
    imageUrl,
    productUrl: `${STORE_HOSTS[brand]}/ja/products/${code}/${priceGroup}`,
    rating: Number.isFinite(average) && average > 0 ? Math.min(5, average) : null,
    ratingCount: Number.isFinite(count) && count > 0 ? Math.round(count) : 0,
    trendScore,
    isNew,
    sizes,
    colors,
    gallery,
  };
}

/* -------------------------------------------------------------------- photos */

/**
 * The same photo at another width. Uniqlo/GU and Longchamp image servers resize on request,
 * so lists load small files and the viewer loads large ones. Other hosts are returned as is.
 */
export function imageVariant(url: string | null, width: number): string | null {
  if (!url) return url;
  const w = String(Math.max(64, Math.min(2000, Math.round(width))));
  try {
    const u = new URL(url);
    if (u.hostname === "image.uniqlo.com") {
      u.searchParams.set("width", w);
      return u.toString();
    }
    if (u.hostname === "www.longchamp.com" && u.pathname.startsWith("/dw/image/")) {
      u.searchParams.set("sw", w);
      u.searchParams.set("sh", w);
      return u.toString();
    }
  } catch {
    return url;
  }
  return url;
}

export type GalleryImage = { src: string; label: string };

const photoKey = (src: string) => src.split("?")[0] ?? src;

/**
 * Every photo the viewer can show, the chosen colour first: the main photo, one per colour,
 * then the store's extra shots. Duplicates are dropped; at most 16.
 */
export function productGallery(
  product: Pick<ShopperProduct, "imageUrl" | "colors" | "gallery">,
  colorCode?: string | null,
): GalleryImage[] {
  const out: GalleryImage[] = [];
  const seen = new Set<string>();
  const add = (src: string | null | undefined, label: string) => {
    if (!src || out.length >= 16) return;
    const key = photoKey(src);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ src, label });
  };
  const chosen = colorCode ? product.colors.find((c) => c.code === colorCode) : undefined;
  if (chosen?.image) add(chosen.image, chosen.name);
  add(product.imageUrl, "Foto utama");
  for (const c of product.colors) add(c.image, c.name);
  product.gallery.forEach((src, i) => add(src, `Detail ${i + 1}`));
  return out;
}

/* ------------------------------------------------------------------- orders */

export type ShopperOrderStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "PURCHASED"
  | "SHIPPED"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED"
  | "EXPIRED";

export const ORDER_STATUS_LABEL: Record<ShopperOrderStatus, string> = {
  PAYMENT_PENDING: "Menunggu pembayaran",
  PAID: "Dibayar, menunggu dibeli",
  PURCHASED: "Sudah dibeli di toko",
  SHIPPED: "Dikirim dari Jepang",
  ARRIVED: "Tiba di Indonesia",
  DELIVERED: "Selesai diantar",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
};

/** Timeline steps a customer sees, in order. */
export const ORDER_STEPS: readonly ShopperOrderStatus[] = [
  "PAID",
  "PURCHASED",
  "SHIPPED",
  "ARRIVED",
  "DELIVERED",
];

/** Admin moves an order one step forward at a time; cancelling is allowed until it ships. */
export const ADMIN_NEXT: Partial<Record<ShopperOrderStatus, ShopperOrderStatus>> = {
  PAID: "PURCHASED",
  PURCHASED: "SHIPPED",
  SHIPPED: "ARRIVED",
  ARRIVED: "DELIVERED",
};
export const ADMIN_NEXT_LABEL: Partial<Record<ShopperOrderStatus, string>> = {
  PAID: "Tandai sudah dibeli",
  PURCHASED: "Tandai dikirim",
  SHIPPED: "Tandai tiba di Indonesia",
  ARRIVED: "Tandai selesai diantar",
};
export const canAdminCancel = (status: ShopperOrderStatus) =>
  status === "PAID" || status === "PURCHASED" || status === "PAYMENT_PENDING";
export const orderIsPaid = (status: ShopperOrderStatus) =>
  status !== "PAYMENT_PENDING" && status !== "CANCELLED" && status !== "EXPIRED";

export const orderCodeFrom = (n: number) => `TB-${String(n).padStart(6, "0")}`;

export type ShopperAddress = {
  recipientName: string;
  whatsapp: string;
  addressLine: string;
  city: string;
  postalCode: string;
};

export function validateShopperAddress(a: ShopperAddress): Record<string, string> {
  const errors: Record<string, string> = {};
  if (a.recipientName.trim().length < 2) errors["recipientName"] = "Nama penerima wajib diisi";
  if (!/^62\d{7,13}$/.test(a.whatsapp.trim()))
    errors["whatsapp"] = "Nomor WhatsApp harus diawali 62";
  if (a.addressLine.trim().length < 8) errors["addressLine"] = "Alamat lengkap wajib diisi";
  if (a.city.trim().length < 2) errors["city"] = "Kota wajib diisi";
  if (!/^\d{5}$/.test(a.postalCode.trim())) errors["postalCode"] = "Kode pos 5 digit";
  return errors;
}
