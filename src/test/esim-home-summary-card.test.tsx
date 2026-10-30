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
import type { Order } from "@/lib/orders";

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

function renderCard(orders: Order[] | null, onSearchPackages: () => void = vi.fn()) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <EsimHomeSummaryCard orders={orders} onSearchPackages={onSearchPackages} />,
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

  it("points customers without an eSIM to the shared search and the full catalog", async () => {
    const onSearchPackages = vi.fn();
    renderCard([], onSearchPackages);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "empty"),
    );
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cari paket eSIM/i }));
    expect(onSearchPackages).toHaveBeenCalledTimes(1);
    const catalogLinks = screen.getAllByRole("link", { name: /semua paket/i });
    expect(catalogLinks).toHaveLength(1);
    expect(catalogLinks[0]).toHaveAttribute("href", "/esim/finder");
  });

  it("lets a customer switch between purchased eSIMs with the page dots", async () => {
    renderCard([
      order({ packageName: "Jepang 5GB", usedGb: 2.5 }),
      order({ id: "order-2", packageName: "Singapura 5GB", locationCodes: ["SG"], usedGb: 1 }),
    ]);

    expect(await screen.findByRole("radiogroup", { name: "Pilih eSIM" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText(/Jepang/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Singapura/ }));
    expect(screen.getByText(/Singapura/)).toBeInTheDocument();
    expect(screen.getByText("4.0 GB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /lihat eSIM/i })).toHaveAttribute(
      "href",
      "/my-esim/order-2",
    );
  });

  it("moves between eSIMs with the arrow keys", async () => {
    renderCard([
      order({ usedGb: 2.5 }),
      order({ id: "order-2", packageName: "Singapura 5GB", locationCodes: ["SG"], usedGb: 1 }),
    ]);

    const group = await screen.findByRole("radiogroup", { name: "Pilih eSIM" });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByText("4.0 GB")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Singapura/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("prioritizes an unfinished payment over an already active eSIM", async () => {
    renderCard([
      order({ usedGb: 2.5 }),
      order({
        id: "order-2",
        packageName: "Singapura 5GB",
        locationCodes: ["SG"],
        status: "WAITING_PAYMENT",
        createdAt: NOW + 1_000,
      }),
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "pending"),
    );
    expect(screen.getByText("Menunggu bayar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lanjutkan pembayaran" })).toHaveAttribute(
      "href",
      "/order/order-2",
    );
  });

  it("shows measured quota on an active eSIM", async () => {
    renderCard([order({ usedGb: 2.5 })]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "active"),
    );
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("2.5 GB")).toBeInTheDocument();
    expect(screen.getByText("dari 5.0 GB · 50% tersisa")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Sisa kuota eSIM" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });

  it("states that usage is unavailable instead of inventing a percentage", async () => {
    renderCard([order()]);

    await waitFor(() =>
      expect(screen.getByText(/Pemakaian belum dilaporkan penyedia/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the real active-until date when the provider order carries one", async () => {
    const expiresAt = Date.now() + 5 * 86_400_000;
    const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(
      new Date(expiresAt),
    );
    renderCard([order({ usedGb: 2.5, expiresAt })]);

    expect(await screen.findByText(new RegExp(`Aktif hingga ${date}`))).toBeInTheDocument();
  });

  it("makes low quota visible and offers renewal", async () => {
    renderCard([order({ usedGb: 4.5 })]);

    await waitFor(() => expect(screen.getByText("Kuota menipis")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Beli paket lagi/ })).toBeInTheDocument();
  });

  it("offers installation for a ready eSIM", async () => {
    renderCard([order({ status: "READY" })]);
    await waitFor(() => expect(screen.getByText("Siap dipasang")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Pasang eSIM/ })).toHaveAttribute(
      "href",
      "/my-esim/order-1",
    );
  });

  it("offers status instead of another purchase for a provisioning failure", async () => {
    renderCard([order({ status: "PROVISIONING_FAILED" })]);
    await waitFor(() => expect(screen.getByText("eSIM perlu bantuan")).toBeInTheDocument());
    expect(screen.getByText("Butuh bantuan")).toBeInTheDocument();
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
    expect(screen.queryByRole("radiogroup", { name: "Pilih eSIM" })).not.toBeInTheDocument();
  });
});
