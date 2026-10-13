import { requireAdmin } from "@/lib/admin-guard";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/catalog")({
  beforeLoad: async () => {
    await requireAdmin();
    throw redirect({ to: "/admin/dashboard", replace: true });
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
});
