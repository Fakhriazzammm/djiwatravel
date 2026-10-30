import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// RPC declarations must be visible to the client compiler; implementations stay server-only.
export const getHomeDestinationFeed = createServerFn({ method: "GET" }).handler(async () => {
  const { getHomeDestinationFeedHandler } = await import("./destination-availability.server");
  return getHomeDestinationFeedHandler();
});

const getListableDestinationsRpc = createServerFn({ method: "GET" })
  .validator(z.number().int().min(0).max(8500))
  .handler(async ({ data }) => {
    const { getListableDestinations } = await import("./destination-availability.server");
    return getListableDestinations(data);
  });

export function getListableDestinations(deadlineMs = 2000) {
  return getListableDestinationsRpc({ data: deadlineMs });
}

const getSellableDestinationCodesRpc = createServerFn({ method: "GET" })
  .validator(z.number().int().min(0).max(8500))
  .handler(async ({ data }) => {
    const { getSellableDestinationCodes } = await import("./destination-availability.server");
    return getSellableDestinationCodes(data);
  });

export function getSellableDestinationCodes(deadlineMs = 2000) {
  return getSellableDestinationCodesRpc({ data: deadlineMs });
}
