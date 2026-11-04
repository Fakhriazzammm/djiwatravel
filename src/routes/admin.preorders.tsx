import { AlertTriangle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";
import { readAdminPreorders, runAdminPreorderAction } from "@/lib/admin-preorders.fn";

export const Route = createFileRoute("/admin/preorders")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => readAdminPreorders(),
  component: AdminPreorders,
});

const usd = (units: number | null) =>
  units === null ? "Belum diketahui" : `US$${(units / 10_000).toFixed(2)}`;
const idr = (amount: number) => `Rp${Math.round(amount).toLocaleString("id-ID")}`;

function AdminPreorders() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  };

  const act = async (orderId: string, action: "buy" | "check_provider") => {
    setBusy(orderId);
    setNotice(null);
    try {
      const result = await runAdminPreorderAction({ data: { orderId, action } });
      const status = (result.result as { status?: string } | undefined)?.status;
      setNotice({
        error: false,
        text:
          status === "PREORDER_WAITING_BALANCE"
            ? "Saldo masih belum cukup untuk membeli paket ini. Pre-order tetap berada di antrean."
            : status === "PREORDER_REFUND_REVIEW"
              ? "Batas 3 hari terlewati. Pesanan tetap menunggu keputusan Admin."
              : action === "check_provider"
                ? "Status terbaru provider sudah diperiksa."
                : "Percobaan pembelian eSIM dikirim ke eSIM Access.",
      });
      await router.invalidate();
    } catch (error) {
      setNotice({
        error: true,
        text: error instanceof Error ? error.message : "Tindakan preorder gagal.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell
      title="Pre-order eSIM"
      subtitle="Pesanan berbayar yang menunggu saldo provider atau tindak lanjut Admin."
    >
      <div className="space-y-3">
        <AdminSurface className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading
              title="Saldo eSIM Access"
              detail="Saldo dibaca ulang saat halaman dimuat."
            />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              Perbarui saldo
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-[11px] text-muted-foreground">Saldo tersedia</p>
              <p className="mt-1 text-base font-semibold">{usd(data.balance.units)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.balance.capturedAt
                  ? formatAdminDateTime(data.balance.capturedAt)
                  : "Pembacaan gagal"}
              </p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-[11px] text-muted-foreground">Kebutuhan antrean otomatis</p>
              <p className="mt-1 text-base font-semibold">
                {usd(data.queueSummary.providerCostUnits)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kekurangan untuk seluruh antrean: {usd(data.queueSummary.shortfallUnits)}
              </p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-[11px] text-muted-foreground">Antrean aktif / review Admin</p>
              <p className="mt-1 text-base font-semibold">
                {data.queueSummary.count} / {data.queueSummary.reviewCount}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Provider refresh: {data.balance.source} · Email{" "}
                {data.email.configured ? "terhubung" : "belum dikonfigurasi"} ·{" "}
                {data.email.undeliveredCount} menunggu.
              </p>
            </div>
          </div>
        </AdminSurface>

        {!data.email.configured && (
          <div
            role="status"
            className="flex gap-2 rounded-xl border border-[#f1d9a8] bg-[#fffaf0] p-3 text-xs text-[#78520b]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Notifikasi dalam aplikasi tetap berjalan. Pengiriman email aktif setelah secret
              <code className="mx-1">HELIPOD_EMAIL_API_KEY</code> dan sender
              <code className="mx-1">HELIPOD_EMAIL_FROM</code> dipasang di runtime Travel.
            </p>
          </div>
        )}

        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={`rounded-xl p-3 text-sm ${notice.error ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
          >
            {notice.text}
          </p>
        )}

        <AdminSurface className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading
              title="Pesanan menunggu"
              detail="Paket pending dicoba otomatis setelah saldo bertambah. Yang lewat 3 hari perlu tindakan Admin."
            />
            <StatusPill
              tone={
                data.rows.some((row) => row.preorderStatus === "refund_review") ? "warn" : "neutral"
              }
            >
              {data.rows.length} preorder
            </StatusPill>
          </div>
          {!data.rows.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Belum ada preorder yang menunggu.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {data.rows.map((row) => {
                const review = row.preorderStatus === "refund_review";
                const processing = row.preorderStatus === "processing";
                const action = row.providerOrderNo ? "check_provider" : "buy";
                const isBusy = busy === row.id;
                return (
                  <article key={row.id} className="rounded-xl bg-secondary p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/admin/orders/${row.id}` as never}
                          className="font-semibold text-brand-red"
                        >
                          {row.orderCode}
                        </Link>
                        <p className="mt-0.5 truncate text-sm font-medium">{row.packageName}</p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                          {row.packageCode}
                        </p>
                      </div>
                      <StatusPill tone={review ? "danger" : processing ? "warn" : "neutral"}>
                        {review
                          ? "Antrean Admin"
                          : processing
                            ? "Sedang diproses"
                            : "Menunggu saldo"}
                      </StatusPill>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Pembayaran customer</p>
                        <p className="mt-0.5 font-semibold">{idr(row.amountIdr)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Estimasi biaya provider</p>
                        <p className="mt-0.5 font-semibold">{usd(row.providerCostUnits)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Kekurangan saldo</p>
                        <p className="mt-0.5 font-semibold">{usd(row.shortfallUnits)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tenggat preorder</p>
                        <p className="mt-0.5 font-semibold">
                          {formatAdminDateTime(row.deadlineAt)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Dibayar {formatAdminDateTime(row.paidAt)} ·{" "}
                      {row.customerEmail ?? "Email tidak tersedia"}
                      {row.customerWhatsapp ? ` · ${row.customerWhatsapp}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {action === "buy" && (
                        <button
                          type="button"
                          onClick={() => void act(row.id, "buy")}
                          disabled={isBusy || !data.balance.known}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {isBusy ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                          {review
                            ? "Coba beli sekarang"
                            : processing
                              ? "Coba ulang pembelian"
                              : "Coba beli setelah top-up"}
                        </button>
                      )}
                      {action === "check_provider" && (
                        <button
                          type="button"
                          onClick={() => void act(row.id, "check_provider")}
                          disabled={isBusy}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {isBusy ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <RefreshCw className="size-4" />
                          )}
                          Periksa status eSIM
                        </button>
                      )}
                      <Link
                        to={`/admin/orders/${row.id}` as never}
                        className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-xs font-semibold"
                      >
                        Buka pesanan
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
