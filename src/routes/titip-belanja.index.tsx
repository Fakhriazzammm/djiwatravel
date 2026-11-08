import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShopperHome } from "@/components/shopper/shopper-home";
import { RoutePendingScreen } from "@/components/route-loading";
import { getShopperCatalog, getShopperStatus } from "@/lib/personal-shopper.fn";
import {
  DEFAULT_SHOPPER_CONFIG,
  SHOPPER_COUNTRIES,
  normalizeShopperConfig,
} from "@/lib/personal-shopper";

export const Route = createFileRoute("/titip-belanja/")({
  validateSearch: (search: Record<string, unknown>): { cart?: boolean } =>
    search["cart"] === true || search["cart"] === "true" ? { cart: true } : {},
  head: () => ({
    meta: [
      { title: "Titip Belanja — Djiwa Travel" },
      {
        name: "description",
        content:
          "Titip belanja dari Uniqlo dan GU Jepang. Kami belikan di toko resmi dan kirim ke Indonesia.",
      },
    ],
  }),
  loader: async () => {
    const status = await getShopperStatus().catch(() => ({
      config: DEFAULT_SHOPPER_CONFIG,
      available: false,
    }));
    const config = normalizeShopperConfig(status.config);
    const first = SHOPPER_COUNTRIES.find((c) => config.enabled && config.countries[c.code])?.code;
    const catalog = first
      ? await getShopperCatalog({ data: { country: first } }).catch(() => null)
      : null;
    return {
      config,
      available: status.available,
      open: Boolean(catalog && catalog.open),
      products: catalog?.products ?? [],
      updatedAt: catalog?.updatedAt ?? null,
    };
  },
  pendingComponent: () => (
    <RoutePendingScreen label="Memuat Titip Belanja…" hint="Menyiapkan katalog toko untukmu." />
  ),
  component: ShopperPage,
});

function ShopperPage() {
  const data = Route.useLoaderData();
  const { cart } = Route.useSearch();
  const navigate = Route.useNavigate();
  const onCartHandled = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  return <ShopperHome data={data} cartRequested={Boolean(cart)} onCartHandled={onCartHandled} />;
}
