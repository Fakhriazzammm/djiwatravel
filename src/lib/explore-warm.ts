import { createServerFn } from "@tanstack/react-start";

import { getResellerCatalog } from "./reseller-catalog-cache";

/**
 * Warms the catalogue cache once per app boot so opening Explore — or any destination page —
 * usually finds an already-populated cache instead of paying for a cold provider read.
 *
 * Read-only and idempotent: the cache itself single-flights and rate-limits provider reads, so
 * repeated calls cost nothing until its TTL lapses.
 */
export const warmResellerCatalog = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const catalog = await getResellerCatalog();
    return { warmed: true, packages: catalog.packages.length };
  } catch {
    return { warmed: false, packages: 0 };
  }
});
