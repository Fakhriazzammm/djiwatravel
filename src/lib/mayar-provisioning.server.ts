import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, pool } from "@/db/client.server";
import { fetchEsimAccessPackagePrices, orderEsimAccessProfilesServer } from "./esim-access";
import { getBalanceSnapshot } from "./sellability.server";

type OrderItem = {
  provider_package_code: string;
  quantity: number;
  provider_unit_cost: number | string;
  package_snapshot: Record<string, unknown> | null;
};
type ProviderResponse = {
  success?: boolean;
  errorCode?: string | number | null;
  errorMsg?: string | null;
  errorMessage?: string | null;
  obj?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type ProvisionSettledOptions = {
  allowOverduePreorder?: boolean;
  balanceLimitUnits?: number;
};

function providerResult(response: ProviderResponse) {
  const result = response.obj ?? response.data ?? {};
  return {
    providerOrderNo:
      String(result["orderNo"] ?? result["orderNum"] ?? result["orderNoStr"] ?? "") || null,
    providerStatus: String(result["status"] ?? "PENDING"),
  };
}

/** Only an explicit non-zero code (or `success: false`) means the provider refused the order. */
export function providerOrderFailed(response: ProviderResponse) {
  const code = response.errorCode == null ? "" : String(response.errorCode).trim();
  return response.success === false || (code !== "" && code !== "0");
}

async function notifyPreorder(
  orderId: string,
  state: "awaiting_balance" | "processing" | "refund_review",
) {
  void import("./preorder-notifications.server")
    .then(({ notifyPreorderOrder }) => notifyPreorderOrder(orderId, state))
    .catch((error) =>
      console.warn(
        "[travel] preorder notification skipped",
        error instanceof Error ? error.message : "",
      ),
    );
}

/** Starts one provider order. Preorders share an advisory lock across balance check and purchase. */
export async function provisionSettledTravelOrder(
  orderId: string,
  options: ProvisionSettledOptions = {},
) {
  const modeResult = await db.execute(
    sql`select fulfillment_mode from public.customer_orders where id = ${orderId}::uuid limit 1`,
  );
  const mode = String(
    (modeResult.rows[0] as { fulfillment_mode?: string } | undefined)?.fulfillment_mode ??
      "instant",
  );
  if (mode !== "preorder") return provisionSettledTravelOrderUnlocked(orderId, options);

  // Serialize preorder workers and payment callbacks while they compare and spend the shared
  // provider balance. The lock is held on a dedicated session until the provider request finishes.
  const lock = await pool.connect();
  let locked = false;
  try {
    const result = await lock.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(684201, 1) as locked",
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) return { started: false, status: "PREORDER_WORKER_BUSY" };
    return await provisionSettledTravelOrderUnlocked(orderId, options);
  } finally {
    if (locked) await lock.query("select pg_advisory_unlock(684201, 1)").catch(() => undefined);
    lock.release();
  }
}

/** The caller owns the preorder advisory lock when fulfillment_mode is `preorder`. */
async function provisionSettledTravelOrderUnlocked(
  orderId: string,
  options: ProvisionSettledOptions,
) {
  const existing = await db.execute(
    sql`select id, status, provider_transaction_id, provider_order_no from public.esim_provisioning_orders where order_id = ${orderId}::uuid limit 1`,
  );
  const orderResult = await db.execute(
    sql`select status, fulfillment_mode, preorder_status, preorder_deadline_at from public.customer_orders where id = ${orderId}::uuid limit 1`,
  );
  const order = orderResult.rows[0] as
    | {
        status?: string;
        fulfillment_mode?: string;
        preorder_status?: string | null;
        preorder_deadline_at?: string | null;
      }
    | undefined;
  const orderStatus = String(order?.status ?? "");
  const isPreorder = order?.fulfillment_mode === "preorder";
  // PROVISIONING_FAILED still means the payment settled, so it must stay retryable.
  if (
    !["PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED", "READY", "INSTALLED"].includes(
      orderStatus,
    )
  ) {
    throw new Error("order_not_settled");
  }
  const current = existing.rows[0] as
    | {
        id?: string;
        status?: string;
        provider_transaction_id?: string | null;
        provider_order_no?: string | null;
      }
    | undefined;
  if (current?.status === "READY") {
    if (isPreorder && order?.preorder_status !== "fulfilled") {
      await db.execute(
        sql`update public.customer_orders set preorder_status = 'fulfilled', updated_at = now() where id = ${orderId}::uuid and fulfillment_mode = 'preorder'`,
      );
    }
    return { started: false, status: current.status };
  }
  if (isPreorder && current?.provider_order_no) {
    return {
      started: false,
      status: current.status ?? "PROVISIONING",
      providerOrderNo: current.provider_order_no,
    };
  }

  if (isPreorder) {
    const deadlineMs = order?.preorder_deadline_at ? Date.parse(order.preorder_deadline_at) : NaN;
    const overdue = Number.isFinite(deadlineMs) && deadlineMs <= Date.now();
    if (order?.preorder_status === "refund_review" && !options.allowOverduePreorder) {
      return { started: false, status: "PREORDER_REFUND_REVIEW" };
    }
    if (overdue && !options.allowOverduePreorder) {
      await db.execute(
        sql`update public.customer_orders set preorder_status = 'refund_review', updated_at = now() where id = ${orderId}::uuid and fulfillment_mode = 'preorder' and preorder_status in ('pending','processing')`,
      );
      await notifyPreorder(orderId, "refund_review");
      return { started: false, status: "PREORDER_REFUND_REVIEW" };
    }
  }

  const itemsResult = await db.execute(
    sql`select provider_package_code, quantity, provider_unit_cost, package_snapshot from public.customer_order_items where order_id = ${orderId}::uuid order by id`,
  );
  const items = itemsResult.rows as unknown as OrderItem[];
  if (items.length === 0) throw new Error("order_items_not_found");
  const transactionId = current?.provider_transaction_id || `DJIWA-${orderId}`;
  // Reprice before checking the provider balance. A preorder absorbs changes to the IDR sale price,
  // while the live provider price still has to be covered by the provider wallet.
  const livePrices = await fetchEsimAccessPackagePrices(
    items.map((item) => item.provider_package_code),
  );
  const packageInfoList = items.map((item) => {
    const snapshot = item.package_snapshot ?? {};
    const storedPrice = Number(snapshot["providerPriceUnits"] ?? NaN);
    const providerPrice = Number(livePrices[item.provider_package_code] ?? storedPrice);
    return {
      packageCode: item.provider_package_code,
      count: Number(item.quantity),
      ...(Number.isFinite(providerPrice) && providerPrice >= 0 ? { price: providerPrice } : {}),
    };
  });

  if (isPreorder) {
    if (packageInfoList.some((item) => !Number.isFinite(item.price) || Number(item.price) <= 0)) {
      return { started: false, status: "PREORDER_PRICE_UNAVAILABLE" };
    }
    const requiredBalance = packageInfoList.reduce(
      (sum, item) => sum + Number(item.price) * item.count,
      0,
    );
    const balance = await getBalanceSnapshot({ forceRefresh: true });
    if (balance.balanceUnits === null || !Number.isFinite(balance.balanceUnits)) {
      await notifyPreorder(orderId, "awaiting_balance");
      return { started: false, status: "PREORDER_BALANCE_UNKNOWN" };
    }
    if (Math.min(balance.balanceUnits, options.balanceLimitUnits ?? Infinity) < requiredBalance) {
      await db.execute(
        sql`update public.esim_provisioning_orders set status = 'PENDING', last_provisioning_error = null, lease_owner = null, lease_expires_at = null, updated_at = now() where order_id = ${orderId}::uuid and provider_order_no is null`,
      );
      await db.execute(
        sql`update public.customer_orders set status = case when status = 'PROVISIONING_FAILED' then 'PAYMENT_CONFIRMED' else status end, preorder_status = case when preorder_status = 'refund_review' then 'refund_review' else 'pending' end, updated_at = now() where id = ${orderId}::uuid and fulfillment_mode = 'preorder' and status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED')`,
      );
      await notifyPreorder(orderId, "awaiting_balance");
      return {
        started: false,
        status: "PREORDER_WAITING_BALANCE",
        requiredBalanceUnits: requiredBalance,
      };
    }
  }

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
  await db.execute(
    sql`update public.customer_orders set status = 'PROVISIONING', preorder_status = case when fulfillment_mode = 'preorder' then 'processing' else null end, updated_at = now() where id = ${orderId}::uuid and status in ('PAYMENT_CONFIRMED','PROVISIONING_FAILED')`,
  );
  if (isPreorder) await notifyPreorder(orderId, "processing");
  try {
    const response = (await orderEsimAccessProfilesServer({
      transactionId,
      packageInfoList,
    })) as ProviderResponse;
    // The provider answers with `errorCode: null` on success, so only an explicit non-zero code
    // (or success: false) is a real failure. Reading `null` as an error discarded orders that the
    // provider had already created.
    if (providerOrderFailed(response)) {
      // Keep the raw provider answer: without it a failure like `success:false` with no message is
      // impossible to diagnose from the order row alone.
      const detail =
        response.errorMsg ?? response.errorMessage ?? JSON.stringify(response).slice(0, 400);
      await db.execute(
        sql`update public.esim_provisioning_orders set status = 'FAILED', last_provisioning_error = ${`esim_access_order_failed:${detail}`.slice(0, 500)}, last_provider_response = ${JSON.stringify(response)}::jsonb, updated_at = now() where order_id = ${orderId}::uuid`,
      );
      await db.execute(
        sql`update public.customer_orders set status = 'PROVISIONING_FAILED', preorder_status = case when fulfillment_mode = 'preorder' and preorder_status <> 'refund_review' then 'pending' else preorder_status end, updated_at = now() where id = ${orderId}::uuid and status = 'PROVISIONING'`,
      );
      throw new Error(`esim_access_order_failed:${detail}`);
    }
    const mapped = providerResult(response);
    await db.execute(
      sql`update public.esim_provisioning_orders set provider_order_no = ${mapped.providerOrderNo}, provider_status = ${mapped.providerStatus}, last_provider_response = ${JSON.stringify(response)}::jsonb, lease_owner = null, lease_expires_at = null, updated_at = now() where order_id = ${orderId}::uuid and lease_owner = ${leaseOwner}`,
    );
    return {
      started: true,
      status: "PROVISIONING",
      providerOrderNo: mapped.providerOrderNo,
      spentUnits: packageInfoList.reduce(
        (sum, item) => sum + Number(item.price ?? 0) * item.count,
        0,
      ),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "provider_order_failed";
    console.error("[esim] provisioning failed", { orderId, message });
    await db.execute(
      sql`update public.esim_provisioning_orders set status = 'FAILED', last_provisioning_error = ${message}, lease_owner = null, lease_expires_at = null, updated_at = now() where order_id = ${orderId}::uuid and lease_owner = ${leaseOwner}`,
    );
    await db.execute(
      sql`update public.customer_orders set status = 'PROVISIONING_FAILED', preorder_status = case when fulfillment_mode = 'preorder' and preorder_status <> 'refund_review' then 'pending' else preorder_status end, updated_at = now() where id = ${orderId}::uuid and status = 'PROVISIONING'`,
    );
    throw error;
  }
}
