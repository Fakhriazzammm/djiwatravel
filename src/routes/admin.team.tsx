import { UsersRound } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminShell, AdminSurface, AdminPageState } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/team")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: Page,
});
function Page() {
  const Icon = UsersRound;
  return (
    <AdminShell title="Team & roles" subtitle="Readiness placeholder">
      <AdminSurface className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-[#0a84ff]" />
        <AdminPageState
          title="Team management menunggu admin auth"
          detail="Tidak ada tindakan perubahan sebelum server-side authorization aktif."
        />
      </AdminSurface>
    </AdminShell>
  );
}
