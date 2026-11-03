import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { springIos, springSnappy } from "@/lib/motion";

const DISMISS_KEY = "djiwa:calendar-banner-dismissed";
const DISMISS_DAYS = 7;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Small prompt on the Agenda for travelers who have not linked Google Calendar. Connecting returns
 * to this page. It stays out of the way: nothing shows while the status is unknown, when Calendar
 * is not configured, or for a week after it is dismissed.
 */
export function CalendarConnectBanner() {
  const [show, setShow] = useState(false);
  const [returnTo, setReturnTo] = useState("/my-trips");

  useEffect(() => {
    setReturnTo(window.location.pathname);
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (result) {
      if (result === "connected") {
        toast.success(
          params.get("sync") === "failed"
            ? "Google Calendar terhubung. Sebagian agenda belum tersinkron."
            : "Google Calendar terhubung. Agendamu akan tersinkron.",
        );
      } else if (result === "denied") {
        toast.error("Izin Google Calendar dibatalkan.");
      } else if (result === "failed") {
        toast.error("Google Calendar belum terhubung. Coba lagi.");
      }
      params.delete("calendar");
      params.delete("sync");
      const query = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    }
    if (recentlyDismissed()) return;
    let cancelled = false;
    fetch("/api/google-calendar/status", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { connected?: boolean; configured?: boolean } | null) => {
        if (!cancelled && status && status.configured !== false && !status.connected) {
          setShow(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Dismissal is a convenience only.
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={springIos}
          className="overflow-hidden"
          data-testid="calendar-connect-banner"
        >
          <div className="flex items-center gap-2.5 rounded-2xl bg-surface p-2.5">
            <img
              src="/assets/profile/profile-calendar-v2.jpg"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 object-contain mix-blend-multiply"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">
                Sinkronkan agenda ke Google Calendar
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Dapat pengingat otomatis di kalendermu.
              </p>
            </div>
            <motion.a
              href={`/api/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`}
              whileTap={{ scale: 0.95 }}
              transition={springSnappy}
              className="tap inline-flex min-h-8 shrink-0 items-center rounded-lg bg-brand-red px-3 text-[12px] font-semibold text-white"
            >
              Hubungkan
            </motion.a>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Tutup"
              className="tap flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
