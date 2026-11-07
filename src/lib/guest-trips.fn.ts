import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Cookie reads, ownership and the Admin guard stay in the server module.

export const getGuestTripStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getGuestTripStatusHandler } = await import("./guest-trips.server");
  return getGuestTripStatusHandler();
});

export const claimGuestTrips = createServerFn({ method: "POST" }).handler(async () => {
  const { claimGuestTripsHandler } = await import("./guest-trips.server");
  return claimGuestTripsHandler();
});

export const getAdminGuestTrips = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminGuestTripsHandler } = await import("./guest-trips.server");
  return getAdminGuestTripsHandler();
});

export const saveAdminGuestTrips = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveGuestTripsConfigInput } = await import("./guest-trips.server");
    return saveGuestTripsConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveGuestTripsConfigHandler } = await import("./guest-trips.server");
    return saveGuestTripsConfigHandler({ data });
  });
