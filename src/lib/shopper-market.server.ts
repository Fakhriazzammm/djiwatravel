import { pool } from "../db/client.server";
import {
  MARKET_SITE_INFO,
  marketMaxQuantity,
  marketNeedsVariant,
  parseMarketPage,
  parseMarketUrl,
  type MarketItemView,
  type MarketListing,
  type MarketPage,
  type MarketRef,
} from "./shopper-market";
import { marketEnabled, type ShopperConfig } from "./personal-shopper";

const TINYFISH_FETCH = "https://api.fetch.tinyfish.ai";

type TinyResult = {
  title?: string;
  text?: string;
  error?: unknown;
  page_metadata?: {
    og?: { title?: string; image?: string[] | string };
    other?: Record<string, string>;
  };
};

/** The free TinyFish key is shared with Ide tempat: stay well below its limits. */
const recentFetches: number[] = [];
export function reserveFetchSlot(now = Date.now(), limit = 24) {
  while (recentFetches.length && now - recentFetches[0]! > 60_000) recentFetches.shift();
  if (recentFetches.length >= limit) return false;
  recentFetches.push(now);
  return true;
}

async function tinyFetch(body: Record<string, unknown>, timeoutMs = 40_000): Promise<TinyResult> {
  const key = process.env["TINYFISH_API_KEY"];
  if (!key) throw new Error("not_configured");
  if (!reserveFetchSlot()) throw new Error("busy");
  const response = await fetch(TINYFISH_FETCH, {
    method: "POST",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`fetch_${response.status}`);
  const json = (await response.json()) as { results?: TinyResult[] };
  const first = json.results?.[0];
  if (!first || first.error) throw new Error("fetch_empty");
  return first;
}

/** Like `tinyFetch`, but a selector that matches nothing is an answer (null), not a failure. */
async function tinyFetchOptional(
  body: Record<string, unknown>,
  timeoutMs = 40_000,
): Promise<TinyResult | null> {
  const key = process.env["TINYFISH_API_KEY"];
  if (!key) throw new Error("not_configured");
  if (!reserveFetchSlot()) throw new Error("busy");
  const response = await fetch(TINYFISH_FETCH, {
    method: "POST",
    headers: { "X-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`fetch_${response.status}`);
  const json = (await response.json()) as { results?: TinyResult[] };
  return json.results?.[0] ?? null;
}

const metaContent = (html: string, prop: string) => {
  const a = html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*itemprop="${prop}"`, "i"));
  const b = html.match(new RegExp(`<meta[^>]*itemprop="${prop}"[^>]*content="([^"]*)"`, "i"));
  return (a ?? b)?.[1] ?? null;
};

/** A live read of the item page (never an old cached copy: the price and stock must be current). */
export async function fetchMarketPage(ref: MarketRef): Promise<MarketPage> {
  const base = { urls: [ref.url], ttl: 0 };
  const [page, button] = await Promise.all([
    tinyFetch({ ...base, format: "markdown", page_metadata: true }),
    ref.site === "mercari"
      ? tinyFetchOptional({
          ...base,
          format: "html",
          include_selectors: ["[data-testid=checkout-button]"],
        }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const og = page.page_metadata?.og;
  const other = page.page_metadata?.other ?? {};
  const out: MarketPage = {
    title: String(page.title ?? ""),
    text: String(page.text ?? "").slice(0, 20_000),
    ogTitle: og?.title ?? null,
    ogImage: Array.isArray(og?.image) ? (og?.image[0] ?? null) : (og?.image ?? null),
    metaPrice: other["product:price:amount"] ?? null,
    metaCurrency: other["product:price:currency"] ?? null,
    itempropPrice: null,
    itempropCurrency: null,
    itempropAvailability: null,
    checkoutButtonDisabled:
      ref.site === "mercari" && button ? /\bdisabled\b/.test(String(button.text ?? "")) : null,
  };
  if (ref.site === "rakuten") {
    // The price is only in the page's own structured metas, which the text view drops.
    const html = await tinyFetch({
      ...base,
      format: "html",
      include_selectors: [
        "meta[itemprop=price]",
        "meta[itemprop=priceCurrency]",
        "meta[itemprop=availability]",
      ],
    });
    const raw = String(html.text ?? "");
    out.itempropPrice = metaContent(raw, "price");
    out.itempropCurrency = metaContent(raw, "priceCurrency");
    out.itempropAvailability = metaContent(raw, "availability");
  }
  return out;
}

type ItemRow = {
  id: string;
  site: MarketRef["site"];
  external_id: string;
  source_url: string;
  name: string;
  price_jpy: number;
  image_url: string | null;
  condition_text: string | null;
  size_text: string | null;
  sold: boolean;
  fetched_at: Date;
};

export const marketRefOf = (
  row: Pick<ItemRow, "site" | "external_id" | "source_url">,
): MarketRef => ({
  site: row.site,
  externalId: row.external_id,
  url: row.source_url,
});

export const marketView = (
  row: ItemRow,
  config: Pick<ShopperConfig, "maxQtyPerItem">,
): MarketItemView => ({
  id: row.id,
  site: row.site,
  sourceUrl: row.source_url,
  name: row.name,
  priceJpy: row.price_jpy,
  imageUrl: row.image_url,
  conditionText: row.condition_text,
  sizeText: row.size_text,
  sold: row.sold,
  needsVariant: marketNeedsVariant(row.site),
  maxQuantity: marketMaxQuantity(row.site, config.maxQtyPerItem),
});

async function save(listing: MarketListing): Promise<ItemRow> {
  const result = await pool.query(
    `insert into shopping_market_items
       (site, external_id, source_url, name, price_jpy, image_url, condition_text, size_text, sold, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (site, external_id) do update set
       source_url = excluded.source_url, name = excluded.name, price_jpy = excluded.price_jpy,
       image_url = excluded.image_url, condition_text = excluded.condition_text,
       size_text = excluded.size_text, sold = excluded.sold, fetched_at = now()
     returning *`,
    [
      listing.site,
      listing.externalId,
      listing.sourceUrl,
      listing.name,
      listing.priceJpy,
      listing.imageUrl,
      listing.conditionText,
      listing.sizeText,
      listing.sold,
    ],
  );
  return result.rows[0] as ItemRow;
}

/** Read the page now and store what it says. Throws a customer-safe message on failure. */
export async function refreshMarketItem(ref: MarketRef): Promise<ItemRow> {
  let page: MarketPage;
  try {
    page = await fetchMarketPage(ref);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "busy") throw new Error("Pembacaan link sedang ramai. Coba lagi sebentar lagi.");
    throw new Error("Halaman barang belum bisa dibuka. Coba lagi, atau minta bantuan tim.");
  }
  const parsed = parseMarketPage(ref, page);
  if (!parsed.ok) throw new Error(`${parsed.reason} Minta bantuan tim untuk memeriksanya.`);
  return save(parsed.listing);
}

export async function marketItemRow(id: string): Promise<ItemRow | null> {
  const result = await pool.query("select * from shopping_market_items where id = $1", [id]);
  return (result.rows[0] as ItemRow | undefined) ?? null;
}

/**
 * A customer pastes a link. Returns the priced listing, or null when the link is not a supported
 * marketplace page. Fresh cached copies are free; a live read counts against the member's day.
 */
export async function lookupMarketForMember(input: {
  subject: string;
  url: string;
  config: ShopperConfig;
}): Promise<MarketItemView | null> {
  const ref = parseMarketUrl(input.url);
  if (!ref) return null;
  const { config } = input;
  if (!marketEnabled(config, ref.site))
    throw new Error(`${MARKET_SITE_INFO[ref.site].name} belum tersedia. Minta bantuan tim.`);
  const cached = (
    await pool.query(
      `select * from shopping_market_items
        where site = $1 and external_id = $2 and fetched_at > now() - ($3 || ' minutes')::interval`,
      [ref.site, ref.externalId, String(config.market.cacheMinutes)],
    )
  ).rows[0] as ItemRow | undefined;
  if (cached) return marketView(cached, config);

  const used = await pool.query(
    `select count(*)::int as n from shopping_market_lookups
      where customer_auth_subject = $1
        and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'`,
    [input.subject],
  );
  if (Number((used.rows[0] as { n: number }).n) >= config.market.lookupsPerDay)
    throw new Error(
      "Batas pembacaan link harian tercapai. Coba lagi besok atau minta bantuan tim.",
    );
  await pool.query(
    "insert into shopping_market_lookups (customer_auth_subject, site) values ($1, $2)",
    [input.subject, ref.site],
  );
  return marketView(await refreshMarketItem(ref), config);
}
