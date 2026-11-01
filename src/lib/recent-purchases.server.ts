import { pool } from "../db/client.server";
import { destinations } from "./catalog";
import { getHomeQuickPackagesHandler } from "./home-quick-packages.server";
import { readHomeEsimConfig } from "./home-esim-config.server";
import { packageDataLabel } from "./package-copy";
import {
  RECENT_WINDOW_HOURS,
  maskName,
  packageSizeLabel,
  type RecentPurchase,
  type RecentPurchaseFeed,
} from "./recent-purchases";

const CACHE_MS = 60_000;
let cache: { at: number; items: RecentPurchase[] } | null = null;

const PAID = ["PAYMENT_CONFIRMED", "PROVISIONING", "READY", "INSTALLED"];

/** Real paid single-country orders, newest first. Amounts, order codes and identities stay out. */
async function readRealPurchases(): Promise<RecentPurchase[]> {
  try {
    const result = await pool.query(
      `select o.id as order_id,
              coalesce(o.paid_at, o.created_at) as at,
              i.provider_package_code as code,
              p.location_codes, p.volume_bytes, p.duration_days,
              cp.display_name
         from customer_orders o
         join customer_order_items i on i.order_id = o.id
         left join esim_provider_packages p on p.package_code = i.provider_package_code
         left join customer_profiles cp on cp.auth_user_id = o.customer_auth_subject
        where o.status = any($1::text[])
          and coalesce(o.paid_at, o.created_at) > now() - ($2::int * interval '1 hour')
        order by coalesce(o.paid_at, o.created_at) desc
        limit 12`,
      [PAID, RECENT_WINDOW_HOURS],
    );
    const items: RecentPurchase[] = [];
    for (const row of result.rows) {
      const locations = Array.isArray(row.location_codes) ? (row.location_codes as unknown[]) : [];
      const code = locations.length === 1 ? String(locations[0]).toUpperCase() : "";
      if (!code || !destinations.some((d) => d.code.toUpperCase() === code)) continue;
      const label = packageSizeLabel(
        row.volume_bytes === null ? null : Number(row.volume_bytes),
        row.duration_days === null ? null : Number(row.duration_days),
      );
      if (!label) continue;
      items.push({
        key: `r-${String(row.order_id).slice(0, 8)}-${String(row.code)}`,
        kind: "real",
        maskedName: maskName(row.display_name as string | null),
        destinationCode: code,
        packageLabel: label,
        minutesAgo: Math.max(0, Math.round((Date.now() - new Date(String(row.at)).getTime()) / 60_000)),
        priceIdr: null,
      });
      if (items.length >= 6) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Honest fallback: each popular destination's current Terlaris package from the live catalogue. */
async function readPopularPackages(): Promise<RecentPurchase[]> {
  const popular = destinations.filter((d) => d.popular).slice(0, 4);
  const picks = await Promise.all(
    popular.map(async (destination) => {
      try {
        const data = await getHomeQuickPackagesHandler(destination.code);
        const pick = data?.picks.find((item) => item.tag === "best_seller") ?? data?.picks[0];
        if (!pick) return null;
        const label = packageDataLabel(pick.pkg).replace(/ data$/, "");
        return {
          key: `p-${destination.code}-${pick.pkg.packageCode}`,
          kind: "popular" as const,
          maskedName: null,
          destinationCode: destination.code.toUpperCase(),
          packageLabel: `${label} · ${pick.pkg.durationDays} Hari`,
          minutesAgo: null,
          priceIdr: pick.pkg.priceIdr,
        };
      } catch {
        return null;
      }
    }),
  );
  return picks.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getRecentPurchasesHandler(): Promise<RecentPurchaseFeed> {
  const { config } = await readHomeEsimConfig();
  if (!config.recentPurchasesEnabled) return { enabled: false, items: [] };
  if (cache && Date.now() - cache.at < CACHE_MS) return { enabled: true, items: cache.items };
  const real = await readRealPurchases();
  const items = real.length > 0 ? real : await readPopularPackages();
  cache = { at: Date.now(), items };
  return { enabled: true, items };
}
