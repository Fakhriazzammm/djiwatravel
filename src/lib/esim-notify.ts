import type { OrderStatus } from "@/lib/orders";

/**
 * Notification preference, kept in localStorage so a customer who asked to be told is not asked
 * again on the next visit. Only the preference (never order data) is stored locally.
 */
export const ESIM_NOTIFY_KEY = "djiwa.notify-esim";
export const ESIM_NOTIFY_SW_URL = "/sw.js";

/** True when the order just became usable — the only moment worth interrupting someone for. */
export function shouldNotifyReady(previous: OrderStatus | null, next: OrderStatus): boolean {
  const usable = (status: OrderStatus) => status === "READY" || status === "INSTALLED";
  if (!usable(next)) return false;
  return previous === null ? false : !usable(previous);
}

/** Statuses where the customer is still waiting on us and notification makes sense. */
export function isWaitingForEsim(status: OrderStatus | undefined): boolean {
  return status === "PAID" || status === "PROVISIONING";
}

export function readyNotificationCopy(packageName?: string | null) {
  return {
    title: "eSIM kamu siap! ✨",
    body: `${packageName ?? "eSIM kamu"} sudah bisa dipasang. Buka Djiwa Travel untuk lihat QR code dan panduan.`,
  };
}

export function readNotifyPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ESIM_NOTIFY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeNotifyPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(ESIM_NOTIFY_KEY, "1");
    else window.localStorage.removeItem(ESIM_NOTIFY_KEY);
  } catch {
    // Private mode with storage disabled: the preference simply does not persist.
  }
}

export function notificationsSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Asks for permission (must be called from a user gesture) and registers the worker. */
export async function enableEsimNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return false;
  try {
    await navigator.serviceWorker.register(ESIM_NOTIFY_SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch {
    // Registration failed (insecure context, blocked storage): permission alone is not enough
    // to show a notification on Android, so report failure instead of pretending otherwise.
    return false;
  }
  return true;
}

/** Shows the "eSIM siap" notification through the service worker registered above. */
export async function notifyEsimReady(packageName?: string | null): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const copy = readyNotificationCopy(packageName);
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: "djiwa-notify",
      title: copy.title,
      body: copy.body,
      tag: "djiwa-esim-ready",
      url: "/my-esim",
    });
    return true;
  } catch {
    try {
      // Fallback for browsers that allow the constructor without a worker.
      new Notification(copy.title, { body: copy.body, icon: "/icon-192.png" });
      return true;
    } catch {
      return false;
    }
  }
}
