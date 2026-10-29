import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

// The public catalog page was folded into Explore. The old URLs must keep working as
// redirects (bookmarks, shared links, search results) instead of 404ing or rendering a
// second package list, and Explore's loader must not be needed for this test.
vi.mock("@/lib/reseller-catalog-cache", () => ({
  getResellerCatalog: vi.fn(async () => ({
    packages: [],
    syncedAt: null,
    stale: false,
    source: "cache",
  })),
  clearResellerCatalogCache: vi.fn(),
}));

function buildRouter(initialEntry: string) {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

describe("retired catalog URLs", () => {
  it("redirects /catalog to /explore", async () => {
    const router = buildRouter("/catalog");
    await router.load();
    expect(router.state.location.pathname).toBe("/explore");
  });

  it("redirects the /live-catalog alias to /explore too", async () => {
    const router = buildRouter("/live-catalog");
    await router.load();
    expect(router.state.location.pathname).toBe("/explore");
  });

  it("redirects the legacy /finder URL to the eSIM Finder route", async () => {
    const router = buildRouter("/finder");
    await router.load();
    expect(router.state.location.pathname).toBe("/esim/finder");
  });
});
