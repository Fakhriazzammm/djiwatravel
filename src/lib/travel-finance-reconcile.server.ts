import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import {
  buildTravelFinanceGatewayPayload,
  postTravelFinanceSettlement,
} from "./mayar-settlement.server";

/**
 * Reconciliation for the Travel finance book.
 *
 * Settling a payment is best-effort by design (a finance outage must never block a customer order),
 * which means a posting can be missed silently. This task compares the orders we settled locally
 * against the finance book and re-posts the ones that never arrived, so revenue cannot disappear
 * from the books without anyone noticing.
 */

const LEDGER_STATUS_SEGMENT = "travel-finance-ledger-status";

/** Derive the ledger-status endpoint from the settlement URL so both stay on the same host. */
export function ledgerStatusUrl(settlementUrl: string): string {
  const url = new URL(settlementUrl);
  if (!/\/travel-finance-settlement$/.test(url.pathname)) {
    throw new Error("Travel finance settlement URL is not recognised");
  }
  url.pathname = url.pathname.replace(/\/travel-finance-settlement$/, `/${LEDGER_STATUS_SEGMENT}`);
  return url.toString();
}

export type SettledTravelOrder = {
  orderId: string;
  orderNumber: string;
  amount: number;
  paidAtMs: number;
  invoiceId?: string;
  transactionId?: string;
};

export function parseLedgerStatus(
  orderIds: string[],
  value: unknown,
): { found: string[]; missing: string[] } {
  if (!value || typeof value !== "object")
    throw new Error("Travel finance ledger status response is invalid");
  const body = value as Record<string, unknown>;
  if (body["ok"] !== true || !Array.isArray(body["missing"])) {
    throw new Error("Travel finance ledger status response is invalid");
  }
  const requested = new Set(orderIds);
  const missing = (body["missing"] as unknown[]).filter(
    (item): item is string => typeof item === "string" && requested.has(item),
  );
  return { found: orderIds.filter((orderId) => !missing.includes(orderId)), missing };
}

function configuredLedgerStatus() {
  const rawUrl = process.env["DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL"]?.trim();
  const secret = process.env["DJIWA_TRAVEL_SETTLEMENT_SECRET"];
  if (!rawUrl || !secret) throw new Error("Travel finance settlement is not configured");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Travel finance settlement URL must use HTTPS");
  return { url: ledgerStatusUrl(url.toString()), secret };
}

export async function fetchLedgerStatus(
  orderIds: string[],
): Promise<{ found: string[]; missing: string[] }> {
  const { url, secret } = configuredLedgerStatus();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-djiwa-travel-settlement-secret": secret,
    },
    body: JSON.stringify({ orderIds }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Travel finance ledger status is unavailable");
  return parseLedgerStatus(orderIds, await response.json());
}

/** Orders whose payment settled locally, newest first. */
export async function listSettledTravelOrders(
  days = 14,
  limit = 200,
): Promise<SettledTravelOrder[]> {
  const rows = await db.execute(sql`select o.id, o.public_order_code, o.total_amount, o.paid_at,
      i.provider_invoice_id, i.provider_transaction_id
    from public.customer_orders o
    join public.payment_intents i on i.order_id = o.id and i.provider = 'mayar'
    where o.paid_at is not null
      and o.paid_at > now() - (${days} * interval '1 day')
    order by o.paid_at desc
    limit ${limit}`);
  return (rows.rows as Array<Record<string, unknown>>).map((row) => ({
    orderId: String(row["id"]),
    orderNumber: String(row["public_order_code"] ?? ""),
    amount: Math.round(Number(row["total_amount"] ?? 0)),
    paidAtMs: new Date(String(row["paid_at"])).getTime(),
    ...(row["provider_invoice_id"] ? { invoiceId: String(row["provider_invoice_id"]) } : {}),
    ...(row["provider_transaction_id"]
      ? { transactionId: String(row["provider_transaction_id"]) }
      : {}),
  }));
}

export type ReconcileReport = {
  checked: number;
  missing: number;
  repaired: number;
  failed: number;
};

export async function reconcileTravelFinance(days = 14): Promise<ReconcileReport> {
  const orders = await listSettledTravelOrders(days);
  if (orders.length === 0) return { checked: 0, missing: 0, repaired: 0, failed: 0 };

  const status = await fetchLedgerStatus(orders.map((order) => order.orderId));
  const missing = new Set(status.missing);
  let repaired = 0;
  let failed = 0;
  for (const order of orders) {
    if (!missing.has(order.orderId)) continue;
    try {
      await postTravelFinanceSettlement(
        buildTravelFinanceGatewayPayload({
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          amount: order.amount,
          paidAt: order.paidAtMs,
          ...(order.invoiceId ? { invoiceId: order.invoiceId } : {}),
          ...(order.transactionId ? { transactionId: order.transactionId } : {}),
          customerName: null,
        }),
      );
      repaired += 1;
    } catch (error) {
      failed += 1;
      console.error("[travel] finance reconcile could not repost", {
        orderId: order.orderId,
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }
  if (missing.size > 0) {
    console.warn("[travel] finance reconcile found postings missing from the ledger", {
      checked: orders.length,
      missing: missing.size,
      repaired,
      failed,
    });
  }
  return { checked: orders.length, missing: missing.size, repaired, failed };
}
