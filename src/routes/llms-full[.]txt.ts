import { createFileRoute } from "@tanstack/react-router";

import { buildGuidesFullText } from "@/lib/guide-feed";
import { readGeoConfig } from "@/lib/geo-config.server";
import { getPublicFlightFares } from "@/lib/public-flight-fares.server";
import { buildPublicPricesText } from "@/lib/public-prices-text";
import { isCatalogPriceCurrent } from "@/lib/reseller-catalog-cache";
import { getPublicEsimCatalog } from "@/lib/seo-indexability.server";
import { getShippingStatusHandler } from "@/lib/shipping.server";
import { travelGuides } from "@/lib/travel-guides";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { config } = await readGeoConfig();
        if (!config.aiSearchEnabled) {
          return new Response("Not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          });
        }
        const [flights, esim, shipping] = await Promise.all([
          getPublicFlightFares().catch(() => []),
          getPublicEsimCatalog(5_000).catch(() => null),
          getShippingStatusHandler().catch(() => null),
        ]);
        const freshEsim =
          esim?.syncedAt != null && isCatalogPriceCurrent(esim.syncedAt)
            ? { syncedAt: esim.syncedAt, packages: esim.plans.map(({ package: plan }) => plan) }
            : null;
        const shippingRate = shipping?.available
          ? { priceIdr: shipping.config.countries.JP.rateIdrPerKg, minKg: shipping.config.minKg }
          : null;
        const prices = buildPublicPricesText(flights, freshEsim, shippingRate);
        return new Response(prices + "\n" + buildGuidesFullText(travelGuides), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
