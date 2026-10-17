import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { queryEsimAccessProfilesServer } from "./esim-access";
import { protectProviderProfile } from "./esim-profile-protection";

/**
 * eSIM Access only hands profiles and usage over through its own webhook, and that webhook has never
 * been registered on this deployment (`provider_webhook_events` stays empty), so a paid order sat on
 * PROVISIONING forever and the customer never saw a QR code. Pull from the query endpoint instead:
 * it returns the ICCID, the `ac` LPA string, the profile status, the activation expiry and the data
 * usage, which is everything the install flow and the order page need.
 */

type ProviderRecord = Record<string, unknown>;

/** The provider nests the list under an unknown key, so take the first array of records it returns. */
export function firstProviderRecordList(payload: unknown): ProviderRecord[] {
  const root =
    (payload as { obj?: unknown; data?: unknown } | null)?.obj ??
    (payload as { data?: unknown } | null)?.data ??
    payload;
  if (!root || typeof root !== "object") return [];
  for (const value of Object.values(root as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is ProviderRecord => Boolean(item) && typeof item === "object",
      );
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

function firstNumber(record: ProviderRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
      return Number(value);
  }
  return undefined;
}

/** Provider timestamps arrive as "2027-04-10T10:58:23+0000", which Date.parse reads fine. */
export function providerTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * `force` is for the scheduled sync, which must refresh status/usage/expiry on every run. The order
 * page keeps the cheap path: once an installable profile exists it is served from our own database.
 */
export async function refreshTravelOrderProvisioning(
  orderId: string,
  options: { force?: boolean } = {},
): Promise<{ status: string; installable: boolean }> {
  const provisioningRows = await db.execute(
    sql`select id, provider_order_no from public.esim_provisioning_orders where order_id = ${orderId}::uuid limit 1`,
  );
  const provisioning = provisioningRows.rows[0] as
    { id?: string; provider_order_no?: string | null } | undefined;
  const provisioningOrderId = String(provisioning?.id ?? "");
  const providerOrderNo = String(provisioning?.provider_order_no ?? "");
  if (!provisioningOrderId || !providerOrderNo)
    return { status: "NO_PROVIDER_ORDER", installable: false };

  const installed = await db.execute(
    sql`select id from public.esim_profiles where provisioning_order_id = ${provisioningOrderId}::uuid and installable = true limit 1`,
  );
  const alreadyInstallable = installed.rows.length > 0;
  if (alreadyInstallable && !options.force) return { status: "READY", installable: true };

  const payload = await queryEsimAccessProfilesServer({ orderNo: providerOrderNo });
  const records = firstProviderRecordList(payload);
  if (records.length === 0)
    return { status: alreadyInstallable ? "READY" : "PENDING", installable: alreadyInstallable };

  let installable = alreadyInstallable;
  let providerStatus: string | undefined;
  let expiresAtIso: string | null = null;
  for (const record of records) {
    const iccid = firstString(record, ["iccid", "ICCID"]);
    // The provider answers `ac` with a complete "LPA:1$smdp$code" string, so it doubles as the QR payload.
    const activationCode = firstString(record, ["ac", "activationCode", "qrCode"]);
    providerStatus = firstString(record, ["esimStatus", "smdpStatus"]) ?? providerStatus;
    expiresAtIso =
      providerTimestamp(firstString(record, ["expiredTime", "expirationTime"])) ?? expiresAtIso;
    if (!iccid || !activationCode) continue;
    const status = firstString(record, ["smdpStatus", "esimStatus", "status"]) ?? "RELEASED";
    const protectedProfile = protectProviderProfile(provisioningOrderId, {
      iccid,
      ac: activationCode,
      qrCode: activationCode,
      status,
    });
    await db.execute(sql`insert into public.esim_profiles(provisioning_order_id, iccid, activation_code_encrypted, qr_payload_encrypted, profile_status, installable, expires_at, provider_payload, updated_at)
      values (${provisioningOrderId}::uuid, ${protectedProfile.iccid}, ${protectedProfile.activationCodeEncrypted ?? null}, ${protectedProfile.qrPayloadEncrypted ?? null}, ${protectedProfile.status}, ${Boolean(protectedProfile.qrPayloadEncrypted)}, ${expiresAtIso}::timestamptz, ${JSON.stringify({ source: "provider_query", orderNo: providerOrderNo })}::jsonb, now())
      on conflict (iccid) do update set activation_code_encrypted = excluded.activation_code_encrypted, qr_payload_encrypted = excluded.qr_payload_encrypted, installable = excluded.installable, profile_status = excluded.profile_status, expires_at = coalesce(excluded.expires_at, public.esim_profiles.expires_at), provider_payload = excluded.provider_payload, updated_at = now()`);
    if (protectedProfile.qrPayloadEncrypted) installable = true;
  }

  if (providerStatus) {
    await db.execute(
      sql`update public.esim_provisioning_orders set provider_status = ${providerStatus}, updated_at = now() where id = ${provisioningOrderId}::uuid`,
    );
  }
  const usageRecord =
    records.find((record) => firstNumber(record, ["totalVolume"]) !== undefined) ??
    records[0] ??
    {};
  const totalVolume = firstNumber(usageRecord, ["totalVolume"]) ?? null;
  const orderUsage = firstNumber(usageRecord, ["orderUsage"]) ?? null;
  const remain =
    firstNumber(usageRecord, ["remain"]) ??
    (totalVolume !== null && orderUsage !== null ? Math.max(totalVolume - orderUsage, 0) : null);
  // A synthetic receipt records usage/validity where the provider webhook would have written it.
  const syncId = `sync:${providerOrderNo}:${new Date().toISOString().slice(0, 13)}`;
  await db.execute(sql`insert into public.provider_webhook_events(
      provider, notify_id, notify_type, event_fingerprint, payload, processed_at, synced_at,
      data_usage_total_volume, data_usage_order_usage, data_usage_remain,
      validity_usage_total_duration, validity_usage_expired_time
    ) values (
      'esimaccess', ${syncId}, 'DATA_USAGE', ${syncId}, ${JSON.stringify({ source: "provider_query", orderNo: providerOrderNo, providerStatus: providerStatus ?? null })}::jsonb, now(), now(),
      ${totalVolume}, ${orderUsage}, ${remain},
      ${firstNumber(usageRecord, ["totalDuration"]) ?? null}, ${expiresAtIso}::timestamptz
    ) on conflict do nothing`);

  if (!installable) return { status: "PENDING", installable: false };
  await db.execute(
    sql`update public.esim_provisioning_orders set status = 'READY', last_provisioning_error = null, updated_at = now() where id = ${provisioningOrderId}::uuid and status in ('PROVISIONING','PENDING')`,
  );
  await db.execute(
    sql`update public.customer_orders set status = 'READY', esim_activation_expires_at = coalesce(esim_activation_expires_at, ${expiresAtIso}::timestamptz, (select expires_at from public.esim_profiles where provisioning_order_id = ${provisioningOrderId}::uuid and installable = true order by created_at desc limit 1)), updated_at = now() where id = ${orderId}::uuid and status in ('PROVISIONING','PAYMENT_CONFIRMED','PROVISIONING_FAILED')`,
  );
  // The activation window is provider truth, so keep it on every run — an order that is already
  // READY is skipped by the transition above and would otherwise never learn its expiry.
  if (expiresAtIso) {
    await db.execute(
      sql`update public.customer_orders set esim_activation_expires_at = ${expiresAtIso}::timestamptz, updated_at = now() where id = ${orderId}::uuid and (esim_activation_expires_at is null or esim_activation_expires_at <> ${expiresAtIso}::timestamptz)`,
    );
  }
  return { status: "READY", installable: true };
}

/** Orders whose provider state should stay in sync even though the provider webhook never arrives. */
export async function activeProvisioningOrderIds(limit = 50): Promise<string[]> {
  const rows = await db.execute(sql`select o.id from public.customer_orders o
    join public.esim_provisioning_orders p on p.order_id = o.id
    where o.status in ('PROVISIONING','READY','INSTALLED','PROVISIONING_FAILED')
      and p.provider_order_no is not null
    order by o.updated_at desc
    limit ${limit}`);
  return (rows.rows as Array<{ id?: string }>).map((row) => String(row.id ?? "")).filter(Boolean);
}
