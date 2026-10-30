import { requireAdmin } from "./admin-guard";
import { pool } from "../db/client.server";
import { maskEmail, maskWhatsapp } from "./admin-display";

export type AdminCustomerRow = {
  id: string;
  email: string;
  whatsapp: string;
  displayName: string | null;
  orderCount: number;
  latestOrderAt: string | null;
  createdAt: string;
};

export const adminCustomersInput = (data: { q?: string; limit?: number } = {}) => ({
  q: (data.q ?? "").trim().slice(0, 80),
  limit: Math.min(Math.max(data.limit ?? 50, 1), 100),
});

export async function getAdminCustomersHandler({
  data,
}: {
  data: ReturnType<typeof adminCustomersInput>;
}): Promise<AdminCustomerRow[]> {
  await requireAdmin();
  const result = await pool.query(
    `select cp.auth_user_id as id, cp.email, cp.whatsapp, cp.display_name,
            count(o.id)::int as order_count, max(o.created_at)::text as latest_order_at,
            cp.created_at::text as created_at
       from public.customer_profiles cp
       left join public.customer_orders o on o.customer_auth_subject = cp.auth_user_id
      where ($1 = '' or cp.email ilike '%' || $1 || '%' or cp.display_name ilike '%' || $1 || '%')
      group by cp.auth_user_id, cp.email, cp.whatsapp, cp.display_name, cp.created_at
      order by cp.updated_at desc
      limit $2`,
    [data.q, data.limit],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    email: maskEmail(String(row.email)),
    whatsapp: maskWhatsapp(String(row.whatsapp)),
    displayName: row.display_name ? String(row.display_name) : null,
    orderCount: Number(row.order_count ?? 0),
    latestOrderAt: row.latest_order_at ? String(row.latest_order_at) : null,
    createdAt: String(row.created_at),
  }));
}
