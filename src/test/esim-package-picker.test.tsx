import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EsimPackagePicker } from "@/components/esim-package-picker";
import type { ViewPackage } from "@/lib/package-view";

const GB = 1_073_741_824;
const pkg = (
  code: string,
  gb: number,
  days: number,
  price: number,
  sellable = true,
): ViewPackage => ({
  packageCode: code,
  name: code,
  locationCodes: ["JP"],
  volumeBytes: gb * GB,
  unlimited: false,
  durationDays: days,
  priceIdr: price,
  sellable,
});

function renderPicker(packages: ViewPackage[]) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <EsimPackagePicker packages={packages} />,
  });
  const checkout = createRoute({
    getParentRoute: () => root,
    path: "/checkout/$id",
    component: () => <div>checkout</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, checkout]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("EsimPackagePicker", () => {
  const list = [pkg("a", 1, 3, 50_000), pkg("b", 3, 7, 90_000), pkg("c", 10, 15, 220_000)];

  it("preselects the best-value package and links to checkout with its price", async () => {
    renderPicker(list);
    const cta = await screen.findByRole("link", { name: /Lanjut bayar/ });
    expect(cta).toHaveAttribute("href", "/checkout/b");
    expect(cta).toHaveTextContent("Rp90.000");
  });

  it("switches trip length and updates the checkout target", async () => {
    renderPicker(list);
    fireEvent.click(await screen.findByRole("tab", { name: "8–15 hari" }));
    expect(await screen.findByRole("link", { name: /Lanjut bayar/ })).toHaveAttribute(
      "href",
      "/checkout/c",
    );
  });

  it("never offers checkout for a sold-out package", async () => {
    renderPicker([pkg("a", 1, 3, 50_000, false)]);
    expect(await screen.findByText(/Belum ada paket yang bisa dibeli/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lanjut bayar/ })).not.toBeInTheDocument();
  });
});
