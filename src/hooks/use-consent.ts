import { useCallback, useEffect, useState } from "react";
import { getMyConsent, saveMyConsent, snoozeConsentPrompt } from "@/lib/consent.fn";
import type { ConsentPurpose, ConsentSource, ConsentState } from "@/lib/consent";

/**
 * The signed-in member's data consents, read once and shared by the prompt, Profil > Privasi and
 * the feature gates. `state` is null until the server answered, and stays null when signed out.
 */
let cached: ConsentState | null = null;
let loadedOnce = false;
let inflight: Promise<ConsentState | null> | null = null;
const listeners = new Set<() => void>();

const publish = (next: ConsentState | null) => {
  cached = next;
  loadedOnce = true;
  listeners.forEach((listener) => listener());
};

function load(force = false): Promise<ConsentState | null> {
  if (loadedOnce && !force) return Promise.resolve(cached);
  inflight ??= getMyConsent()
    .then((value) => {
      publish(value);
      return value;
    })
    .catch(() => {
      publish(null);
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** After sign-in or sign-out the previous member's answers must not linger. */
export function resetConsentCache() {
  cached = null;
  loadedOnce = false;
  listeners.forEach((listener) => listener());
}

export function useConsent(enabled = true) {
  const [, tick] = useState(0);
  useEffect(() => {
    const listener = () => tick((n) => n + 1);
    listeners.add(listener);
    if (enabled) void load();
    return () => {
      listeners.delete(listener);
    };
  }, [enabled]);

  const save = useCallback(
    async (purposes: Partial<Record<ConsentPurpose, boolean>>, source: ConsentSource) => {
      const next = await saveMyConsent({ data: { purposes, source } });
      publish(next);
      return next;
    },
    [],
  );
  const snooze = useCallback(async () => {
    const next = await snoozeConsentPrompt();
    publish(next);
    return next;
  }, []);
  const refresh = useCallback(() => load(true), []);

  return { state: cached, loaded: loadedOnce, save, snooze, refresh };
}
