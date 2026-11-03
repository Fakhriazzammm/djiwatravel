import { createFileRoute, redirect } from "@tanstack/react-router";

/** Mode perjalanan now lives on the trip's Ringkas page; old links and bookmarks land there. */
export const Route = createFileRoute("/my-trips/$tripId/travel")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/my-trips/$tripId", params: { tripId: params.tripId }, replace: true });
  },
});
