import { createFileRoute, redirect } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/admin-guard";

// Analytics now lives in the Dashboard (traffic KPIs and chart toggle); keep old bookmarks working.
export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard", search: { range: "24j" } });
  },
});
