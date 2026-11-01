import { useEffect, useState } from "react";

/**
 * Unread customer-notification count for the Home bell. Only fetched for signed-in customers; any
 * failure resolves to 0 so a flaky notifications API never breaks Home. Refreshes when the tab
 * becomes visible again so the badge does not go stale.
 */
export function useUnreadNotifications(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/customer-notifications?limit=1&unreadOnly=true", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { unread_count?: unknown };
        const value = Number(body.unread_count);
        if (!cancelled && Number.isFinite(value) && value >= 0) setCount(Math.floor(value));
      } catch {
        // Keep the last known count.
      }
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return count;
}
