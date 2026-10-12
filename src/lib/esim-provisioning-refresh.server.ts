import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { queryEsimAccessProfilesServer } from "./esim-access";
import { protectProviderProfile } from "./esim-profile-protection";

/**
 * eSIM Access only hands the issued profile over through a webhook, and the webhook has never been
 * registered on this deployment (`provider_webhook_events` stays empty), so a paid order sat on
 * PROVISIONING forever and the customer never saw a QR code. Pull the profile instead: the query
 * endpoint returns the ICCID plus the `ac` LPA string, which is everything the install flow needs.
 */

type ProviderRecord = Record<string, unknown>;

/** The provider nests the list under an unknown key, so take the first array of records it returns. */
export function firstProviderRecordList(payload: unknown): ProviderRecord[] {
  const root = (payload as { obj?: unknown; data?: unknown } | null)?.obj
    ?? (payload as { data?: unknown } | null)?.data
    ?? payload;
  if (!root || typeof root !== "object") return [];
  for (const value of Object.values(root as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      return value.filter((item): item is ProviderRecord => Boolean(item) && typeof item === "object");
    }
  }
  return [];
}

function firstString(record: ProviderRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export async function refreshTravelOrderProvisioning(orderId: string): Promise<{ status: string; installable: boolean }> {
  const provisioningRows = await db.execute(sql`select id, provider_order_no from public.esim_provisioning_orders where order_id = ${orderId}::uuid limit 1`);
  const provisioning = provisioningRows.rows[0] as { id?: string; provider_order_no?: string | null } | undefined;
  const provisioningOrderId = String(provisioning?.id ?? "");
  const providerOrderNo = String(provisioning?.provider_order_no ?? "");
  if (!provisioningOrderId || !providerOrderNo) return { status: "NO_PROVIDER_ORDER", installable: false };

  const installed = await db.execute(sql`select id from public.esim_profiles where provisioning_order_id = ${provisioningOrderId}::uuid and installable = true limit 1`);
  if (installed.rows.length > 0) return { status: "READY", installable: true };

  const payload = await queryEsimAccessProfilesServer({ orderNo: providerOrderNo });
  const records = firstProviderRecordList(payload);
  if (records.length === 0) return { status: "PENDING", installable: false };

  let installable = false;
  for (const record of records) {
    const iccid = firstString(record, ["iccid", "ICCID"]);
    // The provider answers `ac` with a complete "LPA:1$smdp$code" string, so it doubles as the QR payload.
    const activationCode = firstString(record, ["ac", "activationCode", "qrCode"]);
    if (!iccid || !activationCode) continue;
    const status = firstString(record, ["smdpStatus", "esimStatus", "status"]) ?? "RELEASED";
    const protectedProfile = protectProviderProfile(provisioningOrderId, {
      iccid,
      ac: activationCode,
      qrCode: activationCode,
      status,
    });
    await db.execute(sql`insert into public.esim_profiles(provisioning_order_id, iccid, activation_code_encrypted, qr_payload_encrypted, profile_status, installable, provider_payload, updated_at)
      values (${provisioningOrderId}::uuid, ${protectedProfile.iccid}, ${protectedProfile.activationCodeEncrypted ?? null}, ${protectedProfile.qrPayloadEncrypted ?? null}, ${protectedProfile.status}, ${Boolean(protectedProfile.qrPayloadEncrypted)}, ${JSON.stringify({ source: "provider_query", orderNo: providerOrderNo })}::jsonb, now())
      on conflict (iccid) do update set activation_code_encrypted = excluded.activation_code_encrypted, qr_payload_encrypted = excluded.qr_payload_encrypted, installable = excluded.installable, profile_status = excluded.profile_status, provider_payload = excluded.provider_payload, updated_at = now()`);
    if (protectedProfile.qrPayloadEncrypted) installable = true;
  }
  if (!installable) return { status: "PENDING", installable: false };

  await db.execute(sql`update public.esim_provisioning_orders set status = 'READY', last_provisioning_error = null, updated_at = now() where id = ${provisioningOrderId}::uuid and status in ('PROVISIONING','PENDING')`);
  await db.execute(sql`update public.customer_orders set status = 'READY', esim_activation_expires_at = coalesce(esim_activation_expires_at, (select expires_at from public.esim_profiles where provisioning_order_id = ${provisioningOrderId}::uuid and installable = true order by created_at desc limit 1)), updated_at = now() where id = ${orderId}::uuid and status in ('PROVISIONING','PAYMENT_CONFIRMED','PROVISIONING_FAILED')`);
  return { status: "READY", installable: true };
}
