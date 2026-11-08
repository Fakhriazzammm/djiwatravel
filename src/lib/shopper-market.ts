/**
 * Marketplace listings (Mercari, Rakuten) priced from the item page itself.
 * Pure rules: URL allow-list, reading the fetched page, and what a listing may be sold for.
 * The price comes only from the page's own metadata, never from an AI answer.
 */
import type { MarketSite } from "./personal-shopper";

export const MARKET_SITE_INFO: Record<
  MarketSite,
  { name: string; used: boolean; color: string; monogram: string }
> = {
  mercari: { name: "Mercari", used: true, color: "#ff0211", monogram: "ME" },
  rakuten: { name: "Rakuten", used: false, color: "#bf0000", monogram: "RK" },
};

export type MarketRef = { site: MarketSite; externalId: string; url: string };

/** Only these shapes are ever fetched: one public item page on a known host. */
export function parseMarketUrl(raw: string): MarketRef | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host === "jp.mercari.com") {
    const m = url.pathname.match(/^\/item\/(m\d{6,16})\/?$/);
    return m
      ? { site: "mercari", externalId: m[1]!, url: `https://jp.mercari.com/item/${m[1]}` }
      : null;
  }
  if (host === "item.rakuten.co.jp") {
    const m = url.pathname.match(/^\/([A-Za-z0-9_-]{2,40})\/([A-Za-z0-9_.-]{1,80})\/?$/);
    return m
      ? {
          site: "rakuten",
          externalId: `${m[1]}/${m[2]}`,
          url: `https://item.rakuten.co.jp/${m[1]}/${m[2]}/`,
        }
      : null;
  }
  return null;
}

export type MarketListing = {
  site: MarketSite;
  externalId: string;
  sourceUrl: string;
  name: string;
  priceJpy: number;
  imageUrl: string | null;
  conditionText: string | null;
  sizeText: string | null;
  sold: boolean;
};

/** What the page fetcher gives us, reduced to the fields the rules read. */
export type MarketPage = {
  title: string;
  /** Page text (markdown). */
  text: string;
  ogTitle: string | null;
  ogImage: string | null;
  /** Page metadata `product:price:amount` / `product:price:currency` (Mercari). */
  metaPrice: string | null;
  metaCurrency: string | null;
  /** Rakuten: the `itemprop` metas read from the page. */
  itempropPrice: string | null;
  itempropCurrency: string | null;
  itempropAvailability: string | null;
  /**
   * Mercari: the page's checkout button exists only on a listing that was sold, and is then disabled.
   * `null` means it was not checked.
   */
  checkoutButtonDisabled?: boolean | null;
};

const IMAGE_HOSTS = [
  "static.mercdn.net",
  "image.rakuten.co.jp",
  "thumbnail.image.rakuten.co.jp",
  "shop.r10s.jp",
  "tshop.r10s.jp",
];

export function safeMarketImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim().replace(/^http:\/\//, "https://"));
    return url.protocol === "https:" && IMAGE_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export const MARKET_MIN_JPY = 100;
export const MARKET_MAX_JPY = 2_000_000;

const priceOf = (raw: string | null, currency: string | null) => {
  if (!raw || (currency && currency.toUpperCase() !== "JPY")) return null;
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= MARKET_MIN_JPY && n <= MARKET_MAX_JPY ? n : null;
};

const compact = (text: string) => text.replace(/[#*\s]+/g, "");

export type MarketParse = { ok: true; listing: MarketListing } | { ok: false; reason: string };

export function parseMarketPage(ref: MarketRef, page: MarketPage): MarketParse {
  const name =
    ref.site === "mercari"
      ? (page.ogTitle || page.title).replace(/\s*by\s*メルカリ\s*$/i, "").trim()
      : (page.ogTitle || page.title)
          .replace(/^【楽天市場】/, "")
          .replace(/[：:][^：:]*楽天市場店\s*$/, "")
          .trim();
  if (name.length < 2) return { ok: false, reason: "Nama produk tidak terbaca." };

  if (ref.site === "mercari") {
    const price = priceOf(page.metaPrice, page.metaCurrency);
    if (price === null) return { ok: false, reason: "Harga tidak terbaca dari halaman." };
    const t = compact(page.text);
    // Verified live: a sold listing says so and/or carries a disabled checkout button; a listing that
    // can be bought has neither (its buy button text is not reliably in the page text).
    const sold = /売り切れ/.test(t) || page.checkoutButtonDisabled === true;
    const size = t.match(/サイズ([A-Za-z0-9()（）/.-]{1,14}?)商品の状態/)?.[1] ?? null;
    const condition =
      t.match(/商品の状態(.{1,60}?)(?:配送料の負担|配送の方法|発送元|出品者)/)?.[1] ?? null;
    return {
      ok: true,
      listing: {
        site: "mercari",
        externalId: ref.externalId,
        sourceUrl: ref.url,
        name: name.slice(0, 300),
        priceJpy: price,
        imageUrl: safeMarketImage(page.ogImage),
        conditionText: condition,
        sizeText: size,
        sold,
      },
    };
  }

  const price = priceOf(page.itempropPrice, page.itempropCurrency);
  if (price === null) return { ok: false, reason: "Harga tidak terbaca dari halaman." };
  const availability = page.itempropAvailability ?? "";
  const sold = availability !== "" && !/InStock|LimitedAvailability/i.test(availability);
  return {
    ok: true,
    listing: {
      site: "rakuten",
      externalId: ref.externalId,
      sourceUrl: ref.url,
      name: name.slice(0, 300),
      priceJpy: price,
      imageUrl: safeMarketImage(page.ogImage),
      conditionText: null,
      sizeText: null,
      sold,
    },
  };
}

/** What the customer sees and the cart keeps. */
export type MarketItemView = {
  id: string;
  site: MarketSite;
  sourceUrl: string;
  name: string;
  priceJpy: number;
  imageUrl: string | null;
  conditionText: string | null;
  sizeText: string | null;
  sold: boolean;
  /** Rakuten shops sell variants (size, color) that the page cannot give us: the customer names one. */
  needsVariant: boolean;
  maxQuantity: number;
};

export const marketNeedsVariant = (site: MarketSite) => site === "rakuten";
export const marketMaxQuantity = (site: MarketSite, maxQtyPerItem: number) =>
  site === "mercari" ? 1 : maxQtyPerItem;

/** Why a listing cannot be ordered right now, or null. */
export function marketBlocker(item: Pick<MarketItemView, "sold">) {
  return item.sold ? "Barang ini sudah terjual atau stoknya habis." : null;
}
