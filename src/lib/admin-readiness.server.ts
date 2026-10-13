import { createServerFn } from "@tanstack/react-start";

import { getResellerReadiness } from "@/lib/reseller-readiness";
import { requireAdmin } from "@/lib/admin-guard";

export const getAdminReadiness = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getResellerReadiness();
});
