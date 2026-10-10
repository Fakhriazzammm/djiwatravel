import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The public package catalog page was folded into Explore: both listed the same
 * packages, and Explore already adds destination search. The URL is kept as a
 * redirect so bookmarks, shared links and search results do not dead-end.
 */
export const Route = createFileRoute("/catalog")({
  beforeLoad: () => {
    throw redirect({ to: "/explore", replace: true });
  },
});
