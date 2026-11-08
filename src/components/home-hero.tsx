import { Link } from "@tanstack/react-router";
import { CardSim, Plane, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import logo from "@/assets/logo.png";
import {
  HERO_MASCOT,
  heroClockLine,
  heroGreeting,
  heroSkyImage,
  isDarkPhase,
  resolveHeroPhase,
  type HeroPhase,
  type HeroSkyMode,
} from "@/lib/home-hero";

/** Mascot flight length; the search sheet only opens once the mascot has left the screen. */
const FLIGHT_MS = 1000;

type Flight = { left: number; top: number; width: number; dx: number; dy: number };

/**
 * Home hero: a full-bleed time-of-day sky (device clock, or the phase Admin pinned) that melts
 * into the page background, a quiet clock line, the greeting with the customer's first name, and
 * the frosted search pill with the mascot beside it. The eSIM card overlaps its lower edge
 * (`-mt-16` on the next section). The sky spans the whole viewport width and the very top; only
 * the text column is capped at the app's reading width.
 */
const FLIGHT_HINT_FALLBACK = "Cari tiket pesawat";
const FLIGHT_HINT_EXAMPLES = ["Bali", "Tokyo", "Singapura", "Seoul"];

/** The same typing effect as the eSIM search line, for "Cari tiket ke <kota>". */
function useFlightHint(active: boolean, reduceMotion: boolean | null) {
  const [hint, setHint] = useState(FLIGHT_HINT_FALLBACK);
  useEffect(() => {
    if (!active || reduceMotion) {
      setHint(FLIGHT_HINT_FALLBACK);
      return;
    }
    let wordIndex = 0;
    let count = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = FLIGHT_HINT_EXAMPLES[wordIndex] ?? "";
      count += deleting ? -1 : 1;
      setHint(`Cari tiket ke ${word.slice(0, count)}`);
      if (!deleting && count === word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1000);
      } else if (deleting && count === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % FLIGHT_HINT_EXAMPLES.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 42 : 80);
      }
    };
    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [active, reduceMotion]);
  return hint;
}

export function HomeHero({
  mode,
  firstName,
  headerAction,
  searchHint,
  flightsTab = false,
  searchOpen,
  onOpenSearch,
}: {
  mode: HeroSkyMode;
  firstName?: string | null;
  headerAction: ReactNode;
  searchHint: string;
  /** Show the eSIM | Tiket switch (Admin `flights.heroTab` and a working search). */
  flightsTab?: boolean;
  searchOpen: boolean;
  onOpenSearch: () => void;
}) {
  // Server render has no device clock: start on the neutral "sore" sky and the clock line empty,
  // then adopt the device time after mount so hydration stays stable.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Mascot launch: tapping search sends the mascot flying out of the screen toward the customer.
  // Only when it has left does the search sheet rise from below; the mascot springs back when the
  // sheet closes. Reduced motion opens the sheet immediately.
  const reduceMotion = useReducedMotion();
  const mascotRef = useRef<HTMLImageElement>(null);
  const flightRef = useRef<HTMLImageElement>(null);
  const [fly, setFly] = useState<"idle" | "launch" | "away">("idle");
  // The Tiket tab only changes what the pill does (it opens the flight search page).
  const [tab, setTab] = useState<"esim" | "tiket">("esim");
  const flightsMode = flightsTab && tab === "tiket";
  const flightHint = useFlightHint(flightsMode, reduceMotion);
  const [flight, setFlight] = useState<Flight | null>(null);

  useEffect(() => {
    if (!searchOpen && fly === "away") setFly("idle");
  }, [searchOpen, fly]);

  useEffect(() => {
    const el = flightRef.current;
    if (!flight || !el) return;
    const animation = el.animate(
      [
        {
          transform: "translate(0,0) scale(1) rotate(0deg)",
          opacity: 1,
          filter: "blur(0px)",
          easing: "ease-out",
        },
        {
          transform: "translate(0,10px) scale(0.8) rotate(8deg)",
          opacity: 1,
          filter: "blur(0px)",
          offset: 0.2,
          easing: "cubic-bezier(0.5,0,0.9,0.45)",
        },
        {
          transform: `translate(${flight.dx * 0.55}px,${flight.dy * 0.55}px) scale(4) rotate(-6deg)`,
          opacity: 1,
          filter: "blur(0px)",
          offset: 0.62,
        },
        {
          transform: `translate(${flight.dx}px,${flight.dy}px) scale(14) rotate(-14deg)`,
          opacity: 0,
          filter: "blur(8px)",
        },
      ],
      { duration: FLIGHT_MS, fill: "forwards" },
    );
    animation.onfinish = () => {
      setFlight(null);
      setFly("away");
      onOpenSearch();
    };
    return () => animation.cancel();
    // onOpenSearch is stable for a click; the flight object identifies one launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  const launch = () => {
    const el = mascotRef.current;
    if (reduceMotion || !el || fly !== "idle") {
      onOpenSearch();
      return;
    }
    const rect = el.getBoundingClientRect();
    setFly("launch");
    setFlight({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      dx: window.innerWidth / 2 - (rect.left + rect.width / 2),
      dy: window.innerHeight * 0.4 - (rect.top + rect.height / 2),
    });
  };

  const phase: HeroPhase = now
    ? resolveHeroPhase(mode, now)
    : mode === "auto"
      ? "sore"
      : resolveHeroPhase(mode, new Date(0));
  const dark = isDarkPhase(phase);
  const clock = now ? heroClockLine(now) : null;

  return (
    <header
      data-testid="home-hero"
      data-phase={phase}
      className={`relative left-1/2 -mt-[max(env(safe-area-inset-top),0.75rem)] w-screen -translate-x-1/2 overflow-hidden transition-colors duration-700 ${
        dark ? "text-white [text-shadow:0_1px_10px_rgb(8_12_40/0.45)]" : "text-foreground"
      }`}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[#c9b6f0]">
        <img
          key={phase}
          src={heroSkyImage(phase)}
          alt=""
          width={800}
          height={800}
          fetchPriority="high"
          decoding="async"
          className="animate-hero-sky-in absolute inset-0 size-full object-cover object-[50%_55%]"
        />
      </div>
      {/* Soft left-to-right scrim keeps the text corner readable on any sky. */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 z-[1] bg-gradient-to-r ${
          dark ? "from-[#0b1030]/35 via-[#0b1030]/10" : "from-white/30 via-white/5"
        } to-transparent`}
      />
      {/* Melts the sky into the page background so there is no visible edge. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-b from-transparent to-background"
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-24 pt-[calc(max(env(safe-area-inset-top),0.75rem)+0.25rem)]">
        <div className="flex h-14 items-center justify-between gap-3">
          <img
            src={logo}
            alt="Djiwa Travel"
            className={`h-11 w-auto transition-[filter] duration-700 ${
              dark ? "brightness-0 invert" : ""
            }`}
          />
          {headerAction}
        </div>

        <p
          className="mt-3 flex h-4 items-center gap-1.5 text-[12.5px] font-medium tabular-nums tracking-[0.01em] opacity-80"
          aria-label={clock ? `${clock.day}, ${clock.date}, pukul ${clock.time}` : undefined}
        >
          {clock && (
            <>
              <span>{clock.day}</span>
              <i aria-hidden="true" className="size-[3px] rounded-full bg-current opacity-60" />
              <span>{clock.date}</span>
              <i aria-hidden="true" className="size-[3px] rounded-full bg-current opacity-60" />
              <span>{clock.time}</span>
            </>
          )}
        </p>
        <p className="mt-2.5 text-[16px] font-medium opacity-90">
          {heroGreeting(phase, firstName)}
        </p>
        <div className="relative mt-0.5">
          <h1 className="large-title-xl pr-24 text-balance">Mau pergi ke mana?</h1>
          {/* Mascot sits above the search pill, on the right, clear of the eSIM card below. */}
          <span className="animate-mascot-bob pointer-events-none absolute bottom-0 right-0 z-20 block w-[88px]">
            <motion.img
              ref={mascotRef}
              initial={false}
              src={HERO_MASCOT}
              alt=""
              width={88}
              height={76}
              animate={{ opacity: fly === "idle" ? 1 : 0, scale: fly === "idle" ? 1 : 0.4 }}
              transition={
                fly === "idle" ? { type: "spring", stiffness: 320, damping: 16 } : { duration: 0 }
              }
              className="block w-full"
            />
          </span>
        </div>

        {flightsTab && (
          <div
            role="tablist"
            aria-label="Jenis pencarian"
            className={`mt-4 inline-flex rounded-full p-0.5 text-[13px] font-semibold backdrop-blur-xl ${
              dark ? "bg-white/15 text-white/90" : "bg-white/60 text-[#5b5f6b]"
            }`}
          >
            {(
              [
                ["esim", "eSIM"],
                ["tiket", "Tiket"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`tap inline-flex min-h-8 items-center gap-1 rounded-full px-3.5 ${
                  tab === id ? "bg-brand-red text-white shadow-sm" : ""
                }`}
              >
                {id === "tiket" ? (
                  <Plane className="size-3.5" aria-hidden="true" />
                ) : (
                  <CardSim className="size-3.5" aria-hidden="true" />
                )}
                {label}
              </button>
            ))}
          </div>
        )}

        {flightsMode ? (
          <Link
            to="/tiket"
            data-track="home_flights_tab"
            className={`tap relative mt-2.5 flex h-[3.25rem] w-full items-center gap-3 rounded-full border px-5 text-left text-[17px] [text-shadow:none] shadow-[0_8px_24px_rgb(40_30_90/0.16)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              dark
                ? "border-white/30 bg-white/15 text-white/90"
                : "border-white/55 bg-white/75 text-[#5b5f6b]"
            }`}
          >
            <Plane className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{flightHint}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={launch}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            className={`tap relative ${flightsTab ? "mt-2.5" : "mt-4"} flex h-[3.25rem] w-full items-center gap-3 rounded-full border px-5 text-left text-[17px] [text-shadow:none] shadow-[0_8px_24px_rgb(40_30_90/0.16)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              dark
                ? "border-white/30 bg-white/15 text-white/90"
                : "border-white/55 bg-white/75 text-[#5b5f6b]"
            }`}
          >
            {flightsTab ? (
              <CardSim className="size-5 shrink-0" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Search className="size-5 shrink-0" strokeWidth={2} />
            )}
            <span className="min-w-0 flex-1 truncate">{searchHint}</span>
          </button>
        )}
      </div>

      {flight &&
        now &&
        createPortal(
          <img
            ref={flightRef}
            src={HERO_MASCOT}
            alt=""
            aria-hidden="true"
            style={{ left: flight.left, top: flight.top, width: flight.width }}
            className="pointer-events-none fixed z-[70] will-change-transform"
          />,
          document.body,
        )}
    </header>
  );
}
