import {
  createNoArgServerFnProxy,
  createServerFnProxy,
} from "./server-fn-proxy";
import type * as Server from "./destination-availability.server";

export type {
  AvailabilitySource,
  DestinationAvailability,
  HomeDestinations,
} from "./destination-availability.server";

const listableDestinationsRpc = createServerFnProxy<
  number | undefined,
  Awaited<ReturnType<typeof Server.getListableDestinations>>
>("GET", async (deadlineMs) => {
  const { getListableDestinations } = await import("./destination-availability.server");
  return getListableDestinations(deadlineMs);
});

const sellableDestinationCodesRpc = createServerFnProxy<
  number | undefined,
  Awaited<ReturnType<typeof Server.getSellableDestinationCodes>>
>("GET", async (deadlineMs) => {
  const { getSellableDestinationCodes } = await import("./destination-availability.server");
  return getSellableDestinationCodes(deadlineMs);
});

export const getListableDestinations = (deadlineMs?: number) =>
  listableDestinationsRpc({ data: deadlineMs });

export const getSellableDestinationCodes = (deadlineMs?: number) =>
  sellableDestinationCodesRpc({ data: deadlineMs });

export const getHomeDestinationFeed = createNoArgServerFnProxy("GET", async () => {
  const { getHomeDestinations } = await import("./destination-availability.server");
  return getHomeDestinations();
});
