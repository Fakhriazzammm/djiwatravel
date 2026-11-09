import { createFileRoute } from "@tanstack/react-router";
import { loadShared, SharedItinerary, sharedHead } from "./share.$token";

// Same read-only itinerary; the handle names the member who shared it (the token is the capability).
export const Route = createFileRoute("/share/$handle/$token")({
  loader: loadShared,
  head: sharedHead,
  component: () => <SharedItinerary data={Route.useLoaderData()} />,
});
