import { useEffect } from "react";
import { toast } from "sonner";
import { usePwaConfig } from "@/hooks/use-pwa";
import {
  registerAppServiceWorker,
  reloadOnControllerChange,
  syncOfflineCachePolicy,
} from "@/lib/pwa-client";

/**
 * Mounts once at the root: registers the single service worker, offers "Perbarui" when a new
 * build is waiting, and forwards the Admin offline-cache kill switch to the worker.
 */
export function PwaRuntime() {
  const { config, loaded } = usePwaConfig();

  useEffect(() => {
    reloadOnControllerChange();
    void registerAppServiceWorker((activate) => {
      toast("Versi baru tersedia", {
        id: "pwa-update",
        duration: Infinity,
        description: "Muat ulang untuk memakai pembaruan terbaru.",
        action: { label: "Perbarui", onClick: activate },
      });
    });
  }, []);

  useEffect(() => {
    // Wait for the real policy: the defaults must never re-enable a switched-off cache.
    if (loaded) void syncOfflineCachePolicy(config.offlineCacheEnabled);
  }, [loaded, config.offlineCacheEnabled]);

  return null;
}
