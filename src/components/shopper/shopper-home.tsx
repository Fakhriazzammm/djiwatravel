import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ReceiptText, Search, ShoppingBag, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import { FixedLayer } from "@/components/motion-primitives";
import { TravelWaitlistCard } from "@/components/travel-waitlist-card";
import { MascotLoader } from "@/components/mascot-loader";
import { getShopperCatalog } from "@/lib/personal-shopper.fn";
import {
  DEFAULT_SHOPPER_FILTERS,
  SHOPPER_BRANDS,
  SHOPPER_CATEGORIES,
  SHOPPER_COUNTRIES,
  activeFilterCount,
  bestSellerProducts,
  brandById,
  brandEnabled,
  countryByCode,
  filterShopperProducts,
  formatIdr,
  formatIdrShort,
  formatMinor,
  productTitle,
  soldLabel,
  toIdr,
  trendingProducts,
  type ShopperConfig,
  type ShopperCountryCode,
  type ShopperFilters,
  type ShopperProduct,
} from "@/lib/personal-shopper";
import { cartCount, cartQuote, useShopperCart } from "./shopper-cart";
import { CartSheet, FilterSheet, ProductSheet, SortSheet } from "./shopper-sheets";
import { ShopperNav } from "./shopper-nav";
import { BrandBubble, ProductImage, SaleTag } from "./shopper-ui";

export type ShopperHomeData = {
  config: ShopperConfig;
  open: boolean;
  products: ShopperProduct[];
  updatedAt: string | null;
};

const SKELETON_MS = 220;

/** Titip Belanja home: country, search, brand stories, curated rails, then the filterable list. */
export function ShopperHome({
  data,
  cartRequested = false,
  onCartHandled,
}: {
  data: ShopperHomeData;
  cartRequested?: boolean;
  onCartHandled?: () => void;
}) {
  const reduce = Boolean(useReducedMotion());
  const config = data.config;
  const firstOpen =
    SHOPPER_COUNTRIES.find((c) => config.enabled && config.countries[c.code])?.code ?? "JP";
  const [country, setCountry] = useState<ShopperCountryCode>(firstOpen);
  const [products, setProducts] = useState<ShopperProduct[]>(data.products);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ShopperFilters>(DEFAULT_SHOPPER_FILTERS);
  const [busy, setBusy] = useState(false);
  const [openProduct, setOpenProduct] = useState<ShopperProduct | null>(null);
  const [sheet, setSheet] = useState<null | "filter" | "sort" | "cart">(null);
  const cart = useShopperCart();
  useEffect(() => {
    if (!cartRequested) return;
    if (cart.length > 0) setSheet("cart");
    else toast.info("Keranjang masih kosong. Pilih barang untuk dititip.");
    onCartHandled?.();
  }, [cartRequested, cart.length, onCartHandled]);
  const openCart = () => {
    if (cart.length > 0) setSheet("cart");
    else toast.info("Keranjang masih kosong. Pilih barang untuk dititip.");
  };
  const cartBar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const info = countryByCode(country)!;
  const countryOpen = config.enabled && config.countries[country];
  const rate = config.rates[info.currency] ?? 0;
  const money = { symbol: info.symbol, rate, currency: info.currency };
  const firstCartItem = cart[0];
  const cartCountry = firstCartItem
    ? (brandById(firstCartItem.brand)?.country ?? country)
    : country;
  const cartInfo = countryByCode(cartCountry)!;
  const cartRate = config.rates[cartInfo.currency] ?? 0;
  const cartMoney = { symbol: cartInfo.symbol, rate: cartRate, currency: cartInfo.currency };
  const brands = SHOPPER_BRANDS.filter((b) => b.country === country);

  // A short shimmer on every change keeps the list from jumping and mirrors the prototype.
  const touch = useCallback(() => {
    if (reduce) return;
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBusy(false), SKELETON_MS);
  }, [reduce]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const update = (next: ShopperFilters) => {
    setFilters(next);
    touch();
  };

  async function pickCountry(code: ShopperCountryCode) {
    if (code === country) return;
    setCountry(code);
    setFilters(DEFAULT_SHOPPER_FILTERS);
    touch();
    if (!(config.enabled && config.countries[code])) {
      setProducts([]);
      return;
    }
    setLoading(true);
    try {
      const next = await getShopperCatalog({ data: { country: code } });
      setProducts(next.products);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  const scoped = useMemo(
    () => products.filter((p) => filters.brand === "all" || p.brand === filters.brand),
    [products, filters.brand],
  );
  const results = useMemo(() => filterShopperProducts(products, filters), [products, filters]);
  const filtering =
    filters.query.trim() !== "" || activeFilterCount(filters) > 0 || filters.sort !== "pop";
  const maxPrice = useMemo(() => products.reduce((m, p) => Math.max(m, p.price), 0), [products]);
  const quote = cartQuote(cart, cartRate, config);

  function flyToCart(origin: HTMLElement | null) {
    const target = cartBar.current;
    if (!origin || !target || reduce) return;
    const a = origin.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.style.cssText = `position:fixed;z-index:80;width:16px;height:16px;border-radius:9999px;background:var(--brand-red);pointer-events:none;left:${a.left + a.width / 2 - 8}px;top:${a.top + a.height / 2 - 8}px`;
    document.body.appendChild(dot);
    const dx = b.left + 36 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    dot
      .animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx * 0.45}px,${dy * 0.55 - 50}px) scale(1.15)`,
            opacity: 1,
            offset: 0.5,
          },
          { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: 0.3 },
        ],
        { duration: 650, easing: "cubic-bezier(.4,0,.2,1)" },
      )
      .finished.finally(() => dot.remove());
  }

  return (
    <Page tabs={false}>
      <BackBar
        title="Titip Belanja"
        fallbackTo="/explore"
        action={
          <Link
            to="/titip-belanja/pesanan"
            aria-label="Pesanan Titip Belanja"
            className="tap flex size-9 items-center justify-center rounded-full bg-secondary"
          >
            <ReceiptText className="size-4" aria-hidden="true" />
          </Link>
        }
      />
      <p className="ios-subtitle -mt-1 mb-2">
        {countryOpen
          ? `Belanja dari ${info.name}, kami belikan dan kirim · ${info.symbol}1 = ${formatIdr(rate)}`
          : "Segera hadir"}
      </p>

      {/* Country segment */}
      <div
        role="tablist"
        aria-label="Negara"
        className="relative mb-2 grid grid-cols-4 rounded-xl bg-secondary p-0.5"
      >
        {SHOPPER_COUNTRIES.map((c) => {
          const active = country === c.code;
          const live = config.enabled && config.countries[c.code];
          return (
            <button
              key={c.code}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => void pickCountry(c.code)}
              className={`tap relative z-10 min-h-8 rounded-[10px] text-[12px] font-semibold transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="shopper-country"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-[10px] bg-surface shadow-sm"
                />
              )}
              {c.short}
              {!live && (
                <i
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-border"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      {countryOpen ? (
        <>
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={filters.query}
              onChange={(e) => update({ ...filters, query: e.target.value })}
              placeholder={`Cari produk di ${info.name}…`}
              aria-label="Cari produk"
              className="min-h-9 w-full rounded-xl border border-border/70 bg-surface pl-9 pr-3 text-[14px] outline-none transition-shadow focus:border-brand-red focus:ring-2 focus:ring-brand-red/15"
            />
          </label>

          {/* Brand stories */}
          <div className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
            <BrandStory
              label="Semua"
              brand="all"
              selected={filters.brand === "all"}
              onClick={() => update({ ...filters, brand: "all" })}
            />
            {brands.map((b) => {
              const live = brandEnabled(config, b.id);
              return (
                <BrandStory
                  key={b.id}
                  label={b.name.split(" ")[0]!}
                  brand={b.id}
                  muted={!live}
                  selected={filters.brand === b.id}
                  onClick={() => {
                    if (!live) return void toast(`${b.name} segera hadir`);
                    update({ ...filters, brand: b.id, category: "all" });
                  }}
                />
              );
            })}
          </div>

          <AnimatePresence initial={false} mode="wait">
            {filters.brand !== "all" && (
              <BrandBanner key={filters.brand} brand={filters.brand} products={products} />
            )}
          </AnimatePresence>

          {loading || busy ? (
            <ListSkeleton />
          ) : products.length === 0 ? (
            <div className="mt-4 text-center">
              <MascotLoader
                compact
                label="Menyiapkan katalog"
                lines={["Menyiapkan katalog toko…", "Mengambil produk terbaru…"]}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Katalog sedang disiapkan. Coba lagi beberapa saat.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void getShopperCatalog({ data: { country } })
                    .then((r) => setProducts(r.products))
                    .finally(() => setLoading(false));
                }}
                className="tap ios-btn mt-2 bg-secondary"
              >
                Muat ulang
              </button>
            </div>
          ) : (
            <>
              {!filtering && config.showTrending && (
                <Rail
                  title={`Trending di ${filters.brand === "all" ? info.name : (brandById(filters.brand)?.name ?? info.name)}`}
                  subtitle="Skor naik hari ini"
                  items={trendingProducts(scoped)}
                  money={money}
                  meta={(p) => `Skor ${p.trend} · ${brandById(p.brand)?.name}`}
                  onOpen={setOpenProduct}
                />
              )}
              {!filtering && config.showBestSellers && (
                <Rail
                  title={`Terlaris di ${filters.brand === "all" ? "Djiwa" : (brandById(filters.brand)?.name ?? "Djiwa")}`}
                  subtitle="Paling sering dititip"
                  items={bestSellerProducts(scoped)}
                  money={money}
                  meta={soldLabel}
                  onOpen={setOpenProduct}
                />
              )}

              <div className="mb-1.5 mt-4 flex items-center justify-between">
                <h2 className="text-[14px] font-bold">
                  {filtering ? "Hasil" : "Semua produk"} · {results.length}
                </h2>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSheet("sort")}
                    className="tap ios-chip gap-1 bg-secondary"
                  >
                    <ArrowUpDown className="size-3.5" aria-hidden="true" />
                    Urutkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheet("filter")}
                    className="tap ios-chip gap-1 bg-secondary"
                  >
                    <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                    Filter
                    {activeFilterCount(filters) > 0 && (
                      <span className="rounded-full bg-brand-red px-1.5 text-[10px] text-white">
                        {activeFilterCount(filters)}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {filters.brand !== "all" && (
                <div className="mb-1.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {(["all", ...SHOPPER_CATEGORIES] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ ...filters, category: c })}
                      className={`tap ios-chip shrink-0 ${filters.category === c ? "bg-brand-red text-white" : "bg-secondary"}`}
                    >
                      {c === "all" ? "Semua" : c}
                    </button>
                  ))}
                </div>
              )}
              {results.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-muted-foreground">
                  Tidak ada produk. Coba ubah filter.
                </p>
              ) : (
                <ul className="space-y-1.5 pb-28">
                  {results.slice(0, 60).map((p, i) => (
                    <motion.li
                      key={p.id}
                      initial={reduce ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: Math.min(i, 8) * 0.04,
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenProduct(p)}
                        className="tap flex w-full items-center gap-2.5 rounded-2xl border border-border/70 bg-surface p-2 text-left"
                      >
                        <ProductImage
                          src={p.imageUrl}
                          alt={productTitle(p)}
                          className="size-14 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] text-muted-foreground">
                            {brandById(p.brand)?.name} · {p.category}
                          </span>
                          <span className="line-clamp-2 text-[12px] font-semibold leading-tight">
                            {productTitle(p)}
                          </span>
                          <span className="block text-[12px] font-bold">
                            {formatIdrShort(toIdr(p.price, rate))}
                            {p.originalPrice ? (
                              <s className="ml-1 text-[9px] font-normal text-muted-foreground">
                                {formatIdrShort(toIdr(p.originalPrice, rate))}
                              </s>
                            ) : null}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {soldLabel(p)}
                          </span>
                        </span>
                        <span className="ios-btn min-h-7 bg-brand-red px-2.5 text-[11px] text-white">
                          Titip
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center px-4 text-center">
          <ShoppingBag className="size-10 text-brand-red" aria-hidden="true" />
          <h2 className="mt-2 text-[16px] font-bold">{info.name} segera hadir</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Kami mulai dari Jepang. Daftar supaya dikabari saat {info.name} dibuka.
          </p>
          <div className="mt-3 flex w-full max-w-xs flex-col gap-2">
            <TravelWaitlistCard
              feature="shopper"
              label="Titip Belanja"
              sub={`${info.name} segera hadir`}
              icon={ShoppingBag}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="tap ios-btn w-full bg-brand-red text-white"
                >
                  Kabari saya
                </button>
              )}
            />
            <button
              type="button"
              onClick={() => void pickCountry(firstOpen)}
              className="tap ios-btn w-full bg-secondary"
            >
              Kembali ke {countryByCode(firstOpen)?.name}
            </button>
          </div>
        </div>
      )}

      <div aria-hidden="true" className="h-[calc(3rem+env(safe-area-inset-bottom))]" />
      <ShopperNav active={sheet === "cart" ? "cart" : "shop"} onCart={openCart} />

      {/* Cart bar */}
      <FixedLayer>
        <AnimatePresence>
          {cart.length > 0 && (
            <motion.div
              ref={cartBar}
              key="cart"
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-4"
            >
              <div className="flex items-center gap-2 rounded-2xl bg-foreground p-2 pl-3 text-background shadow-lg">
                <span className="flex min-w-5 items-center justify-center rounded-full bg-brand-red px-1.5 text-[11px] font-bold text-white">
                  {cartCount(cart)}
                </span>
                <span className="flex-1 text-[13px] font-semibold">
                  {formatIdr(quote.totalIdr)}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet("cart")}
                  className="tap ios-btn min-h-8 bg-background text-foreground"
                >
                  Tinjau
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FixedLayer>

      <ProductSheet
        product={openProduct}
        money={money}
        config={config}
        onClose={() => setOpenProduct(null)}
        onAdded={flyToCart}
      />
      <FilterSheet
        open={sheet === "filter"}
        onOpenChange={(o) => setSheet(o ? "filter" : null)}
        filters={filters}
        setFilters={update}
        country={country}
        onCountry={(c) => void pickCountry(c)}
        config={config}
        money={money}
        maxCatalogPrice={maxPrice}
        resultCount={results.length}
      />
      <SortSheet
        open={sheet === "sort"}
        onOpenChange={(o) => setSheet(o ? "sort" : null)}
        value={filters.sort}
        onChange={(sort) => update({ ...filters, sort })}
      />
      <CartSheet
        open={sheet === "cart"}
        onOpenChange={(o) => setSheet(o ? "cart" : null)}
        cart={cart}
        country={cartCountry}
        money={cartMoney}
        config={config}
      />
    </Page>
  );
}

function BrandStory({
  label,
  brand,
  selected,
  muted = false,
  onClick,
}: {
  label: string;
  brand: "all" | ShopperProduct["brand"];
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="tap w-14 shrink-0 text-center"
    >
      <span className="mx-auto flex justify-center py-1">
        <BrandBubble brand={brand} selected={selected} muted={muted} />
      </span>
      <span className="block text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function BrandBanner({
  brand,
  products,
}: {
  brand: ShopperProduct["brand"];
  products: ShopperProduct[];
}) {
  const info = brandById(brand)!;
  const own = products.filter((p) => p.brand === brand);
  const avg = own.length ? Math.round(own.reduce((s, p) => s + p.price, 0) / own.length) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{ background: info.color }}
      className="mt-1 flex items-center gap-2.5 rounded-2xl p-2.5 text-white"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-[14px] font-extrabold">
        {info.monogram}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold leading-tight">{info.name} Jepang</span>
        <span className="block text-[10px] opacity-85">
          {own.length} produk · rata-rata {formatMinor(avg, "¥")} · tiba 7–14 hari
        </span>
      </span>
    </motion.div>
  );
}

function Rail({
  title,
  subtitle,
  items,
  money,
  meta,
  onOpen,
}: {
  title: string;
  subtitle: string;
  items: ShopperProduct[];
  money: { symbol: string; rate: number };
  meta: (p: ShopperProduct) => string;
  onOpen: (p: ShopperProduct) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-3">
      <h2 className="text-[14px] font-bold leading-tight">{title}</h2>
      <p className="mb-1.5 text-[10px] text-muted-foreground">{subtitle}</p>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {items.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p)}
            className="tap relative w-[106px] shrink-0 text-left"
          >
            <span className="absolute left-1.5 top-0 z-10 text-[28px] font-extrabold leading-none text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.4)]">
              {i + 1}
            </span>
            <ProductImage src={p.imageUrl} alt={productTitle(p)} className="aspect-square w-full">
              <SaleTag product={p} />
            </ProductImage>
            <span className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-tight">
              {productTitle(p)}
            </span>
            <span className="block text-[12px] font-bold">
              {formatIdrShort(toIdr(p.price, money.rate))}
            </span>
            <span className="block text-[9px] text-muted-foreground">{meta(p)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-busy="true" aria-label="Memuat produk">
      <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 w-[106px] shrink-0 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-secondary" />
      ))}
    </div>
  );
}
