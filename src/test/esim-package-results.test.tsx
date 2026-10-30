import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EsimPackageResults } from "@/components/esim-package-results";
import { searchHomeEsimCatalog } from "@/lib/esim-home-catalog.fn";

vi.mock("@/lib/esim-home-catalog.fn", () => ({ searchHomeEsimCatalog: vi.fn() }));

const japan = {
  packageCode: "JP-5GB-7D",
  name: "Japan 5GB 7Days",
  locationCodes: ["JP"],
  volumeBytes: 5_000_000_000,
  durationDays: 7,
  unlimited: false,
  priceIdr: 125_000,
  sellable: true,
};

function renderResults(query: string, onNavigate: () => void = vi.fn()) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <EsimPackageResults query={query} onNavigate={onNavigate} />,
  });
  const checkoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/checkout/$id",
    component: () => <div>checkout</div>,
  });
  const finderRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/esim/finder",
    component: () => <div>finder</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, checkoutRoute, finderRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("EsimPackageResults", () => {
  it("waits for a meaningful query before searching", () => {
    renderResults("J");
    expect(screen.queryByText("Paket eSIM")).not.toBeInTheDocument();
    expect(searchHomeEsimCatalog).not.toHaveBeenCalled();
  });

  it("lists matched packages and closes the parent dialog on navigation", async () => {
    vi.mocked(searchHomeEsimCatalog).mockResolvedValue({
      packages: [japan],
      stale: false,
      hasMore: false,
    });
    const onNavigate = vi.fn();
    renderResults("Jepang", onNavigate);

    const link = await screen.findByRole("link", { name: /Jepang · 5 GB/i });
    expect(searchHomeEsimCatalog).toHaveBeenCalledWith({ data: "Jepang" });
    expect(link).toHaveAttribute("href", "/checkout/JP-5GB-7D");
    expect(screen.getByText("7 hari · Rp125.000")).toBeInTheDocument();
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the catalog lookup fails", async () => {
    vi.mocked(searchHomeEsimCatalog)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ packages: [], stale: false, hasMore: false });
    renderResults("Jepang");

    expect(await screen.findByRole("alert")).toHaveTextContent("Daftar paket belum bisa dimuat");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Tidak ada paket eSIM yang cocok.")).toBeInTheDocument();
    expect(searchHomeEsimCatalog).toHaveBeenCalledTimes(2);
  });

  it("links to the full catalog when more packages match and discloses a stale catalog", async () => {
    vi.mocked(searchHomeEsimCatalog).mockResolvedValue({
      packages: [japan],
      stale: true,
      hasMore: true,
    });
    renderResults("Jepang");

    expect(await screen.findByRole("link", { name: /Lihat semua paket/i })).toHaveAttribute(
      "href",
      "/esim/finder",
    );
    expect(screen.getByText(/Harga katalog tersimpan/)).toBeInTheDocument();
  });
});
