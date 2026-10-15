import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client.server";
import { fetchEsimAccessPackagePrices, orderEsimAccessProfilesServer } from "./esim-access";

type OrderItem = { provider_package_code: string; quantity: number; provider_unit_cost: number | string; package_snapshot: Record<string, unknown> | null };
type ProviderResponse = { success?: boolean; errorCode?: string | number | null; errorMsg?: string | null; errorMessage?: string | null; obj?: Record<string, unknown>; data?: Record<string, unknown> };

function providerResult(response: ProviderResponse) {
  const result = response.obj ?? response.data ?? {};
  return {
    providerOrderNo: String(result["orderNo"] ?? result["orderNum"] ?? result["orderNoStr"] ?? "") || null,
    providerStatus: String(result["status"] ?? "PENDING"),
  };
}

/** Only an explicit non-zero code (or `success: false`) means the provider refused the order. */
export function providerOrderFailed(response: ProviderResponse) {
  const code = response.errorCode == null ? "" : String(response.errorCode).trim();
  return response.success === false || (code !== "" && code !== "0");
}

/** Starts exactly one provider order for a settled Travel order; retries reuse the same deterministic transaction id. */
export async function provisionSettledTravelOrder(orderId: string) {
  const existing = await db.execute(sql`select id, status, provider_transaction_id, provider_order_no from public.esim_provisioning_orders where order_id = ${orderId}::uuid limit 1`);
  const orderResult = await db.execute(sql`select status from public.customer_orders where id = ${orderId}::uuid limit 1`);
  const orderStatus = String((orderResult.rows[0] as { status?: string } | undefined)?.status ?? "");
  // PROVISIONING_FAILED still means the payment settled, so it must stay retryable.
  if (!["PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED", "READY", "INSTALLED"].includes(orderStatus)) {
    throw new Error("order_not_settled");
  }
  const current = existing.rows[0] as { id?: string; status?: string; provider_transaction_id?: string | null } | undefined;
  if (current?.status === "READY") return { started: false, status: current.status };
  const itemsResult = await db.execute(sql`select provider_package_code, quantity, provider_unit_cost, package_snapshot from public.customer_order_items where order_id = ${orderId}::uuid order by id`);
  const items = itemsResult.rows as unknown as OrderItem[];
  if (items.length === 0) throw new Error("order_items_not_found");
  const transactionId = current?.provider_transaction_id || `DJIWA-${orderId}`;
  // Claim before reading live prices or calling the provider. A unique order row alone does not
  // serialize two workers: both can observe FAILED and race into the same provider request.
  const leaseOwner = randomUUID();
  await db.execute(sql`insert into public.esim_provisioning_orders(order_id, provider, provider_transaction_id, status, request_fingerprint, attempt_count, provisioning_attempts, updated_at)
    values (${orderId}::uuid, 'esimaccess', ${transactionId}, 'PENDING', ${transactionId}, 0, 0, now())
    on conflict (order_id) do nothing`);
  const claim = await db.execute(sql`update public.esim_provisioning_orders
    set status = 'PROVISIONING', lease_owner = ${leaseOwner}, lease_expires_at = now() + interval '5 minutes',
        provider_transaction_id = coalesce(provider_transaction_id, ${transactionId}),
        attempt_count = attempt_count + 1, provisioning_attempts = provisioning_attempts + 1,
        last_provisioning_error = null, updated_at = now()
    where order_id = ${orderId}::uuid
      and status <> 'READY'
      and (status <> 'PROVISIONING' or lease_expires_at is null or lease_expires_at < now())
    returning id`);
  if (claim.rows.length === 0) return { started: false, status: "PROVISIONING" };
  // Reprice against the live catalogue first: the provider rejects a stale price outright.
  const livePrices = await fetchEsimAccessPackagePrices(items.map((item) => item.provider_package_code));
  const packageInfoList = items.map((item) => {
    const snapshot = item.package_snapshot ?? {};
    const storedPrice = Number(snapshot["providerPriceUnits"] ?? item.provider_unit_cost);
    const providerPrice = Number(livePrices[item.provider_package_code] ?? storedPrice);
    return { packageCode: item.provider_package_code, count: Number(item.quantity), ...(Number.isFinite(providerPrice) && providerPrice >= 0 ? { price: providerPrice } : {}) };
  });
  await db.execute(sql`update public.customer_orders set status = 'PROVISIONING', updated_at = now() where id = ${orderId}::uuid and status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED')`);
  try {
    const response = await orderEsimAccessProfilesServer({ transactionId, packageInfoList }) as ProviderResponse;
    // The provider answers with `errorCode: null` on success, so only an explicit non-zero code
    // (or success: false) is a real failure. Reading `null` as an error discarded orders that the
    // provider had already created.
    if (providerOrderFailed(response)) {
      // Keep the raw provider answer: without it a failure like `success:false` with no message is
      // impossible to diagnose from the order row alone.
      const detail = response.errorMsg ?? response.errorMessage ?? JSON.stringify(response).slice(0, 400);
      await db.execute(sql`update public.esim_provisioning_orders set status = 'FAILED', last_provisioning_error = ${`esim_access_order_failed:${detail}`.slice(0, 500)}, last_provider_response = ${JSON.stringify(response)}::jsonb, updated_at = now() where order_id = ${orderId}::uuid`);
      await db.execute(sql`update public.customer_orders set status = 'PROVISIONING_FAILED', updated_at = now() where id = ${orderId}::uuid and status = 'PROVISIONING'`);
      throw new Error(`esim_access_order_failed:${detail}`);
    }
    const mapped = providerResult(response);
    await db.execute(sql`update public.esim_provisioning_orders set provider_order_no = ${mapped.providerOrderNo}, provider_status = ${mapped.providerStatus}, last_provider_response = ${JSON.stringify(response)}::jsonb, lease_owner = null, lease_expires_at = null, updated_at = now() where order_id = ${orderId}::uuid and lease_owner = ${leaseOwner}`);
    return { started: true, status: "PROVISIONING", providerOrderNo: mapped.providerOrderNo };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "provider_order_failed";
    console.error("[esim] provisioning failed", { orderId, message });
    await db.execute(sql`update public.esim_provisioning_orders set status = 'FAILED', last_provisioning_error = ${message}, lease_owner = null, lease_expires_at = null, updated_at = now() where order_id = ${orderId}::uuid and lease_owner = ${leaseOwner}`);
    await db.execute(sql`update public.customer_orders set status = 'PROVISIONING_FAILED', updated_at = now() where id = ${orderId}::uuid and status = 'PROVISIONING'`);
    throw error;
  }
}
