import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FixedLayer } from "@/components/motion-primitives";
import { getDest } from "@/lib/catalog";
import { CONSENT_EVENT, readConsent } from "@/lib/cookie-consent";
import { getRecentPurchases } from "@/lib/recent-purchases.fn";
import { agoLabel, type RecentPurchase } from "@/lib/recent-purchases";

const SESSION_KEY = "djiwa.recent-toast.v1";
const FIRST_DELAY_MS = 7_000;
const VISIBLE_MS = 6_500;
const GAP_MS = 16_000;
const MAX_PER_SESSION = 4;

type SessionState = { shown: number; dismissed: boolean };

function readSession(): SessionState {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    // Ignore: the toast simply restarts its count.
  }
  return { shown: 0, dismissed: false };
}

function writeSession(state: SessionState) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: keep going without persistence.
  }
}

const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

/**
 * Small "pembelian terbaru" toast above the tab bar. Real paid orders (masked first name) when
 * there are any in the last 72 hours; otherwise real catalogue packages that are popular now.
 * Each entry links to its destination. It waits for the cookie notice to be answered, pauses
 * while a sheet is open, shows at most four times per session and can be dismissed for the rest
 * of the session.
 */
export function RecentPurchaseToast({ paused = false }: { paused?: boolean }) {
  const [items, setItems] = useState<RecentPurchase[]>([]);
  const [consentReady, setConsentReady] = useState(false);
  const [current, setCurrent] = useState<RecentPurchase | null>(null);
  const cursor = useRef(0);

  useEffect(() => {
    let live = true;
    void getRecentPurchases()
      .then((feed) => {
        if (live && feed.enabled) setItems(feed.items);
      })
      .catch(() => {
        // The toast is decoration: a failed feed just means nothing is shown.
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const check = () => setConsentReady(readConsent() !== null);
    check();
    window.addEventListener(CONSENT_EVENT, check);
    return () => window.removeEventListener(CONSENT_EVENT, check);
  }, []);

  useEffect(() => {
    if (items.length === 0 || !consentReady || paused) {
      setCurrent(null);
      return;
    }
    let hide: number | undefined;
    let next: number | undefined;
    const schedule = (delay: number) => {
      next = window.setTimeout(() => {
        const session = readSession();
        if (session.dismissed || session.shown >= MAX_PER_SESSION) return;
        const item = items[cursor.current % items.length];
        cursor.current += 1;
        if (!item) return;
        writeSession({ ...session, shown: session.shown + 1 });
        setCurrent(item);
        hide = window.setTimeout(() => {
          setCurrent(null);
          schedule(GAP_MS);
        }, VISIBLE_MS);
      }, delay);
    };
    schedule(FIRST_DELAY_MS);
    return () => {
      window.clearTimeout(next);
      window.clearTimeout(hide);
      setCurrent(null);
    };
  }, [items, consentReady, paused]);

  const destination = current ? getDest(current.destinationCode) : undefined;

  return (
    <FixedLayer>
      <AnimatePresence>
        {current && destination && (
          <motion.div
            key={current.key}
            data-testid="recent-purchase-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] left-1/2 z-[41] w-[calc(100%-1.5rem)] max-w-[21rem] -translate-x-1/2"
          >
            <div className="glass relative flex items-center gap-2.5 rounded-[20px] border border-white/65 py-2 pl-2 pr-8 shadow-[0_10px_28px_rgb(40_30_90/0.2)]">
              <Link
                to="/destination/$code"
                params={{ code: destination.code.toLowerCase() }}
                aria-label={`Lihat paket eSIM ${destination.nameId}`}
                className="tap flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-[26px] leading-none shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]"
                >
                  {destination.flag}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold leading-tight">
                    {current.kind === "real"
                      ? `${current.maskedName ?? "Traveler"} · ${agoLabel(current.minutesAgo ?? 0)}`
                      : `Populer · eSIM ${destination.nameId}`}
                  </span>
                  <span className="block truncate text-[12px] leading-snug text-muted-foreground">
                    {current.kind === "real"
                      ? `membeli eSIM ${destination.nameId} · ${current.packageLabel}`
                      : `${current.packageLabel}${current.priceIdr ? ` · ${rupiah(current.priceIdr)}` : ""}`}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                aria-label="Tutup notifikasi pembelian"
                onClick={() => {
                  writeSession({ ...readSession(), dismissed: true });
                  setCurrent(null);
                }}
                className="tap absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" strokeWidth={2.4} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </FixedLayer>
  );
}
