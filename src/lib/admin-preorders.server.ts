import { z } from "zod";
import { pool } from "@/db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { recordAdminAction } from "./admin-audit.server";
import { fetchEsimAccessPackagePrices } from "./esim-access";
import { provisionSettledTravelOrder } from "./mayar-provisioning.server";
import { refreshTravelOrderProvisioning } from "./esim-provisioning-refresh.server";
import { getBalanceSnapshot } from "./sellability.server";

const actionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["buy", "check_provider"]),
});

export type AdminPreorderRow = {
  id: string;
  orderCode: string;
  orderStatus: string;
  preorderStatus: string;
  packageCode: string;
  packageName: string;
  quantity: number;
  amountIdr: number;
  paidAt: string | null;
  deadlineAt: string | null;
  customerEmail: string | null;
  customerWhatsapp: string | null;
  providerOrderNo: string | null;
  providerCostUnits: number | null;
  balanceUnits: number | null;
  shortfallUnits: number | null;
};

export async function readAdminPreordersHandler() {
  await requireAdmin();
  const [orders, balance, emailStats] = await Promise.all([
    pool.query(
      `select o.id, o.public_order_code, o.status, o.preorder_status, o.total_amount,
              o.paid_at::text as paid_at, o.preorder_deadline_at::text as deadline_at,
              i.provider_package_code, i.package_name_snapshot, i.quantity, i.package_snapshot,
              coalesce(access.email, payment.email, profile.email) as customer_email,
              coalesce(access.whatsapp, payment.whatsapp, profile.whatsapp) as customer_whatsapp,
              p.provider_order_no
         from public.customer_orders o
         join public.customer_order_items i on i.order_id = o.id
         left join public.guest_order_access access on access.order_id = o.id
         left join public.customer_order_payment_details payment on payment.order_id = o.id
         left join public.customer_profiles profile on profile.auth_user_id = o.customer_auth_subject
         left join public.esim_provisioning_orders p on p.order_id = o.id
        where o.fulfillment_mode = 'preorder'
          and o.preorder_status in ('pending', 'processing', 'refund_review')
        order by case o.preorder_status when 'refund_review' then 0 when 'pending' then 1 else 2 end,
                 o.preorder_deadline_at asc nulls last, o.created_at asc
        limit 250`,
    ),
    getBalanceSnapshot({ forceRefresh: true }),
    pool.query(
      `select status, count(*)::int as count from public.travel_email_outbox where status <> 'sent' group by status`,
    ),
  ]);
  const rawRows = orders.rows as Array<Record<string, unknown>>;
  const packageCodes = [
    ...new Set(rawRows.map((row) => String(row["provider_package_code"] ?? ""))),
  ];
  const livePrices: Record<string, number> = await fetchEsimAccessPackagePrices(packageCodes).catch(
    () => ({}),
  );
  const rows: AdminPreorderRow[] = rawRows.map((row) => {
    const snapshot = (row["package_snapshot"] ?? {}) as Record<string, unknown>;
    const quantity = Number(row["quantity"] ?? 1);
    const packageCode = String(row["provider_package_code"] ?? "");
    const snapshotPrice = Number(snapshot["providerPriceUnits"] ?? NaN);
    const price = Number(livePrices[packageCode] ?? snapshotPrice);
    const cost = Number.isFinite(price) && price > 0 ? price * quantity : null;
    const shortfall =
      cost === null || balance.balanceUnits === null
        ? null
        : Math.max(0, cost - balance.balanceUnits);
    return {
      id: String(row["id"]),
      orderCode: String(row["public_order_code"] ?? ""),
      orderStatus: String(row["status"] ?? ""),
      preorderStatus: String(row["preorder_status"] ?? "pending"),
      packageCode,
      packageName: String(row["package_name_snapshot"] ?? snapshot["name"] ?? packageCode),
      quantity,
      amountIdr: Number(row["total_amount"] ?? 0),
      paidAt: row["paid_at"] ? String(row["paid_at"]) : null,
      deadlineAt: row["deadline_at"] ? String(row["deadline_at"]) : null,
      customerEmail: row["customer_email"] ? String(row["customer_email"]) : null,
      customerWhatsapp: row["customer_whatsapp"] ? String(row["customer_whatsapp"]) : null,
      providerOrderNo: row["provider_order_no"] ? String(row["provider_order_no"]) : null,
      providerCostUnits: cost,
      balanceUnits: balance.balanceUnits,
      shortfallUnits: shortfall,
    };
  });
  const undeliveredEmailCount = (emailStats.rows as Array<{ count?: number }>).reduce(
    (sum, row) => sum + Number(row.count ?? 0),
    0,
  );
  const emailConfigured = Boolean(
    (process.env["HELIPOD_EMAIL_API_KEY"] ?? process.env["HELIPOD_API_KEY"])?.trim() &&
    process.env["HELIPOD_EMAIL_FROM"]?.trim(),
  );
  const automaticCosts = rows
    .filter((row) => row.preorderStatus !== "refund_review" && !row.providerOrderNo)
    .map((row) => row.providerCostUnits);
  const automaticCost = automaticCosts.some((cost) => cost === null)
    ? null
    : automaticCosts.reduce<number>((sum, cost) => sum + Number(cost), 0);
  return {
    rows,
    queueSummary: {
      count: rows.filter((row) => row.preorderStatus !== "refund_review" && !row.providerOrderNo)
        .length,
      reviewCount: rows.filter((row) => row.preorderStatus === "refund_review").length,
      providerCostUnits: automaticCost,
      shortfallUnits:
        automaticCost === null || balance.balanceUnits === null
          ? null
          : Math.max(0, automaticCost - balance.balanceUnits),
    },
    balance: {
      known: balance.balanceUnits !== null,
      units: balance.balanceUnits,
      usd: balance.balanceUnits === null ? null : balance.balanceUnits / 10_000,
      capturedAt:
        balance.capturedAtMs === null ? null : new Date(balance.capturedAtMs).toISOString(),
      source: balance.source,
    },
    email: { configured: emailConfigured, undeliveredCount: undeliveredEmailCount },
  };
}

export async function runAdminPreorderActionHandler({ data }: { data: unknown }) {
  const input = actionSchema.parse(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const beforeResult = await pool.query(
    `select status, preorder_status, fulfillment_mode from public.customer_orders where id = $1::uuid limit 1`,
    [input.orderId],
  );
  const before = beforeResult.rows[0] as
    { status?: string; preorder_status?: string | null; fulfillment_mode?: string } | undefined;
  if (!before || before.fulfillment_mode !== "preorder")
    throw new Error("Pre-order tidak ditemukan");

  let result: { status: string; started?: boolean; installable?: boolean };
  if (input.action === "check_provider") {
    const providerResult = await pool.query(
      `select provider_order_no from public.esim_provisioning_orders where order_id = $1::uuid limit 1`,
      [input.orderId],
    );
    if (!providerResult.rows[0]?.provider_order_no)
      throw new Error("Pesanan provider belum dimulai");
    result = await refreshTravelOrderProvisioning(input.orderId, { force: true });
  } else {
    const snapshot = await getBalanceSnapshot({ forceRefresh: true });
    if (snapshot.balanceUnits === null)
      throw new Error("Saldo eSIM Access belum dapat dibaca. Coba lagi setelah koneksi pulih.");
    result = await provisionSettledTravelOrder(input.orderId, {
      allowOverduePreorder: before.preorder_status === "refund_review",
    });
  }
  const afterResult = await pool.query(
    `select status, preorder_status from public.customer_orders where id = $1::uuid limit 1`,
    [input.orderId],
  );
  const after = afterResult.rows[0] as
    { status?: string; preorder_status?: string | null } | undefined;
  await recordAdminAction({
    actor,
    action: input.action === "buy" ? "preorder.purchase_attempt" : "preorder.provider_check",
    entityType: "order",
    entityId: input.orderId,
    reason: input.action === "buy" ? "Admin memproses preorder" : "Admin memeriksa status provider",
    before,
    after: {
      status: after?.status ?? null,
      preorderStatus: after?.preorder_status ?? null,
      result,
    },
  }).catch(() => undefined);
  return { orderId: input.orderId, result };
}

export const adminPreorderActionInput = (data: unknown) => actionSchema.parse(data);
