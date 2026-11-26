import { getFlightsStatusHandler, readMonthOffers } from "./flights.server";
import {
  PUBLIC_FLIGHT_ROUTES,
  publicFlightMonths,
  selectPublicFares,
  type PublicFlightFares,
} from "./public-flight-fares";

export async function publicFlightFaresEnabled() {
  const status = await getFlightsStatusHandler();
  return status.available && status.config.guestSearch;
}

export async function getPublicFlightFares(slug?: string): Promise<PublicFlightFares[]> {
  if (!(await publicFlightFaresEnabled())) return [];
  const routes = slug
    ? PUBLIC_FLIGHT_ROUTES.filter((route) => route.slug === slug)
    : PUBLIC_FLIGHT_ROUTES;
  const months = publicFlightMonths(new Date());
  return Promise.all(
    routes.map(async (route) => {
      const reads = await Promise.allSettled(
        months.map((month) => readMonthOffers(route.origin, route.destination, month)),
      );
      const snapshots = reads.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      return { route, fares: selectPublicFares(snapshots, Date.now()) };
    }),
  );
}
