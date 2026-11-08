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

/* Price alerts, save to trip and shared fares (signed-in members; owner from the session). */

export const createFlightAlert = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { createFlightAlertInput } = await import("./flight-features.server");
    return createFlightAlertInput(data);
  })
  .handler(async ({ data }) => {
    const { createFlightAlertHandler } = await import("./flight-features.server");
    return createFlightAlertHandler({ data });
  });

export const listFlightAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { listFlightAlertsHandler } = await import("./flight-features.server");
  return listFlightAlertsHandler();
});

export const deleteFlightAlert = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { deleteFlightAlertInput } = await import("./flight-features.server");
    return deleteFlightAlertInput(data);
  })
  .handler(async ({ data }) => {
    const { deleteFlightAlertHandler } = await import("./flight-features.server");
    return deleteFlightAlertHandler({ data });
  });

export const saveFlightToTrip = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveFlightToTripInput } = await import("./flight-features.server");
    return saveFlightToTripInput(data);
  })
  .handler(async ({ data }) => {
    const { saveFlightToTripHandler } = await import("./flight-features.server");
    return saveFlightToTripHandler({ data });
  });

export const createFlightShare = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { createFlightShareInput } = await import("./flight-features.server");
    return createFlightShareInput(data);
  })
  .handler(async ({ data }) => {
    const { createFlightShareHandler } = await import("./flight-features.server");
    return createFlightShareHandler({ data });
  });

export const getFlightShare = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { flightShareInput } = await import("./flight-features.server");
    return flightShareInput(data);
  })
  .handler(async ({ data }) => {
    const { getFlightShareHandler } = await import("./flight-features.server");
    return getFlightShareHandler({ data });
  });

export const voteFlightShare = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { voteFlightShareInput } = await import("./flight-features.server");
    return voteFlightShareInput(data);
  })
  .handler(async ({ data }) => {
    const { voteFlightShareHandler } = await import("./flight-features.server");
    return voteFlightShareHandler({ data });
  });

export const revokeFlightShares = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { revokeFlightSharesInput } = await import("./flight-features.server");
    return revokeFlightSharesInput(data);
  })
  .handler(async ({ data }) => {
    const { revokeFlightSharesHandler } = await import("./flight-features.server");
    return revokeFlightSharesHandler({ data });
  });

/* Admin only: Travelpayouts balance, payout and booking actions (read-only, cached server-side). */
export const getAdminFlightEarnings = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { flightEarningsInput } = await import("./flight-earnings.server");
    return flightEarningsInput(data);
  })
  .handler(async ({ data }) => {
    const { getFlightEarningsHandler } = await import("./flight-earnings.server");
    return getFlightEarningsHandler(data);
  });
