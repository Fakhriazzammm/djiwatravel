import { useEffect, useState } from "react";
import { getFeedsStatus } from "@/lib/feeds.fn";
import { FEEDS_DISABLED_STATUS, type FeedsStatus } from "@/lib/feeds";

let cached: FeedsStatus | null = null;
let cachedAt = 0;
const FRESH_MS = 60_000;
let inflight: Promise<FeedsStatus> | null = null;

function load(): Promise<FeedsStatus> {
  if (cached && Date.now() - cachedAt < FRESH_MS) return Promise.resolve(cached);
  inflight ??= getFeedsStatus()
    .then((value) => {
      cachedAt = Date.now();
      return (cached = value);
    })
    .catch(() => FEEDS_DISABLED_STATUS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The single client read of the Admin Feeds switch and the viewer's state. `loaded` stays false
 * until the server has answered, so callers never flash the old layout for a moment.
 */
export function useFeedsStatus(): FeedsStatus & { loaded: boolean } {
  const [status, setStatus] = useState<FeedsStatus | null>(cached);
  useEffect(() => {
    let live = true;
    void load().then((value) => {
      if (live) setStatus(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return { ...(status ?? FEEDS_DISABLED_STATUS), loaded: status !== null };
}
