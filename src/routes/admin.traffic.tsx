import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin-guard";

// Lalu lintas now lives in the Dashboard; keep the old link working.
export const Route = createFileRoute("/admin/traffic")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard", search: { period: "daily" }, hash: "lalu-lintas" });
  },
});
