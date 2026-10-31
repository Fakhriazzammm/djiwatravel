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

  it("offers a destination rail that opens the shared package sheet (quick buy)", async () => {
    const onSelect = vi.fn();
    const rail = [
      { code: "JP", flag: "🇯🇵", nameId: "Jepang" },
      { code: "KR", flag: "🇰🇷", nameId: "Korea Selatan" },
    ];
    renderCard([], vi.fn(), { destinations: rail, onSelectDestination: onSelect });

    fireEvent.click(await screen.findByRole("button", { name: "Lihat paket eSIM Korea Selatan" }));
    expect(onSelect).toHaveBeenCalledWith(rail[1]);
    expect(screen.queryByRole("button", { name: /cari paket eSIM/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /semua paket/i })).toHaveLength(1);
  });

  it("falls back to the search button when the admin turns quick buy off", async () => {
    renderCard([], vi.fn(), {
      destinations: [{ code: "JP", flag: "🇯🇵", nameId: "Jepang" }],
      onSelectDestination: vi.fn(),
      config: { ...DEFAULT_HOME_ESIM_CONFIG, quickBuyEnabled: false },
    });
    expect(await screen.findByRole("button", { name: /cari paket eSIM/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pilih tujuan" })).not.toBeInTheDocument();
  });

  it("applies the admin low-quota threshold to the card", async () => {
    renderCard([order({ usedGb: 3.5 })], vi.fn(), {
      config: { ...DEFAULT_HOME_ESIM_CONFIG, lowQuotaPercent: 40 },
    });
    expect(await screen.findByText("Kuota menipis")).toBeInTheDocument();
  });

  it("shows the activation stepper for a pending order", async () => {
    renderCard([order({ status: "PROVISIONING" })]);
    expect(await screen.findByRole("list", { name: "Tahap pesanan eSIM" })).toBeInTheDocument();
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
