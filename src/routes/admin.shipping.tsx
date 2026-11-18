import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useLocation, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Printer } from "lucide-react";
import { AdminShippingScan } from "@/components/shipping/admin-shipping-scan";
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
  loader: () => getAdminShipping(),
  component: AdminShipping,
});

type Tab = "orders" | "scan" | "settings";
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
const NEEDS_ACTION: ShippingStatus[] = ["AWAITING_DROP", "RECEIVED", "PAID"];

function AdminShipping() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const location = useLocation();
  const { scan } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(scan ? "scan" : "orders");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which form the team wants after a scan, so the detail opens scrolled to it.
  const [focus, setFocus] = useState<"weigh" | "ship" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    setTab(
      location.hash === "settings"
        ? "settings"
        : location.hash === "scan" || scan
          ? "scan"
          : "orders",
    );
  }, [location.hash, scan]);
  const refresh = () => router.invalidate();
  const todo = NEEDS_ACTION.reduce((n, s) => n + (data.counts[s] ?? 0), 0);

  return (
    <AdminShell
      title="Kirim Barang"
      subtitle="Paket ke Jepang: terima di drop point, timbang dan tagih, kirim dengan kurir partner, atur tarif."
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
              ["orders", "Pengiriman"],
              ["scan", "Scan QR"],
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
              <span className="inline-flex items-center justify-center gap-1.5">
                {label}
                {id === "orders" && <CountBadge n={todo} label="perlu tindakan" />}
              </span>
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
        {tab === "scan" && (
          <div className="mx-auto w-full max-w-md">
            <AdminShippingScan
              initialCode={scan ?? null}
              onChanged={() => void refresh()}
              onOpen={(id, which) => {
                setSelectedId(id);
                setFocus(which ?? null);
                setTab("orders");
              }}
            />
          </div>
        )}
        {tab === "orders" && (
          <Orders
            data={data}
            selectedId={selectedId}
            setSelectedId={(id) => {
              setSelectedId(id);
              setFocus(null);
            }}
            focus={focus}
            setNotice={setNotice}
            refresh={refresh}
          />
        )}
        {tab === "settings" && <Settings data={data} setNotice={setNotice} refresh={refresh} />}
      </div>
    </AdminShell>
  );
}

/* ------------------------------------------------------------------ orders */

function Orders({
  data,
  selectedId,
  setSelectedId,
  focus,
  setNotice,
  refresh,
}: {
  data: Data;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  focus: "weigh" | "ship" | null;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<"ALL" | ShippingStatus>("ALL");
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
  const rows = useMemo(
    () => data.orders.filter((o) => filter === "ALL" || o.status === filter),
    [data.orders, filter],
  );
  const selected = data.orders.find((o) => o.id === selectedId) ?? rows[0] ?? null;
  // A parcel opened from the scan must not hide behind the current filter, and on a phone the
  // detail replaces the list (with a way back), so the team sees it without scrolling.
  useEffect(() => {
    if (selectedId && !rows.some((o) => o.id === selectedId)) setFilter("ALL");
    if (selectedId) window.scrollTo({ top: 0 });
  }, [selectedId, rows]);
  return (
    <AdminSurface className="p-3">
      <SectionHeading
        title="Pengiriman"
        detail="Yang perlu diterima, ditimbang, atau dikirim ada paling atas."
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(["ALL", ...Object.keys(SHIPPING_STATUS_LABEL)] as ("ALL" | ShippingStatus)[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`min-h-8 rounded-full px-3 text-xs font-semibold ${filter === s ? "bg-brand-red text-white" : "bg-secondary"}`}
          >
            {s === "ALL" ? "Semua" : SHIPPING_STATUS_LABEL[s]}
            {s !== "ALL" && data.counts[s] ? ` · ${data.counts[s]}` : ""}
          </button>
        ))}
      </div>
      {picked.size > 0 && (
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
        <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada pengiriman.
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className={`space-y-1.5 ${selectedId ? "hidden lg:block" : ""}`}>
            {rows.map((o) => (
              <li key={o.id} className="flex items-center gap-1.5">
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
                  className="size-5 shrink-0 accent-[var(--brand-red)]"
                />
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  aria-current={selected?.id === o.id}
                  className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl p-2.5 text-left text-xs ${selected?.id === o.id ? "bg-brand-red-soft" : "bg-secondary"}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-brand-red">{o.code}</span>
                    <span className="block truncate text-muted-foreground">
                      {o.recipientName}, {o.prefecture} · {formatKg(o.estimatedKg)}
                    </span>
                    {(o.status === "AWAITING_DROP" || o.status === "RECEIVED") &&
                      o.photoReview !== "APPROVED" && (
                        <span className="block text-[11px] font-semibold text-[#9a6100]">
                          {o.photoReview === "REDO"
                            ? "Menunggu foto ulang"
                            : o.proofPhotoIds.length < data.config.minPhotos
                              ? "Foto belum lengkap"
                              : "Foto belum ditinjau"}
                        </span>
                      )}
                  </span>
                  <StatusPill tone={tone(o.status)}>{SHIPPING_STATUS_LABEL[o.status]}</StatusPill>
                </button>
              </li>
            ))}
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
                focus={selectedId === selected.id ? focus : null}
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
  focus,
  setNotice,
  refresh,
}: {
  order: Order;
  config: ShippingConfig;
  focus: "weigh" | "ship" | null;
  setNotice: (n: Notice) => void;
  refresh: () => Promise<unknown>;
}) {
  const weighRef = useRef<HTMLDivElement>(null);
  const shipRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [weighed, setWeighed] = useState(order.weighedKg ? String(order.weighedKg) : "");
  const [packing, setPacking] = useState(String(order.packingIdr || 0));
  const [weighNote, setWeighNote] = useState(order.weighNote ?? "");
  const [courier, setCourier] = useState(order.courier ?? config.couriers[0] ?? "");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(order.adminNote ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [redoNote, setRedoNote] = useState("");
  const [printBusy, setPrintBusy] = useState(false);
  const status = order.status as ShippingStatus;
  const next = SHIPPING_ADMIN_NEXT[status];

  // Opened from a scan: jump to the form the team wants and put the cursor in its first field.
  useEffect(() => {
    const target =
      focus === "weigh" && adminCanBill(status)
        ? weighRef.current
        : focus === "ship" && status === "PAID"
          ? shipRef.current
          : null;
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    target.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setNotice({ error: true, text: "Dokumen belum bisa dibuat di perangkat ini. Coba lagi." });
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

  return (
    <article className="min-w-0 rounded-xl bg-secondary p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand-red">{order.code}</p>
          <p className="text-[11px] text-muted-foreground">
            Dibuat {formatAdminDateTime(order.createdAt)}
            {order.dropDeadlineAt && status === "AWAITING_DROP"
              ? ` · batas antar ${formatAdminDateTime(order.dropDeadlineAt)}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order.refundNeeded && <StatusPill tone="danger">Perlu refund</StatusPill>}
          <StatusPill tone={tone(status)}>{SHIPPING_STATUS_LABEL[status]}</StatusPill>
        </div>
      </div>

      <dl className="mt-2 space-y-1 rounded-lg bg-background p-2">
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

      <div className="mt-2 rounded-lg bg-background p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Foto dari pelanggan ({order.proofPhotoIds.length})</p>
          <PhotoReviewBadge review={order.photoReview} />
        </div>
        {order.proofPhotoIds.length === 0 ? (
          <p className="mt-1 text-[#9a6100]">Pelanggan belum melampirkan foto.</p>
        ) : (
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
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
                  className="h-20 w-28 rounded-lg object-cover"
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
        {(status === "AWAITING_DROP" || status === "RECEIVED") && (
          <div className="mt-2 space-y-1.5">
            <input
              className={input}
              value={redoNote}
              maxLength={400}
              onChange={(e) => setRedoNote(e.target.value)}
              placeholder="Catatan bila minta foto ulang"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  busy || order.proofPhotoIds.length === 0 || order.photoReview === "APPROVED"
                }
                className={btn}
                onClick={() => act("photo_approve", {}, "foto disetujui.")}
              >
                Setujui foto
              </button>
              <button
                type="button"
                disabled={busy || redoNote.trim().length < 3}
                className={btn}
                onClick={() => act("photo_redo", { note: redoNote.trim() }, "foto ulang diminta.")}
              >
                Minta foto ulang
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            ["label", "Cetak label"],
            ["receipt", "Tanda terima"],
            ["weigh", "Lembar timbang"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={printBusy}
            className={btn}
            onClick={() => printOne(key)}
          >
            <Printer className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        {status === "RECEIVED" && order.weighedKg === null && (
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => act("undo_receive", {}, "penerimaan diurungkan.")}
          >
            Urungkan terima
          </button>
        )}
      </div>

      {order.photoIds.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
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
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-[11px] text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {adminCanBill(status) && (
        <div ref={weighRef} className="mt-3 space-y-2 rounded-lg bg-background p-2">
          <p className="font-semibold">Timbang dan tagih</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">
                Berat timbang (kg)
              </span>
              <input
                className={input}
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
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="text-[11px]"
              disabled={busy}
              onChange={(e) => void upload(e.target.files?.[0])}
              aria-label="Unggah foto timbang dan isi paket"
            />
            <span className="text-[11px] text-muted-foreground">
              Foto timbang dan isi paket ({order.photoIds.length}/4)
            </span>
          </div>
          {previewQuote && (
            <div className="rounded-lg bg-secondary p-2">
              <p>
                Dibulatkan {formatKg(previewQuote.billedKg)} × {formatIdr(order.rateIdrPerKg)} ={" "}
                {formatIdr(previewQuote.freightIdr)}
              </p>
              <p className="font-semibold">Total tagihan {formatIdr(previewQuote.totalIdr)}</p>
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
            className={btnPrimary}
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
        <dl className="mt-2 space-y-1 rounded-lg bg-background p-2">
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

      {status === "PAID" && (
        <div ref={shipRef} className="mt-3 space-y-2 rounded-lg bg-background p-2">
          <p className="font-semibold">Kirim ke Jepang</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">Kurir</span>
              <select
                className={input}
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
              >
                {config.couriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-muted-foreground">Nomor resi</span>
              <input
                className={input}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <button
            type="button"
            disabled={busy || (status === "PAID" && (!courier || !tracking.trim()))}
            className={btnPrimary}
            onClick={() =>
              act(
                "advance",
                status === "PAID" ? { courier, trackingNumber: tracking.trim() } : {},
                "status dimajukan.",
              )
            }
          >
            {SHIPPING_ADMIN_NEXT_LABEL[status]}
          </button>
        )}
        {status === "PAYMENT_PENDING" && (
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => act("check_payment", {}, "pembayaran dicek ke Mayar.")}
          >
            Cek pembayaran
          </button>
        )}
        {order.paidAt && order.financeError && (
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => act("resend_finance", {}, "pencatatan keuangan dikirim ulang.")}
          >
            Kirim ulang ke Keuangan
          </button>
        )}
      </div>

      {(adminCanReject(status) || adminCanCancel(status)) && (
        <div className="mt-3 space-y-2 rounded-lg bg-background p-2">
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
            className={`${btn} text-destructive`}
            onClick={() =>
              act(adminCanCancel(status) ? "cancel" : "reject", { note: reason.trim() }, "selesai.")
            }
          >
            {adminCanCancel(status) ? "Batalkan dan tandai refund" : "Tolak barang"}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
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
          className={btn}
          onClick={() => act("note", note.trim() ? { note: note.trim() } : {}, "catatan disimpan.")}
        >
          Simpan catatan
        </button>
      </div>

      <ol className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
        {order.events.map((e, i) => (
          <li key={i}>
            {formatAdminDateTime(e.at)} ·{" "}
            {SHIPPING_STATUS_LABEL[e.status as ShippingStatus] ?? e.status} · {e.actor}
            {e.note ? ` · ${e.note}` : ""}
          </li>
        ))}
      </ol>
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
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ShippingConfig>(key: K, value: ShippingConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const jp = config.countries.JP;
  const setJp = (patch: Partial<typeof jp>) => set("countries", { JP: { ...jp, ...patch } });
  const setPoint = (patch: Partial<ShippingConfig["dropPoint"]>) =>
    set("dropPoint", { ...config.dropPoint, ...patch });
  const lines = (text: string) =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAdminShippingConfig({
        data: {
          config: { ...config, couriers: lines(couriers), prohibited: lines(prohibited) },
          expectedVersion: data.version,
          reason,
        },
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
  const field = (label: string, control: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {control}
    </label>
  );
  const num = (value: number, onChange: (v: number) => void, step = 1) => (
    <input
      type="number"
      step={step}
      className={input}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );

  return (
    <AdminSurface className="space-y-3 p-3">
      <SectionHeading
        title="Pengaturan"
        detail="Perubahan langsung terlihat di aplikasi pelanggan dalam sekitar satu menit. Booking yang sudah dibuat tetap memakai tarif saat booking."
      />
      {flag("Kirim Barang aktif (tile di Beranda membuka layanan)", config.enabled, (v) =>
        set("enabled", v),
      )}

      <p className="text-xs font-semibold text-muted-foreground">Tujuan: Jepang</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {flag("Jepang aktif", jp.enabled, (v) => setJp({ enabled: v }))}
        {field(
          "Tarif pelanggan per kg (Rp)",
          num(jp.rateIdrPerKg, (v) => setJp({ rateIdrPerKg: v }), 1000),
        )}
        {field(
          "Biaya partner per kg (Rp, internal)",
          num(jp.partnerCostIdrPerKg, (v) => setJp({ partnerCostIdrPerKg: v }), 1000),
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {field(
          "Berat minimum (kg)",
          num(config.minKg, (v) => set("minKg", v), 0.5),
        )}
        {field(
          "Pembulatan ke atas (kg)",
          num(config.roundKg, (v) => set("roundKg", v), 0.5),
        )}
        {field(
          "Berat maksimum per paket (kg)",
          num(config.maxKg, (v) => set("maxKg", v)),
        )}
      </div>

      <p className="text-xs font-semibold text-muted-foreground">Drop point</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field(
          "Nama",
          <input
            className={input}
            value={config.dropPoint.name}
            onChange={(e) => setPoint({ name: e.target.value })}
          />,
        )}
        {field(
          "Jam buka (teks untuk pelanggan)",
          <input
            className={input}
            value={config.dropPoint.hours}
            onChange={(e) => setPoint({ hours: e.target.value })}
          />,
        )}
      </div>
      {field(
        "Alamat",
        <input
          className={input}
          value={config.dropPoint.address}
          onChange={(e) => setPoint({ address: e.target.value })}
        />,
      )}
      {field(
        "Tautan Google Maps (https, kosong = pencarian otomatis dari alamat)",
        <input
          className={input}
          value={config.dropPoint.mapUrl}
          onChange={(e) => setPoint({ mapUrl: e.target.value })}
        />,
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {field(
          "Batas antar (hari)",
          num(config.dropDeadlineDays, (v) => set("dropDeadlineDays", v)),
        )}
        {field(
          "Batas bayar (jam)",
          num(config.paymentWindowHours, (v) => set("paymentWindowHours", v)),
        )}
        {field(
          "Booking menunggu per pelanggan",
          num(config.maxOpenBookings, (v) => set("maxOpenBookings", v)),
        )}
        {field(
          "Foto isi paket wajib (minimal, 0 = tidak wajib)",
          num(config.minPhotos, (v) => set("minPhotos", v)),
        )}
      </div>
      {field(
        "Kurir partner (satu per baris)",
        <textarea
          className={`${input} min-h-20 py-2`}
          value={couriers}
          onChange={(e) => setCouriers(e.target.value)}
        />,
      )}
      {field(
        "Barang terlarang (satu per baris, tampil di form)",
        <textarea
          className={`${input} min-h-28 py-2`}
          value={prohibited}
          onChange={(e) => setProhibited(e.target.value)}
        />,
      )}
      {field(
        "Alasan perubahan (masuk audit log)",
        <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />,
      )}
      <button
        type="button"
        disabled={busy || reason.trim().length < 3}
        className={btnPrimary}
        onClick={save}
      >
        {busy ? "Menyimpan…" : "Simpan pengaturan"}
      </button>
    </AdminSurface>
  );
}
