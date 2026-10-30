import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

afterEach(cleanup);

describe("EsimHomeSummaryCard", () => {
  it("shows a busy state while the customer order list is loading", async () => {
    renderCard(null);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary-loading")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("esim-home-summary-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("offers a customer-friendly purchase CTA when no eSIM exists", async () => {
    renderCard([]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "empty"),
    );
    expect(screen.getByText("Internet siap sebelum berangkat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cari eSIM/ })).toHaveAttribute("href", "/esim/finder");
  });

  it("shows measured quota on an active eSIM", async () => {
    renderCard([order({ usedGb: 2.5 })]);

    await waitFor(() =>
      expect(screen.getByTestId("esim-home-summary")).toHaveAttribute("data-state", "active"),
    );
    expect(screen.getByText("2.5 GB")).toBeInTheDocument();
    expect(screen.getByText("dari 5.0 GB · 50% tersisa")).toBeInTheDocument();
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
