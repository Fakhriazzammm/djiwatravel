import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Implementations, the admin guard and the geocoder call stay server-only.

export const getItineraryMapConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getItineraryMapConfigHandler } = await import("./itinerary-map.server");
  return getItineraryMapConfigHandler();
});

export const searchPlaces = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./itinerary-map.server").searchPlacesInput>[0]) => {
      const { searchPlacesInput } = await import("./itinerary-map.server");
      return searchPlacesInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { searchPlacesHandler } = await import("./itinerary-map.server");
    return searchPlacesHandler({ data });
  });

export const getAdminItineraryMap = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminItineraryMapHandler } = await import("./itinerary-map.server");
  return getAdminItineraryMapHandler();
});

export const saveAdminItineraryMap = createServerFn({ method: "POST" })
  .validator(
    async (
      data: Parameters<typeof import("./itinerary-map.server").saveItineraryMapConfigInput>[0],
    ) => {
      const { saveItineraryMapConfigInput } = await import("./itinerary-map.server");
      return saveItineraryMapConfigInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { saveItineraryMapConfigHandler } = await import("./itinerary-map.server");
    return saveItineraryMapConfigHandler({ data });
  });
