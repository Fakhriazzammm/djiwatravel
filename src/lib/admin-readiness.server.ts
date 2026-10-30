import { createServerFn } from "@tanstack/react-start";

import { getResellerReadiness } from "@/lib/reseller-readiness";
import { requireAdmin } from "@/lib/admin-guard";

export const getAdminReadinessHandler = async () => {
  await requireAdmin();
  return getResellerReadiness();
};

export const getAdminReadiness = createServerFn({ method: "GET" }).handler(
  getAdminReadinessHandler,
);
