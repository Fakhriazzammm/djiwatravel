import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminNotifications, revokeAdminNotification } from "@/lib/admin-notifications.fn";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/notifications")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminNotifications(),
  component: AdminNotifications,
});

const categoryLabel = {
  esim: "eSIM",
  bayar: "Pembayaran",
  trip: "Perjalanan",
  info: "Info",
} as const;

function AdminNotifications() {
  const { stats, types, items, activePushSubscriptions } = Route.useLoaderData();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const readRate = stats.total ? Math.round((stats.read / stats.total) * 100) : 0;

  const revoke = async () => {
    if (!pendingId || reason.trim().length < 4) return;
    setBusy(true);
    setNotice(null);
    try {
      await revokeAdminNotification({ data: { id: pendingId, reason: reason.trim() } });
      setNotice("Notifikasi ditarik dari inbox pelanggan dan dicatat di audit log.");
      setPendingId(null);
      setReason("");
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menarik notifikasi.");
    } finally {
      setBusy(false);
    }
  };

  const cards: [string, string | number][] = [
    ["Terkirim (30 hari)", stats.total],
    ["Sudah dibaca", `${readRate}%`],
    ["Diarsipkan / dihapus pelanggan", `${stats.archived} / ${stats.deleted}`],
    ["Ditarik admin", stats.revoked],
    ["Perangkat push aktif", activePushSubscriptions],
  ];

  return (
    <AdminShell
      title="Notifikasi"
      subtitle="Pantau notifikasi pelanggan: status baca, pengiriman push, dan tarik notifikasi yang keliru."
    >
      {notice && (
        <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      {types.length > 0 && (
        <section className="mt-4 flex flex-wrap gap-2">
          {types.map((t) => (
            <StatusPill key={t.type}>
              {categoryLabel[t.category]} · {t.type} · {t.count}
            </StatusPill>
          ))}
        </section>
      )}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <SectionHeading
          title="Notifikasi terbaru"
          detail="ID penerima disamarkan. Menarik notifikasi membuatnya kedaluwarsa dan hilang dari inbox pelanggan."
        />
        {items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Belum ada notifikasi.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Notifikasi</th>
                  <th className="p-3">Penerima</th>
                  <th className="p-3">Status pelanggan</th>
                  <th className="p-3">Push</th>
                  <th className="p-3">Dibuat</th>
                  <th className="p-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {categoryLabel[item.category]} · {item.type}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{item.recipient}</td>
                    <td className="p-3">
                      <StatusPill tone={item.expired ? "danger" : item.read ? "good" : "warn"}>
                        {item.expired
                          ? "Ditarik"
                          : item.deleted
                            ? "Dihapus"
                            : item.archived
                              ? "Diarsipkan"
                              : item.read
                                ? "Dibaca"
                                : "Belum dibaca"}
                      </StatusPill>
                    </td>
                    <td className="p-3 text-xs">
                      {item.sent} terkirim
                      {item.failed > 0 && (
                        <span className="text-destructive"> · {item.failed} gagal</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatAdminDateTime(item.createdAt)}
                    </td>
                    <td className="p-3">
                      {item.expired ? (
                        <span className="text-xs text-muted-foreground">Sudah ditarik</span>
                      ) : pendingId === item.id ? (
                        <div className="w-56 space-y-1.5">
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Alasan (min. 4 huruf)"
                            aria-label="Alasan menarik notifikasi"
                            className="min-h-9 w-full rounded-lg border border-border px-2 text-xs"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={busy || reason.trim().length < 4}
                              onClick={() => void revoke()}
                              className="min-h-9 rounded-lg bg-brand-red px-2.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Konfirmasi tarik
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingId(null);
                                setReason("");
                              }}
                              className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPendingId(item.id);
                            setReason("");
                          }}
                          className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold"
                        >
                          Tarik
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
