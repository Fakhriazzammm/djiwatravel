import { createFileRoute, redirect } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard" });
  },
});
