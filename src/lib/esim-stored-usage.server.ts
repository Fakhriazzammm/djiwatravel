import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import {
  normalizeStoredUsage,
  selectAuthorizedUsage,
  type EsimStoredUsage,
} from "./esim-stored-usage";

/**
 * Call only with provider order numbers obtained from an authenticated member read or a
 * validated guest-token read. No provider credential or order owner is accepted from the client.
 */
export async function readStoredUsageForOrders(
  orderNos: readonly (string | null | undefined)[],
): Promise<Map<string, EsimStoredUsage>> {
  const authorized = [...new Set(orderNos.filter((value): value is string => Boolean(value)))];
  if (!authorized.length) return new Map();
  const values = sql.join(
    authorized.map((value) => sql`${value}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    select distinct on (coalesce(payload->>'orderNo', payload->'content'->>'orderNo'))
      coalesce(payload->>'orderNo', payload->'content'->>'orderNo') as provider_order_no,
      data_usage_total_volume as total_bytes,
      data_usage_order_usage as used_bytes,
      data_usage_remain as remaining_bytes,
      coalesce(provider_event_at, synced_at, processed_at) as measured_at
    from public.provider_webhook_events
    where provider = 'esimaccess' and notify_type = 'DATA_USAGE'
      and coalesce(payload->>'orderNo', payload->'content'->>'orderNo') in (${values})
      and (data_usage_order_usage is not null or (data_usage_total_volume is not null and data_usage_remain is not null))
    order by coalesce(payload->>'orderNo', payload->'content'->>'orderNo'),
      coalesce(provider_event_at, synced_at, processed_at) desc nulls last, id desc
  `);
  const rows = (
    result.rows as Array<{
      provider_order_no: string;
      total_bytes: unknown;
      used_bytes: unknown;
      remaining_bytes: unknown;
      measured_at: unknown;
    }>
  ).flatMap((row) => {
    const usage = normalizeStoredUsage({
      totalBytes: row.total_bytes,
      usedBytes: row.used_bytes,
      remainingBytes: row.remaining_bytes,
      measuredAt: row.measured_at,
    });
    return usage ? [{ providerOrderNo: row.provider_order_no, usage }] : [];
  });
  return selectAuthorizedUsage(authorized, rows);
}
