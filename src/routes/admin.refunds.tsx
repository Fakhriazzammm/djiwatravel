import { createFileRoute, Link } from "@tanstack/react-router";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const decide = async (requestId: string, decision: "approve" | "reject") => {
    const reason = window.prompt(decision === "approve" ? "Alasan persetujuan refund" : "Alasan penolakan refund");
    if (!reason?.trim()) return;
    setBusy(requestId);
    setNotice(null);
    try {
      await decideAdminRefund({ data: { requestId, decision, reason: reason.trim() } });
      setNotice("Keputusan refund tercatat. Provider belum dipanggil.");
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
                        {item.id}
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
                        <div className="flex gap-2">
                          <button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, "approve")} className="min-h-9 rounded-lg bg-brand-red px-2.5 text-xs font-semibold text-white disabled:opacity-50">Setujui</button>
                          <button type="button" disabled={busy === item.id} onClick={() => void decide(item.id, "reject")} className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold disabled:opacity-50">Tolak</button>
                        </div>
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
