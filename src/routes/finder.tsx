import { createFileRoute, redirect } from "@tanstack/react-router";

/** Keep old bookmarks and campaign links working after the eSIM Finder URL move. */
export const Route = createFileRoute("/finder")({
  beforeLoad: () => {
    throw redirect({ to: "/esim/finder", replace: true });
  },
});
