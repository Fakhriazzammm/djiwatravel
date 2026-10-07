import type { ResellerOrderRecord } from "./reseller-repository";

export interface PostgresOrderRow {
  id: string;
  status: string;
  total_amount: number | string;
  currency_code: string;
  idempotency_key: string;
  package_code: string;
  created_at: Date | string;
  price_snapshot: Record<string, number | string> | null;
  provider_order_no: string | null;
  provider_status: string | null;
  expires_at: Date | string | null;
}

export function mapPostgresOrderRow(row: PostgresOrderRow): ResellerOrderRecord {
  const totalAmount = Number(row.total_amount);
  const createdAt =
    row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(row.created_at);
  if (!Number.isFinite(totalAmount) || totalAmount < 0)
    throw new Error("Invalid persisted order amount");
  if (!Number.isFinite(createdAt)) throw new Error("Invalid persisted order timestamp");
  return {
    id: row.id,
    status: row.status as ResellerOrderRecord["status"],
    totalAmount,
    currency: row.currency_code as "IDR",
    idempotencyKey: row.idempotency_key,
    packageCode: row.package_code,
    createdAt,
    ...(row.price_snapshot == null ? {} : { priceSnapshot: row.price_snapshot }),
    ...(row.provider_order_no == null ? {} : { providerOrderNo: row.provider_order_no }),
    ...(row.provider_status == null ? {} : { providerStatus: row.provider_status }),
    ...(row.expires_at == null
      ? {}
      : {
          expiresAt:
            row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(row.expires_at),
        }),
  };
}
