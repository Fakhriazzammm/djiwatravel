import { createServerFn } from "@tanstack/react-start";

import { getResellerCatalog } from "./reseller-catalog-cache";

/**
 * Warms the server-side caches once per app boot so opening Explore — or any destination page —
 * usually finds an already-populated catalogue, and so catalogue prices are normalised with the
 * operator's active price rules instead of the reseller defaults.
 *
 * Read-only and idempotent: the catalogue cache single-flights and rate-limits provider reads, and
 * the rule snapshot is a small table. Each warm-up is isolated so a failure in one never hides the
 * other or affects the page that triggered it.
 */
export const warmResellerCatalog = createServerFn({ method: "POST" }).handler(async () => {
  let packages = 0;
  let rules = 0;
  try {
    const catalog = await getResellerCatalog();
    packages = catalog.packages.length;
  } catch {
    // A catalogue warm-up failure must never affect the page: the routes load it themselves.
  }
  try {
    const { refreshPriceRuleSnapshot } = await import("./price-rules.server");
    rules = (await refreshPriceRuleSnapshot()).length;
  } catch {
    // Without rules the reseller defaults still apply, which is the pre-workspace behaviour.
  }
  return { warmed: packages > 0, packages, rules };
});
