import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { orderEsimAccessProfilesServer } from "./esim-access";

type OrderItem = { provider_package_code: string; quantity: number; provider_unit_cost: number | string; package_snapshot: Record<string, unknown> | null };
type ProviderResponse = { success?: boolean; errorCode?: string | number; errorMsg?: string; obj?: Record<string, unknown>; data?: Record<string, unknown> };

function providerResult(response: ProviderResponse) {
  const result = response.obj ?? response.data ?? {};
  return {
    providerOrderNo: String(result["orderNo"] ?? result["orderNum"] ?? result["orderNoStr"] ?? "") || null,
    providerStatus: String(result["status"] ?? "PENDING"),
  };
}

/** Starts exactly one provider order for a settled Travel order; retries reuse the same deterministic transaction id. */
export async function provisionSettledTravelOrder(orderId: string) {
  const existing = await db.execute(sql`select id, status, provider_transaction_id, provider_order_no from public.esim_provisioning_orders where order_id = ${orderId}::uuid limit 1`);
  const orderResult = await db.execute(sql`select status from public.customer_orders where id = ${orderId}::uuid limit 1`);
  const orderStatus = String((orderResult.rows[0] as { status?: string } | undefined)?.status ?? "");
  if (!["PAYMENT_CONFIRMED", "PROVISIONING", "READY", "INSTALLED"].includes(orderStatus)) {
    throw new Error("order_not_settled");
  }
  const current = existing.rows[0] as { id?: string; status?: string; provider_transaction_id?: string | null } | undefined;
  if (current?.status === "READY" || current?.status === "PROVISIONING") return { started: false, status: current.status };
  const itemsResult = await db.execute(sql`select provider_package_code, quantity, provider_unit_cost, package_snapshot from public.customer_order_items where order_id = ${orderId}::uuid order by id`);
  const items = itemsResult.rows as unknown as OrderItem[];
  if (items.length === 0) throw new Error("order_items_not_found");
  const transactionId = current?.provider_transaction_id || `DJIWA-${orderId}`;
  const packageInfoList = items.map((item) => {
    const snapshot = item.package_snapshot ?? {};
    const providerPrice = Number(snapshot["providerPriceUnits"] ?? item.provider_unit_cost);
    return { packageCode: item.provider_package_code, count: Number(item.quantity), ...(Number.isFinite(providerPrice) && providerPrice >= 0 ? { price: providerPrice } : {}) };
  });
  await db.execute(sql`insert into public.esim_provisioning_orders(order_id, provider, provider_transaction_id, status, request_fingerprint, attempt_count, provisioning_attempts, updated_at)
    values (${orderId}::uuid, 'esimaccess', ${transactionId}, 'PROVISIONING', ${transactionId}, 1, 1, now())
    on conflict (order_id) do update set status = 'PROVISIONING', provider_transaction_id = coalesce(public.esim_provisioning_orders.provider_transaction_id, excluded.provider_transaction_id), attempt_count = public.esim_provisioning_orders.attempt_count + 1, provisioning_attempts = public.esim_provisioning_orders.provisioning_attempts + 1, last_provisioning_error = null, updated_at = now()`);
  await db.execute(sql`update public.customer_orders set status = 'PROVISIONING', updated_at = now() where id = ${orderId}::uuid and status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED')`);
  try {
    const response = await orderEsimAccessProfilesServer({ transactionId, packageInfoList }) as ProviderResponse;
    if (response.success === false || (response.errorCode !== undefined && String(response.errorCode) !== "0")) throw new Error(`esim_access_order_failed:${response.errorMsg ?? response.errorCode ?? "unknown"}`);
    const mapped = providerResult(response);
    await db.execute(sql`update public.esim_provisioning_orders set provider_order_no = ${mapped.providerOrderNo}, provider_status = ${mapped.providerStatus}, last_provider_response = ${JSON.stringify(response)}::jsonb, updated_at = now() where order_id = ${orderId}::uuid`);
    return { started: true, status: "PROVISIONING", providerOrderNo: mapped.providerOrderNo };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "provider_order_failed";
    await db.execute(sql`update public.esim_provisioning_orders set status = 'FAILED', last_provisioning_error = ${message}, updated_at = now() where order_id = ${orderId}::uuid`);
    await db.execute(sql`update public.customer_orders set status = 'PROVISIONING_FAILED', updated_at = now() where id = ${orderId}::uuid and status = 'PROVISIONING'`);
    throw error;
  }
}
