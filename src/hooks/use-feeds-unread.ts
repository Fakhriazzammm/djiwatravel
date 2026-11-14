import { useEffect, useState } from "react";
import { getFeedsUnreadCount } from "@/lib/feeds.fn";

export const FEEDS_UNREAD_EVENT = "djiwa:feeds-unread-refresh";

/** The number on the Feeds dock's Aktivitas item: unread comments and decisions on the member's posts. */
export function useFeedsUnread(enabled = true): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let live = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      void getFeedsUnreadCount()
        .then((result) => live && setCount(result.unread))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(FEEDS_UNREAD_EVENT, load);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(FEEDS_UNREAD_EVENT, load);
    };
  }, [enabled]);
  return count;
}
