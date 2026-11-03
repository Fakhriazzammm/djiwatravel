import { createServerFn } from "@tanstack/react-start";

// RPC declaration. The provider call, rate limit and Admin switch stay server-only.
export const getTripWeather = createServerFn({ method: "POST" })
  .validator(
    async (data: Parameters<typeof import("./trip-weather.server").tripWeatherInput>[0]) => {
      const { tripWeatherInput } = await import("./trip-weather.server");
      return tripWeatherInput(data);
    },
  )
  .handler(async ({ data }) => {
    const { tripWeatherHandler } = await import("./trip-weather.server");
    return tripWeatherHandler({ data });
  });
