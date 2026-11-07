import { useEffect, useState } from "react";
import { getFlightsStatus } from "@/lib/flights.fn";
import { DEFAULT_FLIGHTS_CONFIG, normalizeFlightsConfig, type FlightsConfig } from "@/lib/flights";

export type FlightsStatus = { config: FlightsConfig; available: boolean };

// Optimistic until the first answer, so the Tiket entry points do not pop in after the page.
const FALLBACK: FlightsStatus = { config: DEFAULT_FLIGHTS_CONFIG, available: true };

let cached: FlightsStatus | null = null;
let inflight: Promise<FlightsStatus> | null = null;

function load(): Promise<FlightsStatus> {
  inflight ??= getFlightsStatus()
    .then((value) => {
      cached = {
        config: normalizeFlightsConfig(value.config),
        available: Boolean(value.available),
      };
      return cached;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The single client read of the Admin flight settings and whether the search can run (switch on
 * and a provider token on the server). Home, Explore and the tile all hide their Tiket entry
 * points from this, so an Admin change or a missing token never leaves a dead button.
 */
export function useFlightsStatus(): FlightsStatus {
  const [status, setStatus] = useState<FlightsStatus>(cached ?? FALLBACK);
  useEffect(() => {
    let live = true;
    void load().then((value) => {
      if (live) setStatus(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return status;
}
