import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useLocation, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Printer } from "lucide-react";
import { ShippingOpsApp } from "@/components/shipping/ops/ops-app";
import type { OpsTab } from "@/components/shipping/ops/ops-nav";
import { StaffManager } from "@/components/shipping/staff-manager";
import { PhotoReviewBadge } from "@/components/shipping/shipping-photos";
import {
  AdminShell,
  AdminSurface,
  CountBadge,
  SectionHeading,
  StatusPill,
} from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";
import { requireAdmin } from "@/lib/admin-guard";
import { correctShippingStatus, getOpsMe, resolveShippingProblem } from "@/lib/shipping-ops.fn";
import {
  getAdminShipping,
  runAdminShippingAction,
  saveAdminShippingConfig,
} from "@/lib/shipping.fn";
import {
  SHIPPING_ADMIN_NEXT,
  SHIPPING_ADMIN_NEXT_LABEL,
  SHIPPING_STATUS_LABEL,
  adminCanBill,
  adminCanCancel,
  adminCanReject,
  buildLabelData,
  formatIdr,
  formatKg,
  quoteShipping,
  shippingIsPaid,
  shippingMarginIdr,
  type ShippingConfig,
  type ShippingStatus,
} from "@/lib/shipping";

export const Route = createFileRoute("/admin/shipping")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): { scan?: string } =>
    typeof search["scan"] === "string" && search["scan"].length <= 400
      ? { scan: search["scan"] }
      : {},
  loader: async () => ({ data: await getAdminShipping(), ops: await getOpsMe() }),
  component: AdminShipping,
});

type Data = Awaited<ReturnType<typeof getAdminShipping>>;
type Order = Data["orders"][number];
type Notice = { error: boolean; text: string } | null;

const input =
  "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-red";
const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50";

const tone = (s: ShippingStatus) =>
  s === "AWAITING_DROP" || s === "RECEIVED" || s === "PAID"
    ? "warn"
    : s === "REJECTED"
      ? "danger"
      : s === "DELIVERED" || s === "ARRIVED"
        ? "good"
        : "neutral";

/** Statuses where the team has a next move, shown first and counted on the tab. */
const NEEDS_ACTION: ShippingStatus[] = ["AWAITING_DROP", "RECEIVED", "PAID", "PROBLEM"];

/** The list filters, grouped the way the team thinks about the work instead of fifteen statuses. */
const GROUPS: { id: string; label: string; statuses: ShippingStatus[] | null }[] = [
  { id: "ALL", label: "Semua", statuses: null },
  { id: "ACTION", label: "Perlu tindakan", statuses: NEEDS_ACTION },
  { id: "PAY", label: "Menunggu bayar", statuses: ["PAYMENT_PENDING"] },
  {
    id: "ROUTE",
    label: "Di jalur",
    statuses: ["TO_BANDUNG", "AT_BANDUNG", "TO_JAKARTA", "AT_JAKARTA", "SHIPPED"],
  },
  { id: "DONE", label: "Selesai", statuses: ["ARRIVED", "DELIVERED"] },
  { id: "DEAD", label: "Batal", statuses: ["CANCELLED", "REJECTED", "EXPIRED"] },
];

function AdminShipping() {
  const { data, ops } = Route.useLoaderData();
  const router = useRouter();
  const location = useLocation();
  const { scan } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const refresh = () => router.invalidate();
  const todo = NEEDS_ACTION.reduce((n, s) => n + (data.counts[s] ?? 0), 0);
  // The links in the Admin menu land on the matching tab of the one Kirim Barang app.
  const requestedTab: OpsTab =
    location.hash === "settings"
      ? "settings"
      : location.hash === "staff"
        ? "staff"
        : location.hash === "scan" || scan
          ? "scan"
          : "orders";

  return (
    <AdminShell
      title="Kirim Barang"
      subtitle="Paket ke Jepang: terima di drop point, timbang dan tagih, kirim lewat Bandung dan Jakarta."
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
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={`sticky top-2 z-30 rounded-xl p-3 text-sm shadow-sm ${notice.error ? "bg-[#fff0ef] text-destructive" : "bg-background"}`}
          >
            {notice.text}
          </p>
        )}
        <ShippingOpsApp
          me={ops}
          initialCode={scan ?? null}
          onChanged={() => void refresh()}
          admin={{
            orders: (
              <Orders
                data={data}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setNotice={setNotice}
                refresh={refresh}
              />
            ),
            staff: <StaffManager />,
            settings: <Settings data={data} setNotice={setNotice} refresh={refresh} />,
            todo,
            requestedTab,
          }}
        />
      </div>
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ orders */

function Orders({
  data,
  selectedId,
  setSelectedId,
  setNotice,
  refresh,
}: {
  data: Data;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [group, setGroup] = useState("ALL");
  const [exact, setExact] = useState<"ALL" | ShippingStatus>("ALL");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const pickedOrders = data.orders.filter((o) => picked.has(o.id));
  const origin = typeof window === "undefined" ? "https://djiwatravel.com" : window.location.origin;

  async function printBatch(kind: "labels" | "manifest") {
    setPrinting(true);
    try {
      const print = await import("@/lib/shipping-print");
      if (kind === "labels")
        await print.downloadLabelsPdf(
          pickedOrders.map((o) => buildLabelData(o, data.config.dropPoint, origin)),
        );
      else
        await print.downloadManifestPdf(
          pickedOrders,
          data.config.dropPoint,
          pickedOrders.find((o) => o.courier)?.courier ?? data.config.couriers[0] ?? "Kurir",
        );
    } catch {
      setNotice({ error: true, text: "Dokumen belum bisa dibuat di perangkat ini. Coba lagi." });
    } finally {
      setPrinting(false);
    }
  }
  const countOf = (statuses: ShippingStatus[] | null) =>
    statuses === null
      ? data.orders.length
      : data.orders.filter((o) => statuses.includes(o.status)).length;
  const rows = useMemo(() => {
    const wanted = GROUPS.find((g) => g.id === group)?.statuses ?? null;
    const q = query.trim().toLowerCase();
    return data.orders.filter(
      (o) =>
        (exact === "ALL" ? wanted === null || wanted.includes(o.status) : o.status === exact) &&
        (q === "" ||
          o.code.toLowerCase().includes(q) ||
          o.recipientName.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q)),
    );
  }, [data.orders, group, exact, query]);
  const selected = data.orders.find((o) => o.id === selectedId) ?? rows[0] ?? null;
  // A parcel opened from the scan must not hide behind the current filter, and on a phone the
  // detail replaces the list (with a way back), so the team sees it without scrolling.
  useEffect(() => {
    if (selectedId && !rows.some((o) => o.id === selectedId)) {
      setGroup("ALL");
      setExact("ALL");
      setQuery("");
    }
    if (selectedId) window.scrollTo({ top: 0 });
  }, [selectedId, rows]);
  return (
    <AdminSurface className="p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Pengiriman <span className="font-normal text-muted-foreground">· {rows.length}</span>
        </h2>
        <button
          type="button"
          aria-pressed={selecting}
          onClick={() => {
            setSelecting((v) => !v);
            setPicked(new Set());
          }}
          className="tap min-h-9 rounded-lg px-3 text-xs font-semibold text-brand-red"
        >
          {selecting ? "Selesai memilih" : "Pilih untuk cetak"}
        </button>
      </div>
      <input
        type="search"
        className={`${input} mt-2`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari kode, nama, atau kota"
        aria-label="Cari pengiriman"
      />
      <div
        className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filter"
      >
        {GROUPS.map((g) => {
          const n = countOf(g.statuses);
          const on = group === g.id && exact === "ALL";
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setGroup(g.id);
                setExact("ALL");
              }}
              className={`tap min-h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold ${on ? "bg-brand-red text-white" : g.id === "ACTION" && n > 0 ? "bg-[#fff1d6] text-[#92400E]" : "bg-secondary"}`}
            >
              {g.label}
              {g.id !== "ALL" || n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <select
        className={`${input} mt-2 min-h-9 text-xs`}
        value={exact}
        onChange={(e) => setExact(e.target.value as "ALL" | ShippingStatus)}
        aria-label="Status tepat"
      >
        <option value="ALL">Semua status</option>
        {(Object.keys(SHIPPING_STATUS_LABEL) as ShippingStatus[]).map((st) => (
          <option key={st} value={st}>
            {SHIPPING_STATUS_LABEL[st]}
            {data.counts[st] ? ` (${data.counts[st]})` : ""}
          </option>
        ))}
      </select>
      {selecting && picked.size > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-secondary p-2 text-xs">
          <span className="font-semibold">{picked.size} paket dipilih</span>
          <button
            type="button"
            disabled={printing}
            className={btn}
            onClick={() => printBatch("labels")}
          >
            <Printer className="size-4" aria-hidden="true" />
            Cetak label (PDF)
          </button>
          <button
            type="button"
            disabled={printing}
            className={btn}
            onClick={() => printBatch("manifest")}
          >
            <Printer className="size-4" aria-hidden="true" />
            Manifest serah kurir (PDF)
          </button>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => setPicked(new Set())}
          >
            Kosongkan
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {data.orders.length === 0
            ? "Belum ada pengiriman."
            : "Tidak ada pengiriman yang cocok dengan filter ini."}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className={`space-y-2 ${selectedId ? "hidden lg:block" : ""}`}>
            {rows.map((o) => {
              const photoNote =
                (o.status === "AWAITING_DROP" || o.status === "RECEIVED") &&
                o.photoReview !== "APPROVED"
                  ? o.photoReview === "REDO"
                    ? "Menunggu foto ulang"
                    : o.proofPhotoIds.length < data.config.minPhotos
                      ? "Foto belum lengkap"
                      : "Foto belum ditinjau"
                  : null;
              return (
                <li key={o.id} className="flex items-stretch gap-2">
                  {selecting && (
                    <label className="flex w-8 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${o.code}`}
                        checked={picked.has(o.id)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(o.id);
                          else next.delete(o.id);
                          setPicked(next);
                        }}
                        className="size-5 accent-[var(--brand-red)]"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    aria-current={selected?.id === o.id}
                    className={`tap min-w-0 flex-1 rounded-2xl p-3 text-left ${selected?.id === o.id ? "bg-brand-red-soft" : "bg-secondary"}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-brand-red">{o.code}</span>
                      <StatusPill tone={tone(o.status)}>
                        {SHIPPING_STATUS_LABEL[o.status]}
                      </StatusPill>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] font-medium">
                      {o.recipientName}, {o.prefecture}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatKg(o.billedKg ?? o.estimatedKg)}
                      {o.totalIdr !== null ? ` · ${formatIdr(o.totalIdr)}` : ""}
                      {` · ${o.category}`}
                    </span>
                    {photoNote && (
                      <span className="mt-1 block text-[11px] font-semibold text-[#9a6100]">
                        {photoNote}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && (
            <div className={selectedId ? "" : "hidden lg:block"}>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="tap mb-2 inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-red lg:hidden"
              >
                ‹ Semua pengiriman
              </button>
              <OrderDetail
                key={selected.id}
                order={selected}
                config={data.config}
                setNotice={setNotice}
                refresh={refresh}
              />
            </div>
          )}
        </div>
      )}
    </AdminSurface>
  );
}

function OrderDetail({
  order,
  config,
  setNotice,
  refresh,
}: {
  order: Order;
  config: ShippingConfig;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [weighed, setWeighed] = useState(order.weighedKg ? String(order.weighedKg) : "");
  const [packing, setPacking] = useState(String(order.packingIdr || 0));
  const [weighNote, setWeighNote] = useState(order.weighNote ?? "");
  const [fixTo, setFixTo] = useState<string>("");
  const [fixNote, setFixNote] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(order.adminNote ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const weighRef = useRef<HTMLDivElement>(null);
  const [redoNote, setRedoNote] = useState("");
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState("");
  const status = order.status as ShippingStatus;
  const next = SHIPPING_ADMIN_NEXT[status];

  const weighedNumber = Number(weighed.replace(",", "."));
  const packingNumber = Number(packing.replace(/\D/g, "")) || 0;
  // The booking froze its own minimum and rounding, so the preview uses those, not today's settings.
  const previewQuote =
    Number.isFinite(weighedNumber) && weighedNumber > 0
      ? quoteShipping({
          weighedKg: weighedNumber,
          rateIdrPerKg: order.rateIdrPerKg,
          minKg: order.minKg,
          roundKg: order.roundKg,
          packingIdr: packingNumber,
        })
      : null;
  const margin = shippingMarginIdr({
    totalIdr: previewQuote?.totalIdr ?? order.totalIdr,
    billedKg: previewQuote?.billedKg ?? order.billedKg,
    partnerIdrPerKg: order.partnerIdrPerKg,
  });

  async function act(
    action:
      | "advance"
      | "bill"
      | "reject"
      | "cancel"
      | "note"
      | "check_payment"
      | "resend_finance"
      | "delete_photo"
      | "photo_approve"
      | "photo_redo"
      | "undo_receive",
    extra: Record<string, unknown> = {},
    success = "Tindakan berhasil.",
  ) {
    setBusy(true);
    setNotice(null);
    try {
      await runAdminShippingAction({ data: { orderId: order.id, action, ...extra } });
      setNotice({ error: false, text: `${order.code}: ${success}` });
      await refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Tindakan gagal." });
    } finally {
      setBusy(false);
    }
  }

  async function printOne(kind: "label" | "receipt" | "weigh") {
    setPrintBusy(true);
    setPrintError("");
    try {
      const print = await import("@/lib/shipping-print");
      if (kind === "label")
        await print.downloadLabelsPdf([
          buildLabelData(order, config.dropPoint, window.location.origin),
        ]);
      else if (kind === "receipt") await print.downloadDropReceiptPdf(order, config.dropPoint);
      else
        await print.downloadWeighSheetPdf(
          order,
          order.proofPhotoIds.map((id) => `/api/shipping-photo/${id}?admin=1`),
        );
    } catch {
      setPrintError("Dokumen belum bisa dibuat di perangkat ini. Coba lagi.");
    } finally {
      setPrintBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("orderId", order.id);
      form.set("as", "admin");
      form.set("photo", file);
      const response = await fetch("/api/shipping-photo", { method: "POST", body: form });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Foto belum terunggah");
      setNotice({ error: false, text: `${order.code}: foto diunggah.` });
      await refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Foto gagal." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const card = "rounded-xl bg-background p-3";
  const btnBig =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] font-semibold disabled:opacity-50";
  const btnBigPrimary =
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-[14px] font-semibold text-white disabled:opacity-50";
  const photosReviewable = status === "AWAITING_DROP" || status === "RECEIVED";

  // What the team should do with this parcel right now, in one sentence and one button.
  const step: { text: string; button?: { label: string; run: () => void; disabled?: boolean } } =
    status === "AWAITING_DROP"
      ? {
          text: "Paket belum sampai. Scan QR di label saat tiba, atau terima dari sini.",
          button: {
            label: "Terima di drop point",
            run: () => act("advance", {}, "paket diterima."),
          },
        }
      : adminCanBill(status)
        ? {
            text: "Timbang paket, cocokkan dengan foto pelanggan, lalu kirim tagihan.",
            button: {
              label: "Ke form timbang",
              run: () => weighRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
            },
          }
        : status === "PAYMENT_PENDING"
          ? {
              text: "Menunggu pelanggan membayar. Status dicek otomatis tiap menit.",
              button: {
                label: "Cek pembayaran sekarang",
                run: () => act("check_payment", {}, "pembayaran dicek ke Mayar."),
              },
            }
          : status === "PAID"
            ? { text: "Sudah dibayar. Muat ke batch lewat scan di Tasikmalaya (tab Scan & Batch)." }
            : next
              ? {
                  text:
                    status === "SHIPPED"
                      ? "Paket dalam pengiriman ke Jepang. Tandai bila sudah tiba."
                      : "Paket sudah tiba. Tandai selesai bila pelanggan sudah menerima.",
                  button: {
                    label: SHIPPING_ADMIN_NEXT_LABEL[status] ?? "Lanjut",
                    run: () => act("advance", {}, "status dimajukan."),
                  },
                }
              : {
                  text:
                    status === "PROBLEM"
                      ? "Paket bermasalah. Selesaikan masalahnya di bagian Posisi di jalur."
                      : shippingIsPaid(status)
                        ? "Paket sedang di jalur. Perpindahan dicatat lewat scan dan batch."
                        : "Tidak ada langkah berikutnya untuk status ini.",
                };

  return (
    <article className="min-w-0 space-y-2.5 rounded-2xl bg-secondary p-3 text-[13px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[17px] font-bold text-brand-red">{order.code}</p>
          <p className="text-[11px] text-muted-foreground">
            Dibuat {formatAdminDateTime(order.createdAt)}
            {order.dropDeadlineAt && status === "AWAITING_DROP"
              ? ` · batas antar ${formatAdminDateTime(order.dropDeadlineAt)}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {order.refundNeeded && <StatusPill tone="danger">Perlu refund</StatusPill>}
          <StatusPill tone={tone(status)}>{SHIPPING_STATUS_LABEL[status]}</StatusPill>
        </div>
      </div>

      <div className={card}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Langkah berikutnya
        </p>
        <p className="mt-0.5">{step.text}</p>
        {step.button && (
          <button
            type="button"
            disabled={busy || step.button.disabled}
            className={`${btnBigPrimary} mt-2`}
            onClick={step.button.run}
          >
            {step.button.label}
          </button>
        )}
      </div>

      <dl className={`${card} space-y-1.5`}>
        <Line k="Penerima" v={`${order.recipientName} · ${order.phone}`} />
        <Line
          k="Alamat"
          v={`${order.addressLine}, ${order.city}, ${order.prefecture} ${order.postalCode}`}
        />
        <Line k="Barang" v={`${order.category}: ${order.contents}`} />
        <Line k="Nilai" v={formatIdr(order.declaredValueIdr)} />
        <Line
          k="Estimasi"
          v={`${formatKg(order.estimatedKg)} · ${formatIdr(order.estimateIdr)} (tarif ${formatIdr(order.rateIdrPerKg)}/kg)`}
        />
        {order.inboundMode === "COURIER" && (
          <Line
            k="Masuk lewat kurir"
            v={`${order.inboundCourier} · resi ${order.inboundTracking}`}
          />
        )}
      </dl>

      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Foto dari pelanggan ({order.proofPhotoIds.length})</p>
          <PhotoReviewBadge review={order.photoReview} />
        </div>
        {order.proofPhotoIds.length === 0 ? (
          <p className="mt-1 text-[#9a6100]">Pelanggan belum melampirkan foto.</p>
        ) : (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {order.proofPhotoIds.map((id) => (
              <a
                key={id}
                href={`/api/shipping-photo/${id}?admin=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <img
                  src={`/api/shipping-photo/${id}?admin=1`}
                  alt="Foto isi paket dari pelanggan"
                  className="h-24 w-32 rounded-xl object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        {order.photoReview === "REDO" && order.photoReviewNote && (
          <p className="mt-1 text-muted-foreground">
            Catatan ke pelanggan: {order.photoReviewNote}
          </p>
        )}
        {photosReviewable && order.photoReview !== "APPROVED" && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-brand-red">
              Tinjau foto
            </summary>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                disabled={busy || order.proofPhotoIds.length === 0}
                className={`${btnBig} w-full`}
                onClick={() => act("photo_approve", {}, "foto disetujui.")}
              >
                Setujui foto
              </button>
              <input
                className={input}
                value={redoNote}
                maxLength={400}
                onChange={(e) => setRedoNote(e.target.value)}
                placeholder="Catatan untuk pelanggan bila minta foto ulang"
              />
              <button
                type="button"
                disabled={busy || redoNote.trim().length < 3}
                className={`${btnBig} w-full`}
                onClick={() => act("photo_redo", { note: redoNote.trim() }, "foto ulang diminta.")}
              >
                Minta foto ulang
              </button>
            </div>
          </details>
        )}
      </div>

      {adminCanBill(status) && (
        <div ref={weighRef} className={`${card} space-y-2`}>
          <p className="font-semibold">Timbang dan tagih</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">
                Berat timbang (kg)
              </span>
              <input
                className={`${input} text-base font-semibold`}
                inputMode="decimal"
                value={weighed}
                onChange={(e) => setWeighed(e.target.value)}
                placeholder="2,4"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">
                Biaya packing (Rp)
              </span>
              <input
                className={input}
                inputMode="numeric"
                value={packing}
                onChange={(e) => setPacking(e.target.value)}
              />
            </label>
          </div>
          <input
            className={input}
            value={weighNote}
            maxLength={400}
            onChange={(e) => setWeighNote(e.target.value)}
            placeholder="Catatan untuk pelanggan (opsional)"
          />
          {order.photoIds.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {order.photoIds.map((id) => (
                <span key={id} className="relative shrink-0">
                  <img
                    src={`/api/shipping-photo/${id}?admin=1`}
                    alt="Foto timbang"
                    className="h-16 w-24 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    aria-label="Hapus foto"
                    disabled={busy}
                    onClick={() => act("delete_photo", { photoId: id }, "foto dihapus.")}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-[12px] text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <label className={`${btnBig} w-full cursor-pointer`}>
            Foto timbang ({order.photoIds.length}/4)
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => void upload(e.target.files?.[0])}
              aria-label="Unggah foto timbang dan isi paket"
            />
          </label>
          {previewQuote && (
            <div className="rounded-xl bg-secondary p-3">
              <p>
                Dibulatkan {formatKg(previewQuote.billedKg)} × {formatIdr(order.rateIdrPerKg)} ={" "}
                {formatIdr(previewQuote.freightIdr)}
              </p>
              <p className="text-base font-bold">Total {formatIdr(previewQuote.totalIdr)}</p>
              {margin !== null && (
                <p className="text-muted-foreground">
                  Biaya partner {formatIdr(order.partnerIdrPerKg)}/kg, margin {formatIdr(margin)}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={busy || !previewQuote}
            className={btnBigPrimary}
            onClick={() =>
              act(
                "bill",
                {
                  weighedKg: weighedNumber,
                  packingIdr: packingNumber,
                  ...(weighNote.trim() ? { note: weighNote.trim() } : {}),
                },
                "tagihan dikirim ke pelanggan.",
              )
            }
          >
            Kirim tagihan
          </button>
        </div>
      )}

      {order.totalIdr !== null && !adminCanBill(status) && (
        <dl className={`${card} space-y-1.5`}>
          <Line
            k="Ditimbang"
            v={`${order.weighedKg ? formatKg(order.weighedKg) : "-"} → ditagih ${order.billedKg ? formatKg(order.billedKg) : "-"}`}
          />
          <Line k="Total" v={formatIdr(order.totalIdr)} />
          {margin !== null && (
            <Line
              k="Margin"
              v={`${formatIdr(margin)} (biaya partner ${formatIdr(order.partnerCostIdr ?? 0)})`}
            />
          )}
          {order.paidAt && <Line k="Dibayar" v={formatAdminDateTime(order.paidAt)} />}
          {order.financeError && <Line k="Keuangan" v={`Gagal dicatat: ${order.financeError}`} />}
        </dl>
      )}

      {shippingIsPaid(status) && (
        <div className={`${card} space-y-2`}>
          <p className="font-semibold">Posisi di jalur</p>
          <p className="text-muted-foreground">
            {order.currentHub ? `Terakhir di ${order.currentHub}. ` : ""}
            {SHIPPING_STATUS_LABEL[status]}.{" "}
            {status === "PAID"
              ? "Paket dimuat ke batch lewat scan di Tasikmalaya."
              : "Perpindahan antar titik dicatat lewat scan dan batch di tab Scan & Batch."}
          </p>
          {order.courier && (
            <Line k="Kurir Jepang" v={`${order.courier} · resi ${order.trackingNumber ?? "-"}`} />
          )}
          {status === "PROBLEM" && (
            <>
              <p className="font-semibold text-destructive">{order.problemNote ?? "Bermasalah"}</p>
              <button
                type="button"
                disabled={busy}
                className={`${btnBig} w-full`}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await resolveShippingProblem({ data: { orderId: order.id } });
                    setNotice({ error: false, text: `${order.code}: masalah diselesaikan.` });
                    await refresh();
                  } catch (error) {
                    setNotice({
                      error: true,
                      text: error instanceof Error ? error.message : "Tindakan gagal.",
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Masalah selesai, kembalikan ke jalur
              </button>
            </>
          )}
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold text-brand-red">
              Koreksi status
            </summary>
            <div className="mt-2 space-y-2">
              <select
                className={input}
                value={fixTo}
                onChange={(e) => setFixTo(e.target.value)}
                aria-label="Koreksi status ke"
              >
                <option value="">Pilih status yang benar…</option>
                {(
                  [
                    "PAID",
                    "TO_BANDUNG",
                    "AT_BANDUNG",
                    "TO_JAKARTA",
                    "AT_JAKARTA",
                    "SHIPPED",
                  ] as const
                ).map((st) => (
                  <option key={st} value={st}>
                    {SHIPPING_STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
              <input
                className={input}
                value={fixNote}
                onChange={(e) => setFixNote(e.target.value)}
                placeholder="Alasan koreksi"
                aria-label="Alasan koreksi"
              />
              <button
                type="button"
                disabled={busy || !fixTo || fixNote.trim().length < 3}
                className={`${btnBig} w-full`}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await correctShippingStatus({
                      data: { orderId: order.id, status: fixTo as "PAID", note: fixNote.trim() },
                    });
                    setNotice({ error: false, text: `${order.code}: status dikoreksi.` });
                    setFixTo("");
                    setFixNote("");
                    await refresh();
                  } catch (error) {
                    setNotice({
                      error: true,
                      text: error instanceof Error ? error.message : "Koreksi gagal.",
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Koreksi status
              </button>
            </div>
          </details>
        </div>
      )}

      <div className={card}>
        <p className="mb-2 font-semibold">Cetak</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["label", "Label"],
              ["receipt", "Tanda terima"],
              ["weigh", "Lembar timbang"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={printBusy}
              className="tap flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border px-1 text-[11px] font-semibold disabled:opacity-50"
              onClick={() => printOne(key)}
            >
              <Printer className="size-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {printBusy && <p className="mt-1.5 text-muted-foreground">Membuat dokumen…</p>}
        {printError && (
          <p role="alert" className="mt-1.5 text-destructive">
            {printError}
          </p>
        )}
      </div>

      <details className={card}>
        <summary className="cursor-pointer font-semibold">Tindakan lain</summary>
        <div className="mt-3 space-y-3">
          {status === "RECEIVED" && order.weighedKg === null && (
            <button
              type="button"
              disabled={busy}
              className={`${btnBig} w-full`}
              onClick={() => act("undo_receive", {}, "penerimaan diurungkan.")}
            >
              Urungkan terima
            </button>
          )}
          {order.paidAt && order.financeError && (
            <button
              type="button"
              disabled={busy}
              className={`${btnBig} w-full`}
              onClick={() => act("resend_finance", {}, "pencatatan keuangan dikirim ulang.")}
            >
              Kirim ulang ke Keuangan
            </button>
          )}
          {(adminCanReject(status) || adminCanCancel(status)) && (
            <div className="space-y-2">
              <input
                className={input}
                value={reason}
                maxLength={400}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  adminCanCancel(status)
                    ? "Alasan pembatalan (pelanggan dapat refund)"
                    : "Alasan penolakan, dikirim ke pelanggan"
                }
              />
              <button
                type="button"
                disabled={busy || reason.trim().length < 3}
                className={`${btnBig} w-full text-destructive`}
                onClick={() =>
                  act(
                    adminCanCancel(status) ? "cancel" : "reject",
                    { note: reason.trim() },
                    "selesai.",
                  )
                }
              >
                {adminCanCancel(status) ? "Batalkan dan tandai refund" : "Tolak barang"}
              </button>
            </div>
          )}
          <div className="space-y-2">
            <textarea
              className={`${input} min-h-16 py-2`}
              value={note}
              maxLength={800}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan internal (tidak terlihat pelanggan)"
            />
            <button
              type="button"
              disabled={busy || note === (order.adminNote ?? "")}
              className={`${btnBig} w-full`}
              onClick={() =>
                act("note", note.trim() ? { note: note.trim() } : {}, "catatan disimpan.")
              }
            >
              Simpan catatan
            </button>
          </div>
        </div>
      </details>

      <details className={card}>
        <summary className="cursor-pointer font-semibold">Riwayat ({order.events.length})</summary>
        <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {order.events.map((e, i) => (
            <li key={i}>
              {formatAdminDateTime(e.at)} ·{" "}
              {SHIPPING_STATUS_LABEL[e.status as ShippingStatus] ?? e.status} · {e.actor}
              {e.note ? ` · ${e.note}` : ""}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium">{v}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------- settings */

/** An on/off switch with a real switch role, big enough for a thumb. */
function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tap flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-secondary px-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-[#34C759]" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

/** One collapsible group of settings with a one-line summary, so the page is a menu, not a wall. */
function Group({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-background">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">{children}</div>
    </details>
  );
}

function Field({
  label,
  suffix,
  hint,
  children,
}: {
  label: string;
  suffix?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="relative block">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Settings({
  data,
  setNotice,
  refresh,
}: {
  data: Data;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [config, setConfig] = useState<ShippingConfig>(data.config);
  const [reason, setReason] = useState("");
  const [couriers, setCouriers] = useState(data.config.couriers.join("\n"));
  const [prohibited, setProhibited] = useState(data.config.prohibited.join("\n"));
  const [transport, setTransport] = useState(data.config.transport.join("\n"));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ShippingConfig>(key: K, value: ShippingConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const jp = config.countries.JP;
  const setJp = (patch: Partial<typeof jp>) => set("countries", { JP: { ...jp, ...patch } });
  const setHub = (hub: "BANDUNG" | "JAKARTA", patch: Partial<{ name: string; address: string }>) =>
    set("hubs", { ...config.hubs, [hub]: { ...config.hubs[hub], ...patch } });
  const setEta = (patch: Partial<ShippingConfig["eta"]>) => set("eta", { ...config.eta, ...patch });
  const setPoint = (patch: Partial<ShippingConfig["dropPoint"]>) =>
    set("dropPoint", { ...config.dropPoint, ...patch });
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const draft: ShippingConfig = {
    ...config,
    couriers: lines(couriers),
    prohibited: lines(prohibited),
    transport: lines(transport),
  };
  // Compared with what is saved, so the bar below only asks for a reason when something changed.
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.config);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAdminShippingConfig({
        data: { config: draft, expectedVersion: data.version, reason },
      });
      if (!result.ok)
        setNotice({
          error: true,
          text: "Pengaturan sudah diubah orang lain. Muat ulang lalu coba lagi.",
        });
      else {
        setNotice({
          error: false,
          text: "Pengaturan Kirim Barang disimpan dan tercatat di audit log.",
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

  const num = (value: number, onChange: (v: number) => void, step = 1) => (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      className={`${input} pr-12`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
  const text = (value: string, onChange: (v: string) => void, placeholder?: string) => (
    <input
      className={input}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  const area = (value: string, onChange: (v: string) => void, rows = 4) => (
    <textarea
      className={`${input} min-h-20 py-2 leading-6`}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div className="space-y-3 pb-28">
      <AdminSurface className="space-y-3 p-3">
        <SectionHeading
          title="Pengaturan"
          detail="Berlaku di aplikasi pelanggan dalam sekitar satu menit. Booking yang sudah dibuat tetap memakai tarif saat booking."
        />
        <Switch
          label="Kirim Barang aktif"
          hint="Tile di Beranda membuka layanan. Mati: tile kembali jadi waitlist."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
      </AdminSurface>

      <Group
        title="Tarif dan berat"
        summary={`Jepang ${formatIdr(jp.rateIdrPerKg)}/kg · min ${config.minKg} kg · bulat ${config.roundKg} kg`}
        defaultOpen
      >
        <Switch label="Jepang aktif" checked={jp.enabled} onChange={(v) => setJp({ enabled: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tarif pelanggan" suffix="Rp/kg">
            {num(jp.rateIdrPerKg, (v) => setJp({ rateIdrPerKg: v }), 1000)}
          </Field>
          <Field label="Biaya partner" suffix="Rp/kg" hint="Internal, untuk margin">
            {num(jp.partnerCostIdrPerKg, (v) => setJp({ partnerCostIdrPerKg: v }), 1000)}
          </Field>
          <Field label="Berat minimum" suffix="kg">
            {num(config.minKg, (v) => set("minKg", v), 0.5)}
          </Field>
          <Field label="Pembulatan ke atas" suffix="kg">
            {num(config.roundKg, (v) => set("roundKg", v), 0.5)}
          </Field>
          <Field label="Berat maksimum" suffix="kg" hint="Per paket">
            {num(config.maxKg, (v) => set("maxKg", v))}
          </Field>
        </div>
      </Group>

      <Group
        title="Drop point Tasikmalaya"
        summary={`${config.dropPoint.name} · ${config.dropPoint.hours}`}
      >
        <Field label="Nama">{text(config.dropPoint.name, (v) => setPoint({ name: v }))}</Field>
        <Field label="Alamat">
          {text(config.dropPoint.address, (v) => setPoint({ address: v }))}
        </Field>
        <Field label="Jam buka" hint="Teks untuk pelanggan">
          {text(config.dropPoint.hours, (v) => setPoint({ hours: v }))}
        </Field>
        <Field label="Tautan Google Maps" hint="Kosong = pencarian otomatis dari alamat">
          {text(
            config.dropPoint.mapUrl,
            (v) => setPoint({ mapUrl: v }),
            "https://maps.app.goo.gl/…",
          )}
        </Field>
      </Group>

      <Group
        title="Gudang Bandung dan hub Jakarta"
        summary={`${config.hubs.BANDUNG.name} · ${config.hubs.JAKARTA.name}`}
      >
        {(["BANDUNG", "JAKARTA"] as const).map((h) => (
          <div key={h} className="space-y-2 rounded-xl bg-secondary p-3">
            <p className="text-xs font-semibold">{h === "BANDUNG" ? "Bandung" : "Jakarta"}</p>
            <Field label="Nama">{text(config.hubs[h].name, (v) => setHub(h, { name: v }))}</Field>
            <Field label="Alamat">
              {text(config.hubs[h].address, (v) => setHub(h, { address: v }))}
            </Field>
          </div>
        ))}
      </Group>

      <Group
        title="Batas waktu dan estimasi"
        summary={`Antar ${config.dropDeadlineDays} hari · bayar ${config.paymentWindowHours} jam · Jepang ${config.eta.toJapanMinDays}-${config.eta.toJapanMaxDays} hari`}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Batas antar" suffix="hari">
            {num(config.dropDeadlineDays, (v) => set("dropDeadlineDays", v))}
          </Field>
          <Field label="Batas bayar" suffix="jam">
            {num(config.paymentWindowHours, (v) => set("paymentWindowHours", v))}
          </Field>
          <Field label="Booking menunggu" hint="Per pelanggan">
            {num(config.maxOpenBookings, (v) => set("maxOpenBookings", v))}
          </Field>
          <Field label="Foto wajib" suffix="foto" hint="Minimal, 0 = tidak wajib">
            {num(config.minPhotos, (v) => set("minPhotos", v))}
          </Field>
        </div>
        <p className="text-xs font-semibold text-muted-foreground">
          Estimasi tiap leg, tampil ke pelanggan
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tasik ke Bandung" suffix="hari">
            {num(config.eta.toBandungDays, (v) => setEta({ toBandungDays: v }))}
          </Field>
          <Field label="Bandung ke Jakarta" suffix="hari">
            {num(config.eta.toJakartaDays, (v) => setEta({ toJakartaDays: v }))}
          </Field>
          <Field label="Ke Jepang (min)" suffix="hari">
            {num(config.eta.toJapanMinDays, (v) => setEta({ toJapanMinDays: v }))}
          </Field>
          <Field label="Ke Jepang (maks)" suffix="hari">
            {num(config.eta.toJapanMaxDays, (v) => setEta({ toJapanMaxDays: v }))}
          </Field>
        </div>
      </Group>

      <Group
        title="Kurir dan pembawa"
        summary={`${lines(couriers).length} partner · ${lines(transport).length} pembawa`}
      >
        <Field label="Partner ke Jepang" hint="Satu per baris">
          {area(couriers, setCouriers, 3)}
        </Field>
        <Field label="Pembawa antar kota" hint="Satu per baris, pilihan di batch">
          {area(transport, setTransport, 3)}
        </Field>
      </Group>

      <Group
        title="Barang terlarang"
        summary={`${lines(prohibited).length} aturan, tampil di form`}
      >
        <Field label="Daftar" hint="Satu per baris, maksimal 12">
          {area(prohibited, setProhibited, 6)}
        </Field>
      </Group>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {dirty ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#9a6100]">
              Ada perubahan yang belum disimpan
            </p>
            <input
              className={input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alasan perubahan (masuk audit log)"
              aria-label="Alasan perubahan"
            />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button
                type="button"
                disabled={busy}
                className={`${btn} px-4`}
                onClick={() => {
                  setConfig(data.config);
                  setCouriers(data.config.couriers.join("\n"));
                  setProhibited(data.config.prohibited.join("\n"));
                  setTransport(data.config.transport.join("\n"));
                  setReason("");
                }}
              >
                Batalkan
              </button>
              <button
                type="button"
                disabled={busy || reason.trim().length < 3}
                className={`${btnPrimary} min-h-11 text-sm`}
                onClick={save}
              >
                {busy ? "Menyimpan…" : "Simpan pengaturan"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Semua pengaturan sudah tersimpan.
          </p>
        )}
      </div>
    </div>
  );
}
