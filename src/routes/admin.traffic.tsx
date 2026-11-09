import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";

// Lalu lintas is now the Dashboard itself; keep the old link working.
export const Route = createFileRoute("/admin/traffic")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard", search: { range: "24j" } });
  },
});
