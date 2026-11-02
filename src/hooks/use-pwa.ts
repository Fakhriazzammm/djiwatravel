import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PWA_CONFIG, type PwaConfig } from "@/lib/pwa-config";
import { getPwaConfig } from "@/lib/pwa.fn";
import {
  SNOOZE_KEY,
  installMode,
  isIosSafari,
  snoozeUntil,
  type InstallMode,
} from "@/lib/pwa-install";
import { currentPlatform, isStandaloneDisplay, trackPwa } from "@/lib/pwa-client";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let wired = false;
let installedNow = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    trackPwa("app_installed");
    listeners.forEach((fn) => fn());
  });
}
// Register at module load: `beforeinstallprompt` can fire before any component mounts.
wire();

function readSnooze(): number | null {
  try {
    const value = Number(window.localStorage.getItem(SNOOZE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

let cachedConfig: PwaConfig | null = null;
export function usePwaConfig() {
  const [state, setState] = useState<{
    config: PwaConfig;
    pushPublicKey: string | null;
    loaded: boolean;
  }>({
    config: cachedConfig ?? DEFAULT_PWA_CONFIG,
    pushPublicKey: null,
    loaded: false,
  });
  useEffect(() => {
    let live = true;
    void getPwaConfig()
      .then((value) => {
        cachedConfig = value.config;
        if (live) setState({ ...value, loaded: true });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** Install state + actions for the Home / Profile / order-success install card. */
export function usePwaInstall() {
  const { config } = usePwaConfig();
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setSnoozedUntil(readSnooze());
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const platform = mounted ? currentPlatform() : "other";
  const standalone = mounted ? isStandaloneDisplay() || installedNow : false;
  const mode: InstallMode = mounted
    ? installMode({
        config,
        platform,
        standalone,
        canPrompt: deferred !== null,
        iosGuideAvailable: isIosSafari(navigator.userAgent),
        snoozedUntil,
      })
    : null;

  const dismiss = useCallback(() => {
    const until = snoozeUntil(config.snoozeDays);
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(until));
    } catch {
      // Storage blocked: the card simply comes back next visit.
    }
    setSnoozedUntil(until);
    trackPwa("install_dismissed");
  }, [config.snoozeDays]);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    const event = deferred;
    deferred = null;
    await event.prompt();
    const choice = await event.userChoice;
    trackPwa(choice.outcome === "accepted" ? "install_accepted" : "install_dismissed");
    listeners.forEach((fn) => fn());
    return choice.outcome;
  }, []);

  return { config, mode, platform, standalone, install, dismiss };
}
