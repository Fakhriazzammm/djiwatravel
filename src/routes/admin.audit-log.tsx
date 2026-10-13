import { FileClock } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminShell, AdminSurface, AdminPageState } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/audit-log")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: Page,
});
function Page() {
  const Icon = FileClock;
  return (
    <AdminShell title="Audit log" subtitle="Readiness placeholder">
      <AdminSurface className="flex items-start gap-3 p-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-[#0a84ff]" />
        <AdminPageState
          title="Audit event store siap"
          detail="Event belum ditampilkan sebelum admin session dan database production aktif."
        />
      </AdminSurface>
    </AdminShell>
  );
}
