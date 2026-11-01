import { pool } from "../db/client.server";
import { getDestinationPackagesHandler } from "./destination-packages.server";
import { readHomeEsimConfig } from "./home-esim-config.server";
import { pickQuickPackages, type PackageSales } from "./home-quick-packages";

const SALES_WINDOW_DAYS = 90;

/** Paid-order counts per package code. Failure degrades to "no sales" rather than blocking Home. */
export async function readPackageSales(codes: readonly string[]): Promise<PackageSales> {
  if (codes.length === 0) return {};
  try {
    const result = await pool.query(
      `select i.provider_package_code as code, count(*)::int as sold
         from customer_order_items i
         join customer_orders o on o.id = i.order_id
        where i.provider_package_code = any($1::text[])
          and o.status in ('PAYMENT_CONFIRMED','PROVISIONING','READY')
          and o.created_at > now() - ($2::int * interval '1 day')
        group by i.provider_package_code`,
      [codes, SALES_WINDOW_DAYS],
    );
    return Object.fromEntries(result.rows.map((row) => [String(row.code), Number(row.sold)]));
  } catch {
    return {};
  }
}

/**
 * The two Home quick-buy packages for a destination: Admin pins first, then the automatic rule.
 * Display fields only; the checkout still re-prices and re-checks sellability on the server.
 */
export async function getHomeQuickPackagesHandler(code: string) {
  const data = await getDestinationPackagesHandler(code);
  if (!data) return null;
  const [sales, record] = await Promise.all([
    readPackageSales(data.packages.map((pkg) => pkg.packageCode)),
    readHomeEsimConfig(),
  ]);
  const pin = record.config.packageHighlights[data.destination.code.toUpperCase()] ?? {};
  return {
    destination: data.destination,
    picks: pickQuickPackages(data.packages, sales, pin),
    stale: data.stale,
    stockPending: data.stockPending,
  };
}
