/**
 * Bag brands for Titip Belanja: Legato Largo and anello (sold through Carrot Online) and Longchamp.
 * Pure parsers over the stores' public, server-rendered search pages. Nothing here fetches.
 * Anything we cannot price or sell safely (no code, no JPY price, no name, sold out) is dropped,
 * so a changed page format loses items instead of writing bad rows.
 */
import type { CatalogRow, ShopperColor } from "./personal-shopper";

export type BagBrand = "legato" | "anello" | "longchamp";

export const CARROT_HOST = "https://www.carrot-online.jp";
export const LONGCHAMP_HOST = "https://www.longchamp.com";

export type BagSource =
  | { kind: "carrot"; match: RegExp; keywords: readonly string[]; pages: number }
  | { kind: "longchamp"; queries: readonly string[] };

export const BAG_SOURCES: Record<BagBrand, BagSource> = {
  legato: { kind: "carrot", match: /legato\s*largo/i, keywords: ["legato"], pages: 3 },
  anello: { kind: "carrot", match: /anello/i, keywords: ["anello"], pages: 3 },
  longchamp: {
    kind: "longchamp",
    queries: ["le pliage", "ル プリアージュ", "ロゾ", "ショルダーバッグ", "リュック"],
  },
};

export const isBagBrand = (brand: string): brand is BagBrand => brand in BAG_SOURCES;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  yen: "¥",
  reg: "®",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const text = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const yen = (value: string): number | null => {
  const n = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 5_000_000 ? n : null;
};

const imageFrom = (url: string, hosts: RegExp): string | null => {
  const decoded = decodeEntities(url).trim();
  return hosts.test(decoded) ? decoded : null;
};

/** Newest-looking tiles first: Future Shop lists by relevance, so position gives the trend score. */
const trendFor = (position: number, total: number) =>
  Math.max(0, Math.min(100, Math.round(100 - (position / Math.max(total, 1)) * 60)));

/* ------------------------------------------------------------------ Carrot */

const CARROT_IMAGE = /^https:\/\/carrot\.itembox\.cloud\//;

/** Every product tile (one article) of a Carrot Online search page, for one brand. */
export function parseCarrotPage(html: string, brand: BagBrand): CatalogRow[] {
  const source = BAG_SOURCES[brand];
  if (source.kind !== "carrot") return [];
  const tiles = html
    .split('<article class="fs-c-productList__list__item')
    .slice(1)
    .map((chunk) => chunk.split("</article>")[0] ?? "");
  const rows: CatalogRow[] = [];
  tiles.forEach((tile, position) => {
    const href = /<a href="(\/c\/[^"]+\/([A-Za-z0-9-]{3,40}))"/.exec(tile);
    const copy = /fs-c-productName__copy">([^<]*)</.exec(tile)?.[1] ?? "";
    const name = /fs-c-productName__name">([^<]*)</.exec(tile)?.[1] ?? "";
    if (!href || !source.match.test(decodeEntities(copy))) return;
    const title = text(`${copy} ${name}`);
    const price = /fs-c-price__value">([\d,]+)</.exec(tile)?.[1];
    const priceMinor = price ? yen(price) : null;
    if (!title || priceMinor === null) return;
    const original =
      /fs-c-productPrice--(?:original|list)[\s\S]{0,400}?fs-c-price__value">([\d,]+)</.exec(
        tile,
      )?.[1];
    const originalMinor = original ? yen(original) : null;

    // Photos by colour name come from the zoom carousel; stock by colour from the cart variants.
    const photoByColor = new Map<string, string>();
    const figure = /<figcaption[^>]*>([^<]*)<\/figcaption>\s*<img[^>]*?data-src="([^"]+)"/g;
    for (const m of tile.matchAll(figure)) {
      const image = imageFrom(m[2] ?? "", CARROT_IMAGE);
      const label = text(m[1] ?? "");
      if (image && label && !photoByColor.has(label)) photoByColor.set(label, image);
    }
    const gallery = [...tile.matchAll(/data-src="([^"]+)"/g)]
      .map((m) => imageFrom(m[1] ?? "", CARROT_IMAGE))
      .filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i)
      .slice(0, 10);
    const stock = new Map<string, boolean>();
    const variant =
      /fs-c-variationCart__variationName__name">([^<]*)<[\s\S]*?(?=fs-c-variationCart__variationName__name"|$)/g;
    for (const m of tile.matchAll(variant)) {
      const label = text(m[1] ?? "");
      if (!label) continue;
      const out = /variationName__stock--outOfStock/.test(m[0]);
      stock.set(label, (stock.get(label) ?? false) || !out);
    }
    const colors: ShopperColor[] = [];
    for (const [label, available] of stock) {
      if (!available || colors.length >= 12) continue;
      colors.push({
        code: label.slice(0, 40),
        name: label.slice(0, 40),
        image: photoByColor.get(label) ?? null,
      });
    }
    // A product with colours listed but none in stock cannot be bought. No colour list: keep it.
    if (stock.size > 0 && colors.length === 0) return;

    const imageMatch =
      /data-layzr="([^"]+)"/.exec(tile)?.[1] ??
      /fs-c-productImage__image"[^>]*src="([^"]+)"/.exec(tile)?.[1];
    const imageUrl =
      imageFrom(imageMatch ?? "", CARROT_IMAGE) ?? colors.find((c) => c.image)?.image ?? null;
    rows.push({
      brand,
      productCode: href[2]!,
      name: title.slice(0, 300),
      category: "Tas",
      priceMinor,
      originalMinor: originalMinor && originalMinor > priceMinor ? originalMinor : null,
      imageUrl,
      productUrl: `${CARROT_HOST}${href[1]}`,
      rating: null,
      ratingCount: 0,
      trendScore: trendFor(position, tiles.length),
      isNew: /NEW|新作|新商品/.test(tile.slice(0, 1500)),
      sizes: [],
      colors: colors.length > 1 ? colors : [],
      gallery,
    });
  });
  return rows;
}

export const carrotSearchUrl = (keyword: string, page: number) =>
  `${CARROT_HOST}/p/search?keyword=${encodeURIComponent(keyword)}&page=${page}&sort=keyword`;

/* --------------------------------------------------------------- Longchamp */

const LONGCHAMP_IMAGE = /^https:\/\/www\.longchamp\.com\/dw\/image\//;

/** One row per colour of a model: Longchamp lists each colour as its own tile and product id. */
export function parseLongchampPage(html: string): CatalogRow[] {
  // The wishlist anchor carrying the product id closes each tile, so a tile is the markup
  // between the previous id marker and its own.
  const parts = html.split('data-pid="');
  const tiles = parts.slice(1).map((part, i) => ({
    pid: /^([A-Za-z0-9]{5,20})"/.exec(part)?.[1],
    body: parts[i] ?? "",
  }));
  const seen = new Set<string>();
  const rows: CatalogRow[] = [];
  tiles.forEach(({ pid, body }, position) => {
    if (!pid || seen.has(pid)) return;
    const link = new RegExp(`href="(/jp/ja/products/[^"]*${pid}\\.html)"`).exec(body)?.[1];
    const line = /product-item__line[^>]*>([^<]*)</.exec(body)?.[1] ?? "";
    const style = /product-item__style[^>]*>([^<]*)</.exec(body)?.[1] ?? "";
    const price = /itemprop="price"[^>]*content="(\d+)"/.exec(body)?.[1];
    const priceMinor = price ? yen(price) : null;
    const name = text(`${line} ${style}`);
    if (!link || !name || priceMinor === null) return;
    if (/priceCurrency" content="(?!JPY)/.test(body)) return;
    const image = /class="tile-image product-item__img[^"]*"\s+src="([^"]+)"/.exec(body)?.[1];
    const second = /class="tile-image product-item__img cropped"\s+src="([^"]+)"/.exec(body)?.[1];
    const secondUrl = imageFrom(second ?? "", LONGCHAMP_IMAGE);
    seen.add(pid);
    rows.push({
      brand: "longchamp",
      productCode: pid,
      name: name.slice(0, 300),
      category: "Tas",
      priceMinor,
      originalMinor: null,
      imageUrl: imageFrom(image ?? "", LONGCHAMP_IMAGE),
      productUrl: `${LONGCHAMP_HOST}${decodeEntities(link)}`,
      rating: null,
      ratingCount: 0,
      trendScore: trendFor(position, tiles.length),
      isNew: false,
      sizes: [],
      colors: [],
      gallery: secondUrl ? [secondUrl] : [],
    });
  });
  return rows;
}

export const longchampSearchUrl = (query: string) =>
  `${LONGCHAMP_HOST}/jp/ja/search?q=${encodeURIComponent(query)}`;
