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
