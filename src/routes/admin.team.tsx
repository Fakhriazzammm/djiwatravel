import { ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminTeam } from "@/lib/admin-team.server";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";

export const Route = createFileRoute("/admin/team")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async () => ({ team: await getAdminTeam() }),
  component: Page,
});

function Page() {
  const { team } = Route.useLoaderData();
  return (
    <AdminShell title="Team & roles" subtitle="Admin allowlist (read-only)">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeading
            title="Akses konsol admin"
            detail="Berasal dari allowlist server; email ditampilkan dalam bentuk ter-mask."
          />
          <StatusPill tone={team.members.length > 0 ? "good" : "warn"}>
            {team.members.length} admin
          </StatusPill>
        </div>

        <AdminSurface className="p-3">
          {team.empty ? (
            <div className="flex items-start gap-3 p-1">
              <UsersRound className="mt-0.5 size-5 shrink-0 text-[#b87400]" />
              <div>
                <p className="text-sm font-semibold">Belum ada admin terdaftar</p>
                <p className="mt-1 text-xs text-[#6e6e73]">
                  Tanpa allowlist tidak ada yang bisa membuka /admin/*. Setel ADMIN_EMAILS di server
                  lalu restart.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0f2]">
              {team.members.map((member) => (
                <div key={member.id} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="rounded-xl bg-[#f7f7f8] p-2">
                    <UserRound className="size-4 text-[#0a84ff]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{member.maskedEmail}</p>
                    <p className="truncate text-xs text-[#8e8e93]">{member.role}</p>
                  </div>
                  <StatusPill tone="good">Aktif</StatusPill>
                </div>
              ))}
            </div>
          )}
        </AdminSurface>

        <AdminSurface className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#8e8e93]" />
          <div>
            <p className="text-sm font-semibold">
              {team.invite.available ? "Undang admin" : "Undang admin belum tersedia"}
            </p>
            <p className="mt-1 text-xs text-[#6e6e73]">
              {team.invite.available
                ? "Gunakan API manajemen admin untuk menambah anggota."
                : team.invite.reason}
            </p>
          </div>
        </AdminSurface>
      </div>
    </AdminShell>
  );
}
