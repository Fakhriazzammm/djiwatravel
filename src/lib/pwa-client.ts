import { getPwaConfig } from "./pwa.fn";
import { detectPlatform } from "./pwa-install";
import type { PwaEventName } from "./pwa-config";

export const SW_URL = "/sw.js";

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function currentPlatform() {
  if (typeof navigator === "undefined") return "other" as const;
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

/** Fire-and-forget funnel event; analytics must never affect the app. */
export function trackPwa(name: PwaEventName): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      name,
      platform: currentPlatform(),
      standalone: isStandaloneDisplay(),
    });
    if (
      !navigator.sendBeacon?.("/api/pwa-events", new Blob([body], { type: "application/json" }))
    ) {
      void fetch("/api/pwa-events", { method: "POST", body, keepalive: true }).catch(
        () => undefined,
      );
    }
  } catch {
    // ignore
  }
}

/** Registers the single service worker and reports a waiting update through `onUpdate`. */
export async function registerAppServiceWorker(
  onUpdate: (activate: () => void) => void,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    const offerUpdate = (worker: ServiceWorker | null) => {
      if (!worker || !navigator.serviceWorker.controller) return;
      onUpdate(() => worker.postMessage({ type: "SKIP_WAITING" }));
    };
    if (registration.waiting) offerUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") offerUpdate(worker);
      });
    });
    // Check for a new build whenever the app returns to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
    });
    return registration;
  } catch {
    return null;
  }
}

/** Reload exactly once after a new worker takes over, so the page matches the new build. */
export function reloadOnControllerChange(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  let reloaded = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    trackPwa("sw_update_applied");
    window.location.reload();
  });
}

/** Pushes the Admin kill switch to the worker (false = purge caches and stop caching). */
export async function syncOfflineCachePolicy(enabled: boolean): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "djiwa-config", offlineCache: enabled });
  } catch {
    // ignore
  }
}

export { getPwaConfig };

// ---- Web Push -------------------------------------------------------------------------------

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Must run from a user gesture. Subscribes this device and stores it against the signed-in account. */
export async function enablePush(publicKey: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    const json = subscription.toJSON();
    const response = await fetch("/api/customer-notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", endpoint: json.endpoint, keys: json.keys ?? {} }),
    });
    if (!response.ok) return false;
    trackPwa("push_enabled");
    return true;
  } catch {
    return false;
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/customer-notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate", endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // ignore
  }
}

export async function pushSubscribed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Home-screen badge for unread notifications (no-op where the Badging API is missing). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    // ignore
  }
}
