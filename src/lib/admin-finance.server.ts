import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { classifyAdminError } from "@/lib/admin-display";
import {
  fetchTravelFinanceReport,
  recordTravelExpense,
  travelExpenseInputSchema,
  type TravelFinanceReport,
} from "@/lib/travel-finance-book.server";

/**
 * Admin surface for the Travel finance book.
 *
 * The book is owned by the shared finance service; this module only relays what that service
 * reports, so the admin page can never disagree with the ledger.
 */

const reportInputSchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30),
});

export type TravelFinanceReportView =
  | { state: "ok"; report: TravelFinanceReport; error: null }
  | { state: "unavailable"; report: null; error: string };

export const getTravelFinanceReport = createServerFn({ method: "GET" })
  .validator((data: { days?: number } = {}) => reportInputSchema.parse(data))
  .handler(async ({ data }): Promise<TravelFinanceReportView> => {
    await requireAdmin();
    try {
      return { state: "ok", report: await fetchTravelFinanceReport(data.days), error: null };
    } catch (error) {
      return {
        state: "unavailable",
        report: null,
        error:
          classifyAdminError(error instanceof Error ? error.message : String(error)) ??
          "processing_failed",
      };
    }
  });

export const submitTravelExpense = createServerFn({ method: "POST" })
  .validator(travelExpenseInputSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    try {
      const result = await recordTravelExpense(data);
      return { ok: true as const, duplicate: result.duplicate, error: null };
    } catch (error) {
      return {
        ok: false as const,
        duplicate: false,
        error: classifyAdminError(error instanceof Error ? error.message : String(error)),
      };
    }
  });
