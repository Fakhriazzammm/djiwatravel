import { AdminShopperDiscovery } from "@/components/shopper/admin-shopper-discovery";
import { useEffect, useMemo, useState } from "react";
import { useLocation, createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { formatAdminDateTime } from "@/lib/admin-display";
import {
  adminShopperCatalog,
  getAdminShopping,
  refreshAdminShopperCatalog,
  runAdminShoppingAction,
  saveAdminShopperConfig,
} from "@/lib/personal-shopper.fn";
import {
  ADMIN_NEXT,
  ADMIN_NEXT_LABEL,
  ORDER_STATUS_LABEL,
  SHOPPER_BRANDS,
  SHOPPER_COUNTRIES,
  canAdminCancel,
  formatIdr,
  type ShopperConfig,
  type ShopperOrderStatus,
} from "@/lib/personal-shopper";

export const Route = createFileRoute("/admin/shopping")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminShopping(),
  component: AdminShopping,
});

type Tab = "orders" | "catalog" | "settings" | "requests";
type Data = Awaited<ReturnType<typeof getAdminShopping>>;
type Order = Data["orders"][number];

const input =
  "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-red";
const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50";

const tone = (s: ShopperOrderStatus) =>
  s === "PAID"
    ? "warn"
    : s === "CANCELLED" || s === "EXPIRED"
      ? "neutral"
      : s === "DELIVERED"
        ? "good"
        : "neutral";

function AdminShopping() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>("orders");
  useEffect(() => {
    setTab(
      location.hash === "requests"
        ? "requests"
        : location.hash === "catalog"
          ? "catalog"
          : location.hash === "settings"
            ? "settings"
            : "orders",
    );
  }, [location.hash]);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const refresh = () => router.invalidate();
  const toPay = data.counts["PAID"] ?? 0;

  return (
    <AdminShell
      title="Titip Belanja"
      subtitle="Pesanan belanja dari toko luar negeri: beli, kirim, dan atur harga serta katalog."
    >
      <div className="space-y-3">
        {!data.paymentReady && (
          <div
            role="status"
            className="flex gap-2 rounded-xl border border-[#f1d9a8] bg-[#fffaf0] p-3 text-xs text-[#78520b]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              <code>MAYAR_API_KEY</code> belum terpasang di runtime Travel, jadi pelanggan belum
              bisa membayar dan fitur tidak tampil di aplikasi.
            </p>
          </div>
        )}
        <div className="flex gap-1 rounded-xl bg-secondary p-1" role="tablist">
          {(
            [
              ["orders", `Pesanan${toPay ? ` (${toPay} perlu dibeli)` : ""}`],
              ["catalog", "Katalog"],
              ["requests", "Permintaan"],
              ["settings", "Pengaturan"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-10 flex-1 rounded-lg text-xs font-semibold ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={`rounded-xl p-3 text-sm ${notice.error ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
          >
            {notice.text}
          </p>
        )}
        {tab === "requests" && <AdminShopperDiscovery />}
        {tab === "orders" && <Orders data={data} setNotice={setNotice} refresh={refresh} />}
        {tab === "catalog" && <Catalog data={data} setNotice={setNotice} refresh={refresh} />}
        {tab === "settings" && <Settings data={data} setNotice={setNotice} refresh={refresh} />}
      </div>
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ orders */

function Orders({
  data,
  setNotice,
  refresh,
}: {
  data: Data;
  setNotice: (n: { error: boolean; text: string } | null) => void;
  refresh: () => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<"ALL" | ShopperOrderStatus>("ALL");
  const rows = useMemo(
    () => data.orders.filter((o) => filter === "ALL" || o.status === filter),
    [data.orders, filter],
  );
  return (
    <AdminSurface className="p-3">
      <SectionHeading
        title="Pesanan"
        detail="Yang sudah dibayar dan menunggu dibeli ada paling atas."
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["ALL", ...Object.keys(ORDER_STATUS_LABEL)] as ("ALL" | ShopperOrderStatus)[]).map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`min-h-8 rounded-full px-3 text-xs font-semibold ${filter === s ? "bg-brand-red text-white" : "bg-secondary"}`}
            >
              {s === "ALL" ? "Semua" : ORDER_STATUS_LABEL[s]}
              {s !== "ALL" && data.counts[s] ? ` · ${data.counts[s]}` : ""}
            </button>
          ),
        )}
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada pesanan.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((o) => (
            <OrderCard key={o.id} order={o} setNotice={setNotice} refresh={refresh} />
          ))}
        </div>
      )}
    </AdminSurface>
  );
}

type OrderLine = {
  name: string;
  size: string;
  color: string | null;
  quantity: number;
  unit_minor: number;
  unit_idr: number;
  product_url: string;
  product_code: string;
  brand: string;
  variant: string | null;
  market_item_id: string | null;
};

function OrderCard({
  order,
  setNotice,
  refresh,
}: {
  order: Order;
  setNotice: (n: { error: boolean; text: string } | null) => void;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [courier, setCourier] = useState(order.courier ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [note, setNote] = useState(order.adminNote ?? "");
  const next = ADMIN_NEXT[order.status];
  const items = order.items as OrderLine[];

  async function act(
    action: "advance" | "cancel" | "note" | "check_payment" | "resend_finance" | "recheck_market",
    extra: { note?: string } = {},
  ) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await runAdminShoppingAction({
        data: {
          orderId: order.id,
          action,
          ...extra,
          ...(action === "advance" && next === "SHIPPED"
            ? { courier: courier.trim(), trackingNumber: tracking.trim() }
            : {}),
        },
      });
      if (action === "recheck_market" && "market" in result) {
        const checks = result.market as {
          name: string;
          status: "OK" | "SOLD" | "PRICE_CHANGED" | "ERROR";
          priceJpy: number | null;
          orderedJpy: number;
        }[];
        const label = {
          OK: "masih tersedia",
          SOLD: "SUDAH TERJUAL",
          PRICE_CHANGED: "HARGA BERUBAH",
          ERROR: "gagal dibaca",
        } as const;
        setNotice({
          error: checks.some((m) => m.status !== "OK"),
          text: `${order.code}: ${checks
            .map(
              (m) =>
                `${m.name.slice(0, 40)} ${label[m.status]}${m.status === "PRICE_CHANGED" ? ` (¥${m.orderedJpy} → ¥${m.priceJpy})` : ""}`,
            )
            .join("; ")}`,
        });
      } else setNotice({ error: false, text: `${order.code}: tindakan berhasil.` });
      await refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Tindakan gagal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl bg-secondary p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-brand-red">{order.code}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatAdminDateTime(order.createdAt)} · kurs {order.currency} {order.rate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order.refundNeeded && <StatusPill tone="danger">Perlu refund</StatusPill>}
          <StatusPill tone={tone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</StatusPill>
        </div>
      </div>

      <ul className="mt-2 space-y-1.5">
        {items.map((l, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-2 rounded-lg bg-background p-2 text-xs"
          >
            <span className="min-w-0">
              <span className="block font-semibold">{l.name}</span>
              <span className="text-muted-foreground">
                {l.brand} · {l.product_code} ·{" "}
                {l.market_item_id
                  ? `pilihan: ${l.variant ?? "-"}`
                  : l.size === "-"
                    ? "tanpa ukuran"
                    : `ukuran ${l.size}`}
                {l.color ? ` · ${l.color}` : ""} · {l.quantity} × ¥
                {l.unit_minor.toLocaleString("id-ID")}
              </span>
            </span>
            <a
              href={l.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-red"
            >
              Buka toko <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Total / barang / domestik Jepang / jasa / ongkir</p>
          <p className="font-semibold">
            {formatIdr(order.totalIdr)}{" "}
            <span className="font-normal text-muted-foreground">
              ({formatIdr(order.subtotalIdr)} / {formatIdr(order.domesticIdr)} /{" "}
              {formatIdr(order.feeIdr)} / {formatIdr(order.shippingIdr)})
            </span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Kirim ke</p>
          <p className="font-semibold">
            {order.recipientName} · {order.whatsapp}
          </p>
          <p className="text-muted-foreground">
            {order.addressLine}, {order.city} {order.postalCode}
          </p>
        </div>
      </div>
      {order.note && <p className="mt-1 text-xs">Catatan pelanggan: {order.note}</p>}
      {order.financeError && order.status !== "PAYMENT_PENDING" && (
        <p className="mt-1 rounded-lg bg-[#fffaf0] p-2 text-[11px] text-[#78520b]">
          Belum terposting ke Finance ({order.financeError}).
        </p>
      )}

      {order.events.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {(
            order.events as {
              status: ShopperOrderStatus;
              at: string;
              actor: string;
              note: string | null;
            }[]
          )
            .map(
              (e) =>
                `${ORDER_STATUS_LABEL[e.status] ?? e.status} ${formatAdminDateTime(e.at)}${e.note ? ` (${e.note})` : ""}`,
            )
            .join(" → ")}
        </p>
      )}

      {order.status === "PURCHASED" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className={input}
            placeholder="Kurir (opsional)"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
          />
          <input
            className={input}
            placeholder="Nomor resi (wajib untuk kirim)"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {next && (
          <button
            type="button"
            disabled={busy || (next === "SHIPPED" && !tracking.trim())}
            onClick={() => void act("advance")}
            className={btnPrimary}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {ADMIN_NEXT_LABEL[order.status]}
          </button>
        )}
        {items.some((l) => l.market_item_id) &&
          order.status !== "CANCELLED" &&
          order.status !== "EXPIRED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("recheck_market")}
              className={btn}
            >
              <RefreshCw className="size-4" /> Cek ulang harga &amp; stok
            </button>
          )}
        {order.status === "PAYMENT_PENDING" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("check_payment")}
            className={btn}
          >
            <RefreshCw className="size-4" /> Cek pembayaran
          </button>
        )}
        {order.financeError && order.status !== "PAYMENT_PENDING" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("resend_finance")}
            className={btn}
          >
            Kirim ulang ke Finance
          </button>
        )}
        {canAdminCancel(order.status) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("Alasan pembatalan (dikirim ke pelanggan):");
              if (reason && reason.trim().length >= 3) void act("cancel", { note: reason.trim() });
            }}
            className={`${btn} text-destructive`}
          >
            Batalkan
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={input}
          placeholder="Catatan internal"
          value={note}
          maxLength={800}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || note === (order.adminNote ?? "")}
          onClick={() => void act("note", { note })}
          className={btn}
        >
          Simpan
        </button>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- catalog */

function Catalog({
  data,
  setNotice,
  refresh,
}: {
  data: Data;
  setNotice: (n: { error: boolean; text: string } | null) => void;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Awaited<ReturnType<typeof adminShopperCatalog>>>([]);

  async function runRefresh() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await refreshAdminShopperCatalog();
      const summary = r.results
        .map((x) => `${x.brand}: ${x.saved} produk${x.error ? ` (${x.error})` : ""}`)
        .join(", ");
      setNotice({
        error: false,
        text: `Katalog diperbarui. ${summary || "Tidak ada brand aktif."} Nama diterjemahkan: ${r.translated}.`,
      });
      await refresh();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Pembaruan katalog gagal.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function search(hide?: { id: string; hidden: boolean }) {
    setFound(await adminShopperCatalog({ data: { query, ...(hide ?? {}) } }));
    if (hide) await refresh();
  }

  return (
    <div className="space-y-3">
      <AdminSurface className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading
            title="Sumber katalog"
            detail="Dibaca dari situs resmi toko dan disimpan di cache. Brand tanpa adapter tampil Segera."
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void runRefresh()}
            className={btnPrimary}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Segarkan katalog
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SHOPPER_BRANDS.filter((b) => b.adapter).map((b) => {
            const row = data.catalog.find((c) => c.brand === b.id);
            return (
              <div key={b.id} className="rounded-xl bg-secondary p-3 text-xs">
                <p className="font-semibold">{b.name}</p>
                <p className="mt-1 text-muted-foreground">
                  {row
                    ? `${row.items} produk${row.hidden ? ` · ${row.hidden} disembunyikan` : ""}`
                    : "Belum ada data"}
                  {row?.lastFetch ? ` · terakhir ${formatAdminDateTime(row.lastFetch)}` : ""}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Terjemahan nama:{" "}
          {data.aiReady
            ? "aktif (HELIPOD_AI_KEY terpasang)"
            : "mati, nama produk tampil dalam bahasa Jepang"}
          .
        </p>
        {data.runs.length > 0 && (
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {data.runs.map((r, i) => (
              <li key={i}>
                {formatAdminDateTime(r.at)} · {r.brand} · {r.trigger} · {r.saved}/{r.seen} produk
                {r.error ? <span className="text-destructive"> · {r.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSurface>
      <AdminSurface className="p-3">
        <SectionHeading
          title="Sembunyikan produk"
          detail="Produk yang disembunyikan tidak tampil dan tidak bisa dipesan."
        />
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            className={input}
            placeholder="Cari nama atau kode produk"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className={btn}>
            Cari
          </button>
        </form>
        <ul className="mt-2 space-y-1.5">
          {found.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-2 text-xs"
            >
              <span className="min-w-0 truncate">
                {p.brand} · {p.code} · {p.name}
              </span>
              <button
                type="button"
                className={btn}
                onClick={() => void search({ id: p.id, hidden: !p.hidden })}
              >
                {p.hidden ? "Tampilkan" : "Sembunyikan"}
              </button>
            </li>
          ))}
        </ul>
      </AdminSurface>
    </div>
  );
}

/* ---------------------------------------------------------------- settings */

function Settings({
  data,
  setNotice,
  refresh,
}: {
  data: Data;
  setNotice: (n: { error: boolean; text: string } | null) => void;
  refresh: () => Promise<unknown>;
}) {
  const [config, setConfig] = useState<ShopperConfig>(data.config);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ShopperConfig>(key: K, value: ShopperConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const num = (
    key:
      | "feePercent"
      | "shippingIdr"
      | "paymentWindowMinutes"
      | "maxQtyPerItem"
      | "maxLinesPerOrder"
      | "catalogRefreshHours",
  ) => (
    <input
      type="number"
      className={input}
      value={config[key]}
      onChange={(e) => set(key, Number(e.target.value) as never)}
    />
  );

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAdminShopperConfig({
        data: { config, expectedVersion: data.version, reason },
      });
      if (!result.ok)
        setNotice({
          error: true,
          text: "Pengaturan sudah diubah orang lain. Muat ulang lalu coba lagi.",
        });
      else {
        setNotice({
          error: false,
          text: "Pengaturan Titip Belanja disimpan dan tercatat di audit log.",
        });
        setReason("");
      }
      await refresh();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Pengaturan gagal disimpan.",
      });
    } finally {
      setBusy(false);
    }
  }

  const flag = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-secondary px-3 text-sm font-medium">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-[var(--brand-red)]"
      />
    </label>
  );

  return (
    <AdminSurface className="space-y-3 p-3">
      <SectionHeading
        title="Pengaturan"
        detail="Perubahan langsung terlihat di aplikasi pelanggan dalam sekitar satu menit."
      />
      {flag("Titip Belanja aktif (tampil di Beranda)", config.enabled, (v) => set("enabled", v))}
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Negara</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHOPPER_COUNTRIES.map((c) =>
            flag(c.name, config.countries[c.code], (v) =>
              set("countries", { ...config.countries, [c.code]: v }),
            ),
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Brand (hanya yang punya adapter katalog bisa aktif)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHOPPER_BRANDS.map((b) => (
            <label
              key={b.id}
              className={`flex min-h-10 items-center justify-between gap-3 rounded-xl bg-secondary px-3 text-sm font-medium ${b.adapter ? "" : "opacity-50"}`}
            >
              {b.name}
              {b.adapter ? (
                ""
              ) : (
                <span className="text-[10px] text-muted-foreground">belum ada adapter</span>
              )}
              <input
                type="checkbox"
                disabled={!b.adapter}
                checked={config.brands[b.id]}
                onChange={(e) => set("brands", { ...config.brands, [b.id]: e.target.checked })}
                className="size-5 accent-[var(--brand-red)]"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">
          Jasa titip (%)<div className="mt-1">{num("feePercent")}</div>
        </label>
        <label className="text-xs font-semibold">
          Ongkir per pesanan (Rp)<div className="mt-1">{num("shippingIdr")}</div>
        </label>
        {SHOPPER_COUNTRIES.map((c) => (
          <label key={c.code} className="text-xs font-semibold">
            Kurs {c.currency} → Rp
            <input
              type="number"
              step="any"
              className={`${input} mt-1`}
              value={config.rates[c.currency] ?? 0}
              onChange={(e) =>
                set("rates", { ...config.rates, [c.currency]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <label className="text-xs font-semibold">
          Batas bayar (menit)<div className="mt-1">{num("paymentWindowMinutes")}</div>
        </label>
        <label className="text-xs font-semibold">
          Maks. jumlah per barang<div className="mt-1">{num("maxQtyPerItem")}</div>
        </label>
        <label className="text-xs font-semibold">
          Maks. barang berbeda per pesanan<div className="mt-1">{num("maxLinesPerOrder")}</div>
        </label>
        <label className="text-xs font-semibold">
          Segarkan katalog tiap (jam)<div className="mt-1">{num("catalogRefreshHours")}</div>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {flag("Tampilkan rail Trending", config.showTrending, (v) => set("showTrending", v))}
        {flag("Tampilkan rail Terlaris", config.showBestSellers, (v) => set("showBestSellers", v))}
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Mercari dan Rakuten (tempel link, harga dibaca dari halaman)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {flag("Aktifkan link marketplace", config.market.enabled, (v) =>
            set("market", { ...config.market, enabled: v }),
          )}
          {flag("Mercari", config.market.sites.mercari, (v) =>
            set("market", { ...config.market, sites: { ...config.market.sites, mercari: v } }),
          )}
          {flag("Rakuten", config.market.sites.rakuten, (v) =>
            set("market", { ...config.market, sites: { ...config.market.sites, rakuten: v } }),
          )}
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold">
            Ongkir dalam Jepang per barang (Rp)
            <input
              type="number"
              className={`${input} mt-1`}
              value={config.market.domesticIdr}
              onChange={(e) =>
                set("market", { ...config.market, domesticIdr: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs font-semibold">
            Baca link per pelanggan / hari
            <input
              type="number"
              className={`${input} mt-1`}
              value={config.market.lookupsPerDay}
              onChange={(e) =>
                set("market", { ...config.market, lookupsPerDay: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-xs font-semibold">
            Simpan hasil baca (menit)
            <input
              type="number"
              className={`${input} mt-1`}
              value={config.market.cacheMinutes}
              onChange={(e) =>
                set("market", { ...config.market, cacheMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </div>
      <input
        className={input}
        placeholder="Alasan perubahan (wajib, masuk audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        onClick={() => void save()}
        className={btnPrimary}
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        Simpan pengaturan
      </button>
    </AdminSurface>
  );
}
