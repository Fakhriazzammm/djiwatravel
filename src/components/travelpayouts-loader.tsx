import { useEffect } from "react";
import { CONSENT_EVENT, analyticsConsentGranted } from "@/lib/cookie-consent";

/**
 * Loads the Travelpayouts partner script only after the visitor pressed "Setuju" (the script sets
 * its own cookies on outbound flight links). It loads once per page load, also for a visitor who
 * agreed earlier, and never while the choice is "essential".
 */
export function TravelpayoutsLoader({ src }: { src: string }) {
  useEffect(() => {
    const load = () => {
      if (!analyticsConsentGranted()) return;
      if (document.querySelector(`script[data-travelpayouts="1"]`)) return;
      const script = document.createElement("script");
      script.async = true;
      script.src = src;
      script.dataset["travelpayouts"] = "1";
      document.head.appendChild(script);
    };
    load();
    window.addEventListener(CONSENT_EVENT, load);
    return () => window.removeEventListener(CONSENT_EVENT, load);
  }, [src]);
  return null;
}
