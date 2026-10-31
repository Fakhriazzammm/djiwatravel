import { useEffect, useState } from "react";
import { getHomeEsimConfig } from "@/lib/home-esim-config.fn";
import {
  DEFAULT_HOME_ESIM_CONFIG,
  normalizeHomeEsimConfig,
  type HomeEsimConfig,
} from "@/lib/home-esim-config";

let cached: HomeEsimConfig | null = null;
let inflight: Promise<HomeEsimConfig> | null = null;

function load(): Promise<HomeEsimConfig> {
  inflight ??= getHomeEsimConfig()
    .then((value) => {
      cached = normalizeHomeEsimConfig(value);
      return cached;
    })
    .catch(() => DEFAULT_HOME_ESIM_CONFIG)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The single client read of the Admin-controlled Home eSIM settings, shared by Home, the eSIM
 * list and the eSIM detail so the low-quota threshold is identical everywhere. Starts from the
 * safe defaults and revalidates on every mount, so an Admin change shows on the next visit.
 */
export function useHomeEsimConfig(): HomeEsimConfig {
  const [config, setConfig] = useState<HomeEsimConfig>(cached ?? DEFAULT_HOME_ESIM_CONFIG);
  useEffect(() => {
    let live = true;
    void load().then((value) => {
      if (live) setConfig(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return config;
}
