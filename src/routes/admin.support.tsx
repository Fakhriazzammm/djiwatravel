import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminSupportCases } from "@/lib/admin-read-model.fn";
import { mutateAdminSupport } from "@/lib/admin-support.fn";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";

export const Route = createFileRoute("/admin/support")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminSupportCases(),
  component: AdminSupport,
});

function AdminSupport() {
  const cases = Route.useLoaderData();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (data: Parameters<typeof mutateAdminSupport>[0]["data"]) => {
    setBusy(true);
    setNotice(null);
    try {
      await mutateAdminSupport({ data } as never);
      setReply("");
      setNotice("Perubahan support tersimpan.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Perubahan support gagal.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminShell
      title="Support"
      subtitle="Triase, balas, dan ubah status kasus pelanggan dari satu queue."
    >
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Support cases"
            detail="Data berasal dari server API dan tidak membuka identitas customer_auth_subject."
          />
          <StatusPill>{cases.length} terbaru</StatusPill>
        </div>
        {notice && <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-sm">{notice}</p>}
        {cases.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Belum ada support case.
          </div>
        ) : (
          <div className="mt-5 divide-y">
            {cases.map((item) => (
              <article key={item.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {item.caseCode} · {item.subject}
                  </h2>
                  <StatusPill>{humanizeAdminStatus(item.status)}</StatusPill>
                  <StatusPill tone={item.priority === "high" ? "danger" : "warn"}>
                    {humanizeAdminStatus(item.priority)}
                  </StatusPill>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {item.description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.category} · {item.orderId ? `Order ${item.orderId} · ` : ""}
                  Update {formatAdminDateTime(item.updatedAt)}
                </p>
                {item.latestMessage && (
                  <p className="mt-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                    Pesan terakhir ({item.latestAuthorType ?? "unknown"}): {item.latestMessage}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={item.status}
                    onChange={(event) => void act({ action: "status", caseId: item.id, status: event.target.value as "open" | "pending" | "resolved" | "closed" })}
                    disabled={busy}
                    className="min-h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                    aria-label={`Status ${item.caseCode}`}
                  >
                    {(["open", "pending", "resolved", "closed"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button type="button" onClick={() => setSelected(selected === item.id ? null : item.id)} className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold">Balas</button>
                </div>
                {selected === item.id && (
                  <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (reply.trim()) void act({ action: "reply", caseId: item.id, body: reply.trim() }); }}>
                    <input value={reply} onChange={(event) => setReply(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm" placeholder="Tulis balasan untuk customer" />
                    <button type="submit" disabled={busy || !reply.trim()} className="min-h-10 rounded-xl bg-brand-red px-3 text-sm font-semibold text-white disabled:opacity-50">Kirim</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
