import { createFileRoute, redirect } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/overview")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard" });
  },
});
