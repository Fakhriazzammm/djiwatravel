import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireBetterAuthUser } from "./customer-profile.server";
const refSchema = z.object({ order: z.string().trim().min(1).max(128) });
export type RefundEligibility = {
  eligible: boolean;
  reason: string;
  order_id: string;
  public_order_code: string;
  status: string;
  provisioning_started: boolean;
};
export async function getCustomerRefund(input: unknown) {
  const { order } = refSchema.parse(input);
  const user = await requireBetterAuthUser();
  const r = await pool.query(
    `select o.id,o.public_order_code,o.status, exists(select 1 from esim_provisioning_orders p where p.order_id=o.id) provisioning_started from customer_orders o where o.customer_auth_subject=$1 and (o.public_order_code=$2 or (o.id::text=$2)) limit 1`,
    [user.id, order],
  );
  if (!r.rows[0]) throw new Error("Pesanan tidak ditemukan");
  const x = r.rows[0];
  const started =
    Boolean(x.provisioning_started) ||
    ["PROVISIONING", "READY", "INSTALLED", "PROVISIONING_FAILED", "REFUNDED"].includes(x.status);
  let reason = "eligible_before_provisioning";
  if (started) reason = "provisioning_already_started";
  else if (!["PAYMENT_CONFIRMED", "ORDER_CREATED", "PAYMENT_PENDING"].includes(x.status))
    reason = "order_status_not_refundable";
  const eligible = !started && reason === "eligible_before_provisioning";
  return {
    eligible,
    reason,
    order_id: x.id,
    public_order_code: x.public_order_code,
    status: x.status,
    provisioning_started: started,
  } satisfies RefundEligibility;
}
export async function requestCustomerRefund(input: unknown) {
  const eligibility = await getCustomerRefund(input);
  return { eligibility, accepted: false, error: "provider_refund_workflow_unavailable" };
}
export const customerRefundContract = {
  provider:
    "Refund provider semantics are unverified; POST is fail-closed and performs no mutation",
} as const;
