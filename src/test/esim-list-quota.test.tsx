import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EsimCard } from "@/routes/my-esim.index";
import type { Order } from "@/lib/orders";

const baseOrder: Order = {
  id: "order-1",
  packageId: "JP",
  packageName: "Jepang",
  locationCodes: ["JP"],
  volumeBytes: 5_000_000_000,
  durationDays: 7,
  amount: 42000,
  method: "qris",
  status: "INSTALLED",
  createdAt: 1,
};

function renderOrder(order: Order) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <EsimCard o={order} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("My eSIM quota", () => {
  it("does not invent a full quota when the provider has not reported usage", async () => {
    renderOrder(baseOrder);
    await waitFor(() =>
      expect(screen.getByText(/pemakaian belum dilaporkan penyedia/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/5\.0 GB tersisa/)).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("uses the measured provider volume and usage", async () => {
    renderOrder({ ...baseOrder, usageVolumeBytes: 10_000_000_000, usedGb: 7 });
    await waitFor(() => expect(screen.getByText("3.0 GB tersisa")).toBeInTheDocument());
    expect(screen.getByText("30%")).toBeInTheDocument();
  });
});
