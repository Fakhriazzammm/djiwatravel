import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_HOME_ESIM_CONFIG } from "@/lib/home-esim-config";
import { EsimHomeSummaryCard } from "@/components/esim-home-summary-card";
import { getHomeQuickPackages } from "@/lib/home-quick-packages.fn";
import { loadCheckout } from "@/lib/checkout-load.fn";
import type { Order } from "@/lib/orders";

vi.mock("@/lib/home-quick-packages.fn", () => ({ getHomeQuickPackages: vi.fn() }));
vi.mock("@/lib/checkout-load.fn", () => ({ loadCheckout: vi.fn() }));
vi.mock("@/components/checkout-form", () => ({
  CheckoutForm: ({ pkg, variant }: { pkg: { packageCode: string }; variant?: string }) => (
    <div>
      checkout {pkg.packageCode} {variant}
    </div>
  ),
}));

const mockedQuick = vi.mocked(getHomeQuickPackages);
const mockedCheckout = vi.mocked(loadCheckout);

const viewPkg = (packageCode: string, gb: number, days: number, priceIdr: number) => ({
  packageCode,
  name: packageCode,
  locationCodes: ["JP"],
  volumeBytes: gb * 1_000_000_000,
  unlimited: false,
  durationDays: days,
  priceIdr,
  sellable: true,
});

const NOW = Date.parse("2026-10-31T00:00:00Z");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    packageId: "JP-5GB-7D",
    packageName: "Jepang 5GB",
    locationCodes: ["JP"],
    durationDays: 7,
    volumeBytes: 5_000_000_000,
    amount: 125_000,
    method: "qris",
    status: "INSTALLED",
    createdAt: NOW,
    ...overrides,
  };
}

function renderCard(
  orders: Order[] | null,
  onSearchPackages: () => void = vi.fn(),
  extra: Partial<React.ComponentProps<typeof EsimHomeSummaryCard>> = {},
) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <EsimHomeSummaryCard orders={orders} onSearchPackages={onSearchPackages} {...extra} />
    ),
  });
  const finderRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/esim/finder",
    component: () => <div>finder</div>,
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/my-esim",
    component: () => <div>list</div>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/my-esim/$id",
    component: () => <div>detail</div>,
  });
  const orderRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/order/$id",
    component: () => <div>order</div>,
  });
  const checkoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/checkout/$id",
    component: () => <div>checkout</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      homeRoute,
      finderRoute,
      listRoute,
      detailRoute,
      orderRoute,
      checkoutRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const RAIL = [
  { code: "JP", flag: "🇯🇵", nameId: "Jepang" },
  { code: "KR", flag: "🇰🇷", nameId: "Korea Selatan" },
];

describe("EsimHomeSummaryCard", () => {
  it("shows a busy state while the customer order list is loading", async () => {
    renderCard(null);
    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary-loading")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("esim-home-summary-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("opens the shared Home search and links to the full catalog for customers without an eSIM", async () => {
    const onSearchPackages = vi.fn();
    renderCard([], onSearchPackages);
    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "empty"),
    );
    fireEvent.click(screen.getByRole("button", { name: /cari paket eSIM/i }));
    expect(onSearchPackages).toHaveBeenCalledTimes(1);
    const catalogLinks = screen.getAllByRole("link", { name: /semua paket/i });
    expect(catalogLinks).toHaveLength(1);
    expect(catalogLinks[0]).toHaveAttribute("href", "/esim/finder");
    expect(screen.queryByTestId("esim-wallet-rail")).not.toBeInTheDocument();
  });

  it("keeps the destination chooser above the eSIM rail for customers who own eSIMs", async () => {
    renderCard([order({ usedGb: 2.5 })], vi.fn(), { destinations: RAIL });
    const chooser = await screen.findByRole("group", { name: "Pilih tujuan" });
    const rail = screen.getByTestId("esim-wallet-rail");
    expect(chooser.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "has-esim");
  });

  it("orders cards active, ready, then expired, with a stand-alone flag and no flag box", async () => {
    renderCard([
      order({ id: "old", status: "EXPIRED", locationCodes: ["TH"], createdAt: NOW + 3 }),
      order({ id: "ready", status: "READY", locationCodes: ["JP"], createdAt: NOW + 2 }),
      order({ id: "live", usedGb: 1, locationCodes: ["SG"], createdAt: NOW + 1 }),
    ]);
    const cards = await screen.findAllByTestId("esim-wallet-card");
    expect(cards.map((card) => card.getAttribute("data-kind"))).toEqual([
      "active",
      "ready",
      "expired",
    ]);
  });

  it("shows remaining data, a progress bar, used data and days left on an active eSIM", async () => {
    const expiresAt = Date.now() + 3 * 86_400_000 - 60_000;
    renderCard([order({ usedGb: 2.4, expiresAt })]);
    expect(await screen.findByText("2.6 GB")).toBeInTheDocument();
    expect(screen.getByText("tersisa dari 5.0 GB")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Sisa kuota eSIM/ })).toHaveAttribute(
      "aria-valuenow",
      "52",
    );
    expect(screen.getByText("Terpakai 2.4 GB")).toBeInTheDocument();
    expect(screen.getByText("Sisa 3 hari")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lihat eSIM/ })).toHaveAttribute(
      "href",
      "/my-esim/order-1",
    );
  });

  it("states that usage is unavailable instead of inventing a percentage", async () => {
    renderCard([order()]);
    expect(await screen.findByText(/pemakaian belum dilaporkan/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("makes low quota visible and offers renewal through checkout", async () => {
    renderCard([order({ usedGb: 4.5 })]);
    expect(await screen.findByText("Kuota menipis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Beli paket lagi/ })).toBeInTheDocument();
  });

  it("applies the admin low-quota threshold to the card", async () => {
    renderCard([order({ usedGb: 3.5 })], vi.fn(), {
      config: { ...DEFAULT_HOME_ESIM_CONFIG, lowQuotaPercent: 40 },
    });
    expect(await screen.findByText("Kuota menipis")).toBeInTheDocument();
  });

  it("offers installation for a ready eSIM", async () => {
    renderCard([order({ status: "READY" })]);
    expect(await screen.findByText("Siap dipasang")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pasang eSIM/ })).toHaveAttribute(
      "href",
      "/my-esim/order-1",
    );
  });

  it("keeps expired eSIMs in the card and lets the customer buy again", async () => {
    mockedCheckout.mockResolvedValue({
      pkg: viewPkg("JP-5GB-7D", 5, 7, 125_000),
      djiwaPayEnabled: false,
    });
    renderCard([order({ status: "INSTALLED", expiresAt: Date.now() - 86_400_000 })]);
    expect(await screen.findByTestId("esim-home-summary-badge")).toHaveTextContent(
      "Sudah kedaluwarsa",
    );
    expect(screen.queryByText("Menunggu bayar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Beli lagi/ }));
    expect(mockedCheckout).toHaveBeenCalledWith({ data: "JP-5GB-7D" });
    expect(await screen.findByText("checkout JP-5GB-7D sheet")).toBeInTheDocument();
  });

  it("prioritizes nothing over the customer's choice: unfinished payments link to the order", async () => {
    renderCard([
      order({ usedGb: 2.5 }),
      order({
        id: "order-2",
        locationCodes: ["SG"],
        status: "WAITING_PAYMENT",
        createdAt: NOW + 1_000,
      }),
    ]);
    expect(await screen.findByText("Menunggu bayar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lanjutkan pembayaran/ })).toHaveAttribute(
      "href",
      "/order/order-2",
    );
  });

  it("offers status instead of another purchase for a provisioning failure", async () => {
    renderCard([order({ status: "PROVISIONING_FAILED" })]);
    expect(await screen.findByText("eSIM perlu bantuan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lihat status/ })).toHaveAttribute(
      "href",
      "/order/order-1",
    );
    expect(screen.queryByRole("button", { name: /Beli paket lagi/ })).not.toBeInTheDocument();
  });

  it("shows the activation stepper for a pending order", async () => {
    renderCard([order({ status: "PROVISIONING" })]);
    expect(await screen.findByRole("list", { name: "Tahap pesanan eSIM" })).toBeInTheDocument();
  });

  it("pages through several eSIMs with page dots and links to the full list", async () => {
    renderCard([
      order({ usedGb: 2.5 }),
      order({ id: "order-2", locationCodes: ["SG"], usedGb: 1, createdAt: NOW - 1 }),
    ]);
    expect(await screen.findByRole("radiogroup", { name: "Pilih eSIM" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Lihat semua eSIM" })).toHaveAttribute(
      "href",
      "/my-esim",
    );
  });

  it("opens Terlaris and Best Deal inside the card when a destination chip is tapped", async () => {
    mockedQuick.mockResolvedValue({
      destination: { code: "JP" },
      picks: [
        { tag: "best_seller", pkg: viewPkg("JP-3GB-15D", 3, 15, 89_000), pinned: false },
        { tag: "best_deal", pkg: viewPkg("JP-10GB-30D", 10, 30, 149_000), pinned: false },
      ],
      stale: false,
      stockPending: false,
    } as never);
    const onSelect = vi.fn();
    renderCard([], vi.fn(), { destinations: RAIL, onSelectDestination: onSelect });

    const chip = await screen.findByRole("button", { name: "Lihat paket eSIM Jepang" });
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith(RAIL[0]);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(mockedQuick).toHaveBeenCalledWith({ data: "JP" });

    expect(await screen.findByText("🔥 Terlaris")).toBeInTheDocument();
    expect(screen.getByText("💰 Best Deal")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    // Terlaris is preselected.
    expect(screen.getByRole("radio", { name: /Terlaris/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Beli sekarang/ })).toHaveTextContent("Rp89.000");

    fireEvent.click(screen.getByRole("radio", { name: /Best Deal/ }));
    expect(screen.getByRole("button", { name: /Beli sekarang/ })).toHaveTextContent("Rp149.000");

    // Tapping the same chip closes the panel again.
    fireEvent.click(chip);
    expect(screen.queryByTestId("esim-quick-buy-panel")).not.toBeInTheDocument();
  });

  it("opens checkout as a bottom sheet for the chosen package", async () => {
    mockedQuick.mockResolvedValue({
      destination: { code: "JP" },
      picks: [{ tag: "best_seller", pkg: viewPkg("JP-3GB-15D", 3, 15, 89_000), pinned: false }],
      stale: false,
      stockPending: false,
    } as never);
    mockedCheckout.mockResolvedValue({
      pkg: viewPkg("JP-3GB-15D", 3, 15, 89_000),
      djiwaPayEnabled: false,
    });
    renderCard([], vi.fn(), { destinations: RAIL });

    fireEvent.click(await screen.findByRole("button", { name: "Lihat paket eSIM Jepang" }));
    fireEvent.click(await screen.findByRole("button", { name: /Beli sekarang/ }));
    expect(mockedCheckout).toHaveBeenCalledWith({ data: "JP-3GB-15D" });
    expect(await screen.findByText("checkout JP-3GB-15D sheet")).toBeInTheDocument();
  });

  it("offers a retry when the quick packages cannot load, without creating an order", async () => {
    mockedQuick.mockRejectedValueOnce(new Error("down"));
    renderCard([], vi.fn(), { destinations: RAIL });
    fireEvent.click(await screen.findByRole("button", { name: "Lihat paket eSIM Jepang" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tidak ada pesanan yang dibuat");
    expect(mockedCheckout).not.toHaveBeenCalled();
  });

  it("does not load packages or open checkout in the Admin preview", async () => {
    renderCard([], vi.fn(), { destinations: RAIL, readOnly: true });
    fireEvent.click(await screen.findByRole("button", { name: "Lihat paket eSIM Jepang" }));
    expect(mockedQuick).not.toHaveBeenCalled();
    expect(screen.queryByTestId("esim-quick-buy-panel")).not.toBeInTheDocument();
  });

  it("falls back to the search button when the admin turns quick buy off", async () => {
    renderCard([], vi.fn(), {
      destinations: RAIL,
      config: { ...DEFAULT_HOME_ESIM_CONFIG, quickBuyEnabled: false },
    });
    expect(await screen.findByRole("button", { name: /cari paket eSIM/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pilih tujuan" })).not.toBeInTheDocument();
  });

  it("keeps every pass light: no dark surface classes on the card", async () => {
    const source = readFileSync("src/components/esim-home-summary-card.tsx", "utf8");
    expect(source).not.toMatch(
      /bg-(primary|foreground|black|slate-[6-9]|zinc-[6-9]|neutral-[6-9])/,
    );
    expect(source).not.toMatch(/bg-\[#(0|1)[0-9a-f]{5}\]/i);
    expect(source).not.toMatch(/text-primary-foreground/);
  });

  it("shows the saved departure countdown on a ready eSIM", async () => {
    const target = new Date();
    target.setDate(target.getDate() + 12);
    const value = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    window.localStorage.clear();
    const { writeDepartureDate } = await import("@/lib/travel-checklist-store");
    writeDepartureDate("order-1", value);
    renderCard([order({ status: "READY" })]);
    expect(await screen.findByTestId("esim-home-departure")).toHaveTextContent("H-12");
    window.localStorage.clear();
  });

  it("lets the customer flip the empty-state eSIM illustration without leaving the card", async () => {
    renderCard([]);
    const chip = await screen.findByRole("button", { name: "Putar ilustrasi eSIM" });
    expect(chip.querySelector("img")).toHaveAttribute("alt", "");
    fireEvent.click(chip);
    expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "empty");
  });
});
