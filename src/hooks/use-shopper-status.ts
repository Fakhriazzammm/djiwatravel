import { useEffect, useState } from "react";
import { getShopperStatus } from "@/lib/personal-shopper.fn";
import {
  DEFAULT_SHOPPER_CONFIG,
  normalizeShopperConfig,
  type ShopperConfig,
} from "@/lib/personal-shopper";

export type ShopperStatus = { config: ShopperConfig; available: boolean };

// Not available until the server says so: the Titip Belanja tile keeps its waitlist meanwhile.
const FALLBACK: ShopperStatus = { config: DEFAULT_SHOPPER_CONFIG, available: false };

let cached: ShopperStatus | null = null;
let inflight: Promise<ShopperStatus> | null = null;

function load(): Promise<ShopperStatus> {
  inflight ??= getShopperStatus()
    .then((value) => {
      cached = {
        config: normalizeShopperConfig(value.config),
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

/** The single client read of the Admin Titip Belanja settings; the Home tile opens the shop only when on. */
export function useShopperStatus(): ShopperStatus {
  const [status, setStatus] = useState<ShopperStatus>(cached ?? FALLBACK);
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
