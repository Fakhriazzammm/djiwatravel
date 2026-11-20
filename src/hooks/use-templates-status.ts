import { useEffect, useState } from "react";
import { getTemplatesStatus } from "@/lib/trip-templates.fn";

export type TemplatesStatus = { enabled: boolean; showTile: boolean };

// Hidden until the server answers, so the tile never shows when Admin has switched it off.
let cached: TemplatesStatus | null = null;
let inflight: Promise<TemplatesStatus> | null = null;

function load(): Promise<TemplatesStatus> {
  inflight ??= getTemplatesStatus()
    .then((value) => {
      cached = { enabled: Boolean(value.enabled), showTile: Boolean(value.showTile) };
      return cached;
    })
    .catch(() => ({ enabled: false, showTile: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The single client read of the Admin template switch; Home and Explore hide the tile from it. */
export function useTemplatesStatus(): TemplatesStatus {
  const [status, setStatus] = useState<TemplatesStatus>(
    cached ?? { enabled: false, showTile: false },
  );
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
