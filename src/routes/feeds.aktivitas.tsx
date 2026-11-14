import { createFileRoute, redirect } from "@tanstack/react-router";

/** Keep old bookmarks working after the customer page moved under Explore. */
export const Route = createFileRoute("/feeds/aktivitas")({
  beforeLoad: () => {
    throw redirect({ to: "/explore/aktivitas", replace: true });
  },
});
