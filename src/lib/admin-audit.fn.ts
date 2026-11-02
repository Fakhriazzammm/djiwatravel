import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ page: z.coerce.number().int().min(0).max(200).default(0) });
export const ADMIN_ACTIONS_PAGE_SIZE = 30;

export const getAdminActions = createServerFn({ method: "GET" })
  .validator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin-guard");
    await requireAdmin();
    const { listAdminActions } = await import("./admin-audit.server");
    const { maskEmail } = await import("./admin-display");
    const result = await listAdminActions(ADMIN_ACTIONS_PAGE_SIZE, data.page * ADMIN_ACTIONS_PAGE_SIZE);
    return {
      page: data.page,
      total: result.total,
      hasMore: (data.page + 1) * ADMIN_ACTIONS_PAGE_SIZE < result.total,
      rows: result.rows.map((row) => ({ ...row, actor: row.actor.includes("@") ? maskEmail(row.actor) : row.actor })),
    };
  });
