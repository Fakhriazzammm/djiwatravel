import { FeeExplainer } from "./shopper-about";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { getBetterAuthSession } from "@/lib/better-auth-client";
import { createShoppingOrder, getLastShoppingAddress } from "@/lib/personal-shopper.fn";
import {
  SHOPPER_BRANDS,
  SHOPPER_CATEGORIES,
  SHOPPER_COUNTRIES,
  SHOPPER_SORTS,
  brandById,
  brandEnabled,
  formatIdr,
  formatMinor,
  productTitle,
  soldLabel,
  toIdr,
  validateShopperAddress,
  type ShopperAddress,
  type ShopperConfig,
  type ShopperCountryCode,
  type ShopperFilters,
  type ShopperProduct,
} from "@/lib/personal-shopper";
import { marketBlocker, type MarketItemView } from "@/lib/shopper-market";
import { cartActions, cartCount, cartQuote, type CartLine } from "./shopper-cart";
import { Chip, ProductImage, ShopperSheet, Stepper } from "./shopper-ui";

type Money = { symbol: string; rate: number; currency: string };

const primaryBtn =
  "tap ios-btn w-full bg-brand-red text-white disabled:opacity-50 transition-transform active:scale-[0.98]";
const softBtn = "tap ios-btn w-full bg-secondary text-foreground";
const sectionLabel =
  "mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/* ----------------------------------------------------------------- product */

export function ProductSheet({
  product,
  money,
  config,
  onClose,
  onAdded,
}: {
  product: ShopperProduct | null;
  money: Money;
  config: ShopperConfig;
  onClose: () => void;
  onAdded: (origin: HTMLElement | null) => void;
}) {
  const [size, setSize] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!product) return;
    setSize(product.sizes.includes("M") ? "M" : (product.sizes[0] ?? ""));
    setColor(product.colors.length > 1 ? (product.colors[0]?.code ?? null) : null);
    setQty(1);
  }, [product]);

  if (!product)
    return (
      <ShopperSheet open={false} onOpenChange={onClose} title="Produk">
        {null}
      </ShopperSheet>
    );
  const shownColor = product.colors.find((c) => c.code === color);
  const image = shownColor?.image ?? product.imageUrl;
  const total = toIdr(product.price, money.rate) * qty;
  const canAdd = product.sizes.length === 0 || size !== "";

  return (
    <ShopperSheet open onOpenChange={(o) => !o && onClose()} title={productTitle(product)}>
      <div className="flex gap-3">
        <ProductImage src={image} alt={productTitle(product)} className="size-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">
            {brandById(product.brand)?.name} · {product.category}
          </p>
          <p className="mt-0.5 text-[16px] font-bold">
            {formatMinor(product.price, money.symbol)}
            {product.originalPrice ? (
              <s className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {formatMinor(product.originalPrice, money.symbol)}
              </s>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            ≈ {formatIdr(toIdr(product.price, money.rate))} (kurs {money.symbol}1 = Rp{" "}
            {money.rate.toLocaleString("id-ID")})
            {product.rating ? ` · Rating ${product.rating.toFixed(1).replace(".", ",")}` : ""} ·{" "}
            {soldLabel(product)}
          </p>
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red"
          >
            Lihat di {brandById(product.brand)?.name}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {product.sizes.length > 0 && (
        <>
          <p className={sectionLabel}>Ukuran</p>
          <div className="flex flex-wrap gap-1.5">
            {product.sizes.map((s) => (
              <Chip key={s} on={size === s} onClick={() => setSize(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </>
      )}
      {product.colors.length > 1 && (
        <>
          <p className={sectionLabel}>Warna</p>
          <div className="flex flex-wrap gap-1.5">
            {product.colors.map((c) => (
              <Chip key={c.code} on={color === c.code} onClick={() => setColor(c.code)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </>
      )}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold">Jumlah</p>
        <Stepper value={qty} onChange={setQty} max={config.maxQtyPerItem} />
      </div>
      <button
        type="button"
        disabled={!canAdd}
        className={`${primaryBtn} mt-3`}
        onClick={(event) => {
          cartActions.add(
            {
              productId: product.id,
              // Bags have no sizes; the order line still needs a value, shown as nothing.
              size: size || "-",
              color,
              quantity: qty,
              name: productTitle(product),
              brand: product.brand,
              image,
              unitMinor: product.price,
            },
            config.maxQtyPerItem,
          );
          onAdded(event.currentTarget);
          onClose();
        }}
      >
        Tambah · {formatIdr(total)}
      </button>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Harga toko dan stok dicek saat barang dibeli. Jasa dan ongkir dihitung di keranjang.
      </p>
    </ShopperSheet>
  );
}

/* ------------------------------------------------------------------ filter */

export function FilterSheet({
  open,
  onOpenChange,
  filters,
  setFilters,
  country,
  onCountry,
  config,
  money,
  maxCatalogPrice,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ShopperFilters;
  setFilters: (next: ShopperFilters) => void;
  country: ShopperCountryCode;
  onCountry: (code: ShopperCountryCode) => void;
  config: ShopperConfig;
  money: Money;
  maxCatalogPrice: number;
  resultCount: number;
}) {
  const top = Math.max(1000, Math.ceil(maxCatalogPrice / 500) * 500);
  const value = filters.maxPrice ?? top;
  return (
    <ShopperSheet open={open} onOpenChange={onOpenChange} title="Filter">
      <p className={sectionLabel}>Negara</p>
      <div className="flex flex-wrap gap-1.5">
        {SHOPPER_COUNTRIES.map((c) => (
          <Chip
            key={c.code}
            on={country === c.code}
            soon={!config.countries[c.code] || !config.enabled}
            onClick={() => onCountry(c.code)}
          >
            {c.short}
          </Chip>
        ))}
      </div>
      <p className={sectionLabel}>Brand</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={filters.brand === "all"} onClick={() => setFilters({ ...filters, brand: "all" })}>
          Semua
        </Chip>
        {SHOPPER_BRANDS.filter((b) => b.country === country).map((b) => (
          <Chip
            key={b.id}
            on={filters.brand === b.id}
            soon={!brandEnabled(config, b.id)}
            onClick={() =>
              brandEnabled(config, b.id)
                ? setFilters({ ...filters, brand: b.id })
                : toast(`${b.name} segera hadir`)
            }
          >
            {b.name}
          </Chip>
        ))}
      </div>
      <p className={sectionLabel}>Kategori</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip
          on={filters.category === "all"}
          onClick={() => setFilters({ ...filters, category: "all" })}
        >
          Semua
        </Chip>
        {SHOPPER_CATEGORIES.map((c) => (
          <Chip
            key={c}
            on={filters.category === c}
            onClick={() => setFilters({ ...filters, category: c })}
          >
            {c}
          </Chip>
        ))}
      </div>
      <div className="mb-1.5 mt-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Harga maks.
        </p>
        <span className="text-[11px] text-muted-foreground">
          {filters.maxPrice === null ? "Semua" : `≤ ${formatMinor(filters.maxPrice, money.symbol)}`}
        </span>
      </div>
      <input
        type="range"
        min={500}
        max={top}
        step={500}
        value={value}
        aria-label="Harga maksimum"
        onChange={(e) => {
          const next = Number(e.target.value);
          setFilters({ ...filters, maxPrice: next >= top ? null : next });
        }}
        className="w-full accent-[var(--brand-red)]"
      />
      <label className="mt-3 flex min-h-10 items-center justify-between text-[13px] font-semibold">
        Hanya diskon
        <input
          type="checkbox"
          checked={filters.onlySale}
          onChange={(e) => setFilters({ ...filters, onlySale: e.target.checked })}
          className="size-5 accent-[var(--brand-red)]"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={softBtn}
          onClick={() =>
            setFilters({
              ...filters,
              brand: "all",
              category: "all",
              maxPrice: null,
              onlySale: false,
            })
          }
        >
          Reset
        </button>
        <button type="button" className={primaryBtn} onClick={() => onOpenChange(false)}>
          Tampilkan {resultCount} hasil
        </button>
      </div>
    </ShopperSheet>
  );
}

export function SortSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ShopperFilters["sort"];
  onChange: (sort: ShopperFilters["sort"]) => void;
}) {
  return (
    <ShopperSheet open={open} onOpenChange={onOpenChange} title="Urutkan">
      <div className="ios-group divide-y divide-border/70">
        {SHOPPER_SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onChange(s.id);
              onOpenChange(false);
            }}
            className="tap ios-row w-full justify-between text-left text-[14px] font-medium"
          >
            {s.label}
            <span
              className={`size-4 rounded-full border-2 ${
                value === s.id ? "border-[5px] border-brand-red" : "border-border"
              }`}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </ShopperSheet>
  );
}

/* ------------------------------------------------------------------ marketplace */

const SITE_NAME = { mercari: "Mercari", rakuten: "Rakuten" } as const;

/** A Mercari or Rakuten item priced from its own page: confirm the choice, then add to the cart. */
export function MarketSheet({
  item,
  money,
  config,
  onClose,
  onAdded,
}: {
  item: MarketItemView | null;
  money: Money;
  config: ShopperConfig;
  onClose: () => void;
  onAdded: (origin: HTMLElement | null) => void;
}) {
  const [variant, setVariant] = useState("");
  const [qty, setQty] = useState(1);
  useEffect(() => {
    setVariant("");
    setQty(1);
  }, [item]);
  if (!item)
    return (
      <ShopperSheet open={false} onOpenChange={onClose} title="Barang">
        {null}
      </ShopperSheet>
    );
  const blocker = marketBlocker(item);
  const unitIdr = toIdr(item.priceJpy, money.rate);
  const needsVariant = item.needsVariant && variant.trim().length < 1;
  return (
    <ShopperSheet open onOpenChange={(o) => !o && onClose()} title={item.name}>
      <div className="flex gap-3">
        <ProductImage src={item.imageUrl} alt={item.name} className="size-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">
            {SITE_NAME[item.site]}
            {item.conditionText ? ` · ${item.conditionText}` : ""}
          </p>
          <p className="mt-0.5 text-[16px] font-bold">{formatMinor(item.priceJpy, money.symbol)}</p>
          <p className="text-[11px] text-muted-foreground">
            ≈ {formatIdr(unitIdr)} (kurs {money.symbol}1 = Rp {money.rate.toLocaleString("id-ID")})
          </p>
          {item.sizeText && <p className="text-[11px]">Ukuran: {item.sizeText}</p>}
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red"
          >
            Lihat di {SITE_NAME[item.site]}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>
      {blocker ? (
        <p role="alert" className="mt-3 rounded-xl bg-secondary p-3 text-[12px] text-brand-red">
          {blocker}
        </p>
      ) : (
        <>
          {item.needsVariant && (
            <label className="mt-3 block text-[12px]">
              <span className="mb-0.5 block font-medium text-muted-foreground">
                Ukuran / warna yang dipilih (wajib)
              </span>
              <input
                className="min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red"
                value={variant}
                maxLength={200}
                placeholder="Contoh: M, hitam"
                onChange={(e) => setVariant(e.target.value)}
              />
            </label>
          )}
          {item.maxQuantity > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">Jumlah</p>
              <Stepper value={qty} onChange={setQty} max={item.maxQuantity} />
            </div>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground">
            {item.site === "mercari"
              ? "Barang bekas dari penjual perorangan, hanya 1 buah. Stok dicek lagi saat kamu membayar dan saat dibeli; bila sudah terjual, dana dikembalikan."
              : "Stok dan harga dicek lagi saat kamu membayar dan saat dibeli; bila berubah atau habis, dana dikembalikan."}{" "}
            Ongkir kirim dalam Jepang dihitung di keranjang.
          </p>
          <button
            type="button"
            disabled={needsVariant}
            className={`${primaryBtn} mt-3`}
            onClick={(event) => {
              cartActions.add(
                {
                  productId: item.id,
                  marketItemId: item.id,
                  size: "-",
                  color: null,
                  variant: item.needsVariant ? variant.trim() : item.sizeText,
                  quantity: qty,
                  name: item.name,
                  brand: item.site,
                  image: item.imageUrl,
                  unitMinor: item.priceJpy,
                  sourceUrl: item.sourceUrl,
                },
                item.maxQuantity,
              );
              onAdded(event.currentTarget);
              onClose();
            }}
          >
            Tambah · {formatIdr(unitIdr * qty)}
          </button>
        </>
      )}
    </ShopperSheet>
  );
}

/* -------------------------------------------------------------------- cart */

const EMPTY_ADDRESS: ShopperAddress = {
  recipientName: "",
  whatsapp: "62",
  addressLine: "",
  city: "",
  postalCode: "",
};

const field =
  "min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15";

export function CartSheet({
  open,
  onOpenChange,
  cart,
  country,
  money,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: readonly CartLine[];
  country: ShopperCountryCode;
  money: Money;
  config: ShopperConfig;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"review" | "address">("review");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [address, setAddress] = useState<ShopperAddress>(EMPTY_ADDRESS);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const quote = useMemo(() => cartQuote(cart, money.rate, config), [cart, money.rate, config]);

  useEffect(() => {
    if (!open) return;
    setStep("review");
    setErrors({});
  }, [open]);

  useEffect(() => {
    if (!open || step !== "address") return;
    let live = true;
    getBetterAuthSession()
      .then(async (session) => {
        if (!live) return;
        setSignedIn(Boolean(session?.user));
        if (session?.user) {
          const last = await getLastShoppingAddress().catch(() => null);
          if (live && last) setAddress(last);
        }
      })
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, [open, step]);

  useEffect(() => {
    if (open && cart.length === 0) onOpenChange(false);
  }, [open, cart.length, onOpenChange]);

  async function pay() {
    const found = validateShopperAddress(address);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const result = await createShoppingOrder({
        data: {
          country,
          items: cart.map((l) =>
            l.marketItemId
              ? {
                  marketItemId: l.marketItemId,
                  size: "-",
                  variant: l.variant ?? null,
                  quantity: l.quantity,
                  expectedUnitMinor: l.unitMinor,
                }
              : { productId: l.productId, size: l.size, color: l.color, quantity: l.quantity },
          ),
          address,
          note: note.trim() || null,
        },
      });
      cartActions.clear();
      onOpenChange(false);
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      toast.error(
        result.paymentError ?? "Pembayaran belum bisa dibuat. Coba bayar dari halaman pesanan.",
      );
      await navigate({ to: "/titip-belanja/pesanan/$id", params: { id: result.orderId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pesanan belum bisa dibuat.");
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof ShopperAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [key]: e.target.value }));

  return (
    <ShopperSheet
      open={open}
      onOpenChange={onOpenChange}
      title={step === "review" ? "Tinjau pesanan" : "Alamat pengiriman"}
      description={
        step === "review"
          ? `${cartCount(cart)} barang`
          : "Barang dikirim dari Jepang ke alamat ini."
      }
    >
      {step === "review" ? (
        <>
          <div className="divide-y divide-border/70">
            {cart.map((l) => (
              <div key={l.key} className="flex items-center gap-2.5 py-2">
                <ProductImage src={l.image} alt={l.name} className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[13px] font-semibold">{l.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.marketItemId
                      ? `${l.brand === "rakuten" ? "Rakuten" : "Mercari"}${l.variant ? ` · ${l.variant}` : ""}`
                      : `${brandById(l.brand)?.name}${l.size !== "-" ? ` · ${l.size}` : ""}${l.color ? ` · ${l.color}` : ""}`}{" "}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatMinor(l.unitMinor, money.symbol)} × kurs{" "}
                    {money.rate.toLocaleString("id-ID")} ={" "}
                    <span className="font-semibold text-foreground">
                      {formatIdr(toIdr(l.unitMinor, money.rate))}
                    </span>
                  </p>
                </div>
                <Stepper
                  value={l.quantity}
                  min={0}
                  max={l.marketItemId && l.brand === "mercari" ? 1 : config.maxQtyPerItem}
                  onChange={(next) =>
                    cartActions.change(
                      l.key,
                      next - l.quantity,
                      l.marketItemId && l.brand === "mercari" ? 1 : config.maxQtyPerItem,
                    )
                  }
                />
              </div>
            ))}
          </div>
          <dl className="mt-2 space-y-1 text-[12px]">
            <Row
              label="Harga toko"
              value={formatMinor(
                cart.reduce((n, l) => n + l.unitMinor * l.quantity, 0),
                money.symbol,
              )}
            />
            <Row
              label={`Kurs ${money.currency} (dikunci saat pesanan dibuat)`}
              value={`${money.symbol}1 = Rp ${money.rate.toLocaleString("id-ID")}`}
            />
            <Row label="Barang dalam Rupiah" value={formatIdr(quote.subtotalIdr)} />
            {quote.domesticIdr > 0 && (
              <Row label="Kirim dalam Jepang (estimasi)" value={formatIdr(quote.domesticIdr)} />
            )}
            <Row label={`Jasa titip ${config.feePercent}%`} value={formatIdr(quote.feeIdr)} />
            <Row label="Ongkir ke Indonesia" value={formatIdr(quote.shippingIdr)} />
            <Row label="Total" value={formatIdr(quote.totalIdr)} strong />
          </dl>
          <FeeExplainer config={config} hasMarket={quote.domesticIdr > 0} />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Jasa titip dihitung dari harga barang dalam Rupiah. Harga toko dicek saat barang dibeli;
            bila berubah atau habis, tim kami menghubungimu dan dana dikembalikan.
          </p>
          <button type="button" className={`${primaryBtn} mt-3`} onClick={() => setStep("address")}>
            Lanjut ke alamat
          </button>
        </>
      ) : signedIn === false ? (
        <div className="py-2">
          <p className="mb-2 text-[13px] text-muted-foreground">
            Masuk dulu untuk membuat pesanan.
          </p>
          <CustomerAuth size="block" />
          <button type="button" className={`${softBtn} mt-2`} onClick={() => setStep("review")}>
            Kembali
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Field label="Nama penerima" error={errors["recipientName"]}>
              <input
                className={field}
                value={address.recipientName}
                onChange={set("recipientName")}
                autoComplete="name"
              />
            </Field>
            <Field label="WhatsApp (diawali 62)" error={errors["whatsapp"]}>
              <input
                className={field}
                inputMode="numeric"
                value={address.whatsapp}
                onChange={set("whatsapp")}
                autoComplete="tel"
              />
            </Field>
            <Field label="Alamat lengkap" error={errors["addressLine"]}>
              <input
                className={field}
                value={address.addressLine}
                onChange={set("addressLine")}
                autoComplete="street-address"
              />
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label="Kota" error={errors["city"]}>
                <input
                  className={field}
                  value={address.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="Kode pos" error={errors["postalCode"]}>
                <input
                  className={field}
                  inputMode="numeric"
                  value={address.postalCode}
                  onChange={set("postalCode")}
                  autoComplete="postal-code"
                />
              </Field>
            </div>
            <Field label="Catatan untuk penitip (opsional)">
              <input
                className={field}
                value={note}
                maxLength={400}
                placeholder="Contoh: warna lain jika habis"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={softBtn}
              onClick={() => setStep("review")}
              disabled={busy}
            >
              Kembali
            </button>
            <button
              type="button"
              className={primaryBtn}
              onClick={pay}
              disabled={busy || signedIn === null}
            >
              {busy ? "Membuat tagihan…" : `Bayar ${formatIdr(quote.totalIdr)}`}
            </button>
          </div>
        </>
      )}
    </ShopperSheet>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "pt-1 text-[14px] font-bold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="mt-0.5 block text-[11px] text-brand-red">{error}</span> : null}
    </label>
  );
}
