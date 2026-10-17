import {
  RouterProvider,
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DefaultRoutePending } from "@/components/route-loading";

afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Builds a router with the same pending options as `src/router.tsx` and two pages: one
 * that loads instantly and one whose loader the test resolves by hand. This is the
 * regression guard for the frozen-navigation bug: a route that waits on a loader must
 * show the pending screen, and a route that does not wait must never flash it.
 */
function buildRouter() {
  const slowLoader = deferred();
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="home-page">home</div>,
  });
  const slowRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/slow",
    loader: () => slowLoader.promise,
    component: () => <div data-testid="slow-page">slow</div>,
  });
  const fastRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/fast",
    loader: () => undefined,
    component: () => <div data-testid="fast-page">fast</div>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, slowRoute, fastRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultPendingMs: 120,
    defaultPendingMinMs: 400,
    defaultPendingComponent: DefaultRoutePending,
  });

  return { router, slowLoader };
}

describe("route navigation pending state", () => {
  it("shows the pending screen while a loader is still resolving", async () => {
    const { router, slowLoader: loader } = buildRouter();
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByTestId("home-page")).toBeInTheDocument());

    // The app registers its real route tree globally, so the test-only paths need an
    // escape hatch here; the router instance itself is real.
    void router.navigate({ to: "/slow" as never });

    await waitFor(() => expect(screen.getByTestId("route-pending")).toBeInTheDocument());
    expect(screen.getByText("Memuat data…")).toBeInTheDocument();

    loader.resolve();
    await waitFor(() => expect(screen.getByTestId("slow-page")).toBeInTheDocument());
  });

  it("never flashes the pending screen for a route that loads instantly", async () => {
    const { router } = buildRouter();
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByTestId("home-page")).toBeInTheDocument());

    await router.navigate({ to: "/fast" as never });

    expect(screen.getByTestId("fast-page")).toBeInTheDocument();
    expect(screen.queryByTestId("route-pending")).not.toBeInTheDocument();
  });
});
