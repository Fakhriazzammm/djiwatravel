import { useCallback, useEffect, useState } from "react";
import type { ShareLink } from "@/components/trip-share-sheet";
import { getTrip } from "@/lib/my-trips.fn";
import { itemPoint } from "@/lib/itinerary-map";
import type { TripCity } from "@/lib/trip-cities";
import { buildTripSummary, type TripSummary } from "@/lib/trip-summary";

const localTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

type Trip = {
  id: string;
  name: string;
  destination_name: string;
  departure_date?: string | null;
  return_date?: string | null;
  travelers_count?: number | string | null;
  primary_currency: string;
  total_budget_minor?: number | string | null;
};

/**
 * The trip data a trip chat needs outside the trip page (the /travo page): the same summary,
 * currency, budget and pin count the Ringkas page builds, loaded on its own and reloadable.
 */
export function useTripContext(tripId: string | null | undefined) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTrip>> | null>(null);
  const load = useCallback(async () => {
    if (!tripId) return null;
    const fresh = await getTrip({ data: { tripId } });
    setData(fresh);
    return fresh;
  }, [tripId]);
  useEffect(() => {
    setData(null);
    if (!tripId) return;
    void load().catch(() => undefined);
  }, [tripId, load]);

  if (!tripId || !data) return { ready: false as const, reload: load };
  const trip = data.trip as unknown as Trip;
  const currency = String(trip.primary_currency).trim();
  const budget = Number(trip.total_budget_minor ?? 0);
  const itinerary = data.itinerary as never as Record<string, unknown>[];
  const summary: TripSummary = buildTripSummary({
    today: localTodayKey(),
    name: trip.name,
    destination: trip.destination_name,
    departureDate: trip.departure_date ?? null,
    returnDate: trip.return_date ?? null,
    travelers: Number(trip.travelers_count) || 1,
    currency,
    cities: ((trip as { cities?: TripCity[] }).cities ?? []).map((c) => c.name),
    totalBudgetMinor: budget,
    itinerary,
    budget: data.budget as never,
    expenses: data.expenses as never,
    checklist: data.checklist as never,
    bookings: data.bookings as never,
  });
  return {
    ready: true as const,
    reload: load,
    trip,
    share: data.share as ShareLink,
    summary,
    currency,
    budgetMinor: budget,
    spentMinor: budget - Number(data.totals.remainingMinor ?? 0),
    categories: (data.budget as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: String(c.name),
    })),
    unpinned: itinerary.filter((item) => !itemPoint(item as never)).length,
  };
}
