import { createServerFn } from "@tanstack/react-start";

// RPC declarations. The Admin guard and database access stay in the server module.

export const getFlightsConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getFlightsConfigHandler } = await import("./flights.server");
  return getFlightsConfigHandler();
});

export const getAdminFlights = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminFlightsHandler } = await import("./flights.server");
  return getAdminFlightsHandler();
});

export const saveAdminFlights = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveFlightsConfigInput } = await import("./flights.server");
    return saveFlightsConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveFlightsConfigHandler } = await import("./flights.server");
    return saveFlightsConfigHandler({ data });
  });

export const getFlightsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getFlightsStatusHandler } = await import("./flights.server");
  return getFlightsStatusHandler();
});

export const searchFlightPlaces = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { searchFlightPlacesInput } = await import("./flights.server");
    return searchFlightPlacesInput(data);
  })
  .handler(async ({ data }) => {
    const { searchFlightPlacesHandler } = await import("./flights.server");
    return searchFlightPlacesHandler({ data });
  });

export const searchFlights = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { searchFlightsInput } = await import("./flights.server");
    return searchFlightsInput(data);
  })
  .handler(async ({ data }) => {
    const { searchFlightsHandler } = await import("./flights.server");
    return searchFlightsHandler({ data });
  });
