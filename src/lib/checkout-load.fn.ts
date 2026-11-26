import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { notFound } from "@tanstack/react-router";
import { getResellerCatalog, isCatalogPriceCurrent } from "@/lib/reseller-catalog-cache";
import { loadLiveResellerPackage } from "@/lib/esim-access-catalog";
import { resolveCheckoutPackage } from "@/lib/checkout-package";
import { getSellabilityState } from "@/lib/sellability.server";
import { toViewPackage } from "@/lib/package-view";

/** One reader for the full-page checkout and the Home bottom sheet. */
export const loadCheckout = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(1).max(160))
  .handler(async ({ data }) => {
    // Price the page from the provider's current catalogue, so what the customer sees is what the
    // order is created with (and what the provider will accept).
    const live = await loadLiveResellerPackage(data).catch(() => null);
    const catalog = live ? null : await getResellerCatalog();
    const pkg = live ?? (catalog && resolveCheckoutPackage(catalog.packages, data));
    if (!pkg) throw notFound();
    const sellability = await getSellabilityState([pkg]);
    // Display fields only: the full record carries our cost basis (lib/package-view.ts).
    return {
      priceCurrent: Boolean(live || (catalog && isCatalogPriceCurrent(catalog.syncedAt))),
      pkg: toViewPackage(
        pkg,
        pkg.available !== false && !sellability.hidden.has(pkg.packageCode),
        pkg.available !== false && sellability.preorderable.has(pkg.packageCode),
      ),
      djiwaPayEnabled:
        Buffer.byteLength(
          process.env["DJIWA_TRAVEL_WALLET_PAYMENT_SECRET"]?.trim() ?? "",
          "utf8",
        ) >= 32,
    };
  });
