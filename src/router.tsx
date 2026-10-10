import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { DefaultRoutePending } from "./components/route-loading";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Any navigation that waits on a loader must show loading feedback instead of leaving
    // the current page on screen looking frozen: wait 120 ms before showing it (no flash
    // on fast routes) and keep it up for at least 400 ms once shown (readable, not a blink).
    defaultPendingMs: 120,
    defaultPendingMinMs: 400,
    defaultPendingComponent: DefaultRoutePending,
  });

  return router;
};
