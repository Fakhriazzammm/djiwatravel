import { useEffect, useState } from "react";
import { getChatUnread } from "@/lib/shopper-chat.fn";

/** Unread Titip Belanja chat messages for the signed-in customer; 0 when signed out. */
export function useChatUnread(intervalMs = 45_000) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      getChatUnread()
        .then((r) => alive && setUnread(r.unread))
        .catch(() => alive && setUnread(0));
    };
    load();
    const timer = window.setInterval(load, intervalMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [intervalMs]);
  return unread;
}
