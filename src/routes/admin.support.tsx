import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminSupportCases } from "@/lib/admin-read-model.fn";
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
  return (
    <AdminShell
      title="Support"
      subtitle="Read-only queue untuk triase kasus pelanggan; balasan dan assignment belum tersedia di runtime ini."
    >
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading
            title="Support cases"
            detail="Data berasal dari server API dan tidak membuka identitas customer_auth_subject."
          />
          <StatusPill>{cases.length} terbaru</StatusPill>
        </div>
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
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
