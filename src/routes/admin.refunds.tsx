import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminRefundRequests } from "@/lib/admin-read-model.fn";
import { decideAdminRefund } from "@/lib/admin-refunds.fn";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime, humanizeAdminStatus, projectAdminAmount } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/refunds")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminRefundRequests(),
  component: AdminRefunds,
});

function AdminRefunds() {
  const refunds = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const decide = async () => {
    if (!pending || reason.trim().length < 4) return;
    setBusy(pending.id);
    setNotice(null);
    try {
      await decideAdminRefund({
        data: { requestId: pending.id, decision: pending.decision, reason: reason.trim() },
      });
      setNotice("Keputusan refund tercatat di audit log. Provider belum dipanggil.");
      setPending(null);
      setReason("");
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Keputusan refund gagal.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <AdminShell
      title="Refunds"
      subtitle="Keputusan refund tercatat secara audit; eksekusi provider tetap fail-closed."
    >
      {notice && <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-sm">{notice}</p>}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Refund requests"
            detail="Provider reference/error hanya ditampilkan sebagai status tereduksi; detail rahasia tidak dikirim ke browser."
          />
          <StatusPill>{refunds.length} terbaru</StatusPill>
        </div>
        {refunds.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Belum ada refund request.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Request status</th>
                  <th className="p-3">Order status</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Events</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">Provider note</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((item) => (
                  <tr key={item.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <Link
                        to={`/admin/orders/${item.orderId}` as never}
                        className="font-semibold text-brand-red"
                      >
                        {item.orderCode}
                      </Link>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        …{item.id.slice(-8)}
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusPill tone={item.status === "REFUNDED" ? "good" : "warn"}>
                        {humanizeAdminStatus(item.status)}
                      </StatusPill>
                    </td>
                    <td className="p-3">{humanizeAdminStatus(item.orderStatus)}</td>
                    <td className="p-3">
                      {projectAdminAmount(item.amount, item.currencyCode, false)}
                    </td>
                    <td className="p-3">{item.eventCount}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatAdminDateTime(item.updatedAt)}
                    </td>
                    <td className="max-w-[240px] p-3 text-xs text-destructive">
                      {item.providerError ?? "No provider result recorded"}
                    </td>
                    <td className="p-3">
                      {item.status === "REQUESTED" ? (
                        pending?.id === item.id ? (
                          <div className="w-56 space-y-1.5">
                            <input
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              placeholder={pending.decision === "approve" ? "Alasan persetujuan (min. 4 huruf)" : "Alasan penolakan (min. 4 huruf)"}
                              aria-label="Alasan keputusan refund"
                              className="min-h-9 w-full rounded-lg border border-border px-2 text-xs"
                            />
                            <div className="flex gap-1.5">
                              <button type="button" disabled={busy === item.id || reason.trim().length < 4} onClick={() => void decide()} className="min-h-9 rounded-lg bg-brand-red px-2.5 text-xs font-semibold text-white disabled:opacity-50">{pending.decision === "approve" ? "Konfirmasi setuju" : "Konfirmasi tolak"}</button>
                              <button type="button" onClick={() => { setPending(null); setReason(""); }} className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold">Batal</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { setPending({ id: item.id, decision: "approve" }); setReason(""); }} className="min-h-9 rounded-lg bg-brand-red px-2.5 text-xs font-semibold text-white">Setujui</button>
                            <button type="button" onClick={() => { setPending({ id: item.id, decision: "reject" }); setReason(""); }} className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold">Tolak</button>
                          </div>
                        )
                      ) : <span className="text-xs text-muted-foreground">Sudah diputuskan</span>}
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
