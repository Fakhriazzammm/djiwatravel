import { useEffect, useState } from "react";
import { getEsimShareState } from "@/lib/esim-share.fn";
import type { ShareLinkSummary } from "@/lib/esim-share";

/** The owner's share link when it is claimed, or null (not shared, not claimed, or not loadable). */
export function useClaimedShareLink(orderId: string, enabled: boolean, refreshKey = 0) {
  const [link, setLink] = useState<ShareLinkSummary | null>(null);
  useEffect(() => {
    if (!enabled) {
      setLink(null);
      return;
    }
    let live = true;
    void getEsimShareState({ data: { orderId } })
      .then((state) => live && setLink(state.link?.claimed ? state.link : null))
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, [orderId, enabled, refreshKey]);
  return link;
}
