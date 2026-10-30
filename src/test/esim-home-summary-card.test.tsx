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
import { EsimHomeSummaryCard } from "@/components/esim-home-summary-card";
import { searchHomeEsimCatalog } from "@/lib/esim-home-catalog.fn";
import type { Order } from "@/lib/orders";

vi.mock("@/lib/esim-home-catalog.fn", () => ({ searchHomeEsimCatalog: vi.fn() }));

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

function renderCard(orders: Order[] | null) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <EsimHomeSummaryCard orders={orders} />,
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

describe("EsimHomeSummaryCard", () => {
  it("shows a busy state while the customer order list is loading", async () => {
    renderCard(null);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary-loading")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("esim-home-summary-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("offers an in-card catalog search and a full catalog link when no eSIM exists", async () => {
    renderCard([]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "empty"),
    );
    expect(screen.getByRole("searchbox", { name: /cari paket eSIM/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /semua paket/i })).toHaveAttribute(
      "href",
      "/esim/finder",
    );
  });

  it("searches the catalog and opens the selected package", async () => {
    vi.mocked(searchHomeEsimCatalog).mockResolvedValue({
      packages: [
        {
          packageCode: "JP-5GB-7D",
          name: "Japan 5GB 7Days",
          locationCodes: ["JP"],
          volumeBytes: 5_000_000_000,
          durationDays: 7,
          unlimited: false,
          priceIdr: 125_000,
          sellable: true,
        },
      ],
      stale: true,
      hasMore: true,
    });
    renderCard([]);
    const search = await screen.findByRole("searchbox", { name: /cari paket eSIM/i });
    fireEvent.change(search, { target: { value: "Jepang" } });

    const result = await screen.findByRole("button", { name: /Jepang.*5 GB.*125.000/i });
    expect(searchHomeEsimCatalog).toHaveBeenCalledWith({ data: "Jepang" });
    expect(screen.getByRole("link", { name: "Lihat semua paket" })).toHaveAttribute(
      "href",
      "/esim/finder",
    );
    expect(screen.getByText(/Harga katalog tersimpan/)).toBeInTheDocument();
    fireEvent.click(result);
    expect(screen.getByRole("link", { name: /lihat detail paket/i })).toHaveAttribute(
      "href",
      "/checkout/JP-5GB-7D",
    );
  });

  it("allows retrying when the catalog is temporarily unavailable", async () => {
    vi.mocked(searchHomeEsimCatalog)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ packages: [], stale: false, hasMore: false });
    renderCard([]);
    const search = await screen.findByRole("searchbox", { name: /cari paket eSIM/i });
    fireEvent.change(search, { target: { value: "Jepang" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Daftar paket belum bisa dimuat");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Paket tidak ditemukan. Coba kata lain.")).toBeInTheDocument();
    expect(searchHomeEsimCatalog).toHaveBeenCalledTimes(2);
  });

  it("lets a customer switch between purchased eSIMs on the home card", async () => {
    renderCard([
      order({ packageName: "Jepang 5GB", usedGb: 2.5 }),
      order({ id: "order-2", packageName: "Singapura 5GB", locationCodes: ["SG"], usedGb: 1 }),
    ]);

    const select = await screen.findByRole("combobox", { name: "Pilih eSIM" });
    fireEvent.change(select, { target: { value: "order-2" } });
    expect(screen.getByText("Singapura 5GB", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("4.0 GB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /lihat eSIM/i })).toHaveAttribute(
      "href",
      "/my-esim/order-2",
    );
  });

  it("shows measured quota on an active eSIM", async () => {
    renderCard([order({ usedGb: 2.5 })]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "active"),
    );
    expect(screen.getByText("2.5 GB")).toBeInTheDocument();
    expect(screen.getByText("dari 5.0 GB · 50% tersisa")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Sisa kuota eSIM" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("makes low quota visible and offers renewal", async () => {
    renderCard([order({ usedGb: 4.5 })]);

    await waitFor(() => expect(screen.getByText("Kuota hampir habis")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Beli paket lagi/ })).toBeInTheDocument();
  });

  it("offers installation for a ready eSIM", async () => {
    renderCard([order({ status: "READY" })]);
    await waitFor(() => expect(screen.getByText("eSIM siap dipasang")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Pasang eSIM/ })).toHaveAttribute(
      "href",
      "/my-esim/order-1",
    );
  });

  it("offers status instead of another purchase for a provisioning failure", async () => {
    renderCard([order({ status: "PROVISIONING_FAILED" })]);
    await waitFor(() => expect(screen.getByText("eSIM perlu bantuan")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Lihat status/ })).toHaveAttribute(
      "href",
      "/order/order-1",
    );
    expect(screen.queryByRole("link", { name: /Beli paket lagi/ })).not.toBeInTheDocument();
  });

  it("lets a customer continue an unfinished payment", async () => {
    renderCard([order({ status: "WAITING_PAYMENT" })]);

    await waitFor(() => expect(screen.getByText("Lanjutkan pembayaran")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Lanjutkan pembayaran" })).toHaveAttribute(
      "href",
      "/order/order-1",
    );
  });

  it("links customers with multiple orders to the full eSIM list", async () => {
    renderCard([order(), order({ id: "order-2", status: "EXPIRED", createdAt: NOW - 1_000 })]);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Lihat semua eSIM" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Lihat semua eSIM" })).toHaveAttribute(
      "href",
      "/my-esim",
    );
  });
});
