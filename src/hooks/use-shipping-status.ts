import { useEffect, useState } from "react";
import { getShippingStatus } from "@/lib/shipping.fn";
import { DEFAULT_PUBLIC_SHIPPING_CONFIG, type PublicShippingConfig } from "@/lib/shipping";

export type ShippingStatusView = { config: PublicShippingConfig; available: boolean };

// Not available until the server says so: the Kirim Barang tile keeps its waitlist meanwhile.
const FALLBACK: ShippingStatusView = { config: DEFAULT_PUBLIC_SHIPPING_CONFIG, available: false };

let cached: ShippingStatusView | null = null;
let inflight: Promise<ShippingStatusView> | null = null;

function load(): Promise<ShippingStatusView> {
  inflight ??= getShippingStatus()
    .then((value) => {
      cached = {
        config: value.config,
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

/** The single client read of the Admin Kirim Barang settings; the Home tile opens the flow only when on. */
export function useShippingStatus(): ShippingStatusView {
  const [status, setStatus] = useState<ShippingStatusView>(cached ?? FALLBACK);
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
