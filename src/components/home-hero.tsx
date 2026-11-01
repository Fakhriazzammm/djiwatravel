import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

/**
 * Home hero: a time-of-day sky (device clock, or the phase Admin pinned), a quiet clock line, the
 * greeting with the customer's first name, and the frosted search pill with the mascot beside it.
 * The card below overlaps its lower edge (`-mt-16` on the next section).
 */
export function HomeHero({
  mode,
  firstName,
  headerAction,
  searchHint,
  searchOpen,
  onOpenSearch,
}: {
  mode: HeroSkyMode;
  firstName?: string | null;
  headerAction: ReactNode;
  searchHint: string;
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
      className={`relative -mx-4 -mt-[env(safe-area-inset-top)] overflow-hidden px-5 pb-28 pt-[calc(1rem+env(safe-area-inset-top))] transition-colors duration-700 ${
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
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[1] h-20 bg-gradient-to-b from-transparent to-background"
      />

      <div className="relative z-10 flex h-14 items-center justify-between gap-3">
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
        className="relative z-10 mt-3 flex h-4 items-center gap-1.5 text-[12.5px] font-medium tabular-nums tracking-[0.01em] opacity-80"
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
      <p className="relative z-10 mt-2.5 text-[16px] font-medium opacity-90">
        {heroGreeting(phase, firstName)}
      </p>
      <h1 className="large-title-xl relative z-10 mt-0.5 text-balance">Mau pergi ke mana?</h1>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        className={`tap relative z-10 mt-4 flex h-[3.25rem] w-full items-center gap-3 rounded-full border px-5 text-left text-[17px] shadow-[0_8px_24px_rgb(40_30_90/0.16)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dark
            ? "border-white/30 bg-white/15 text-white/90"
            : "border-white/55 bg-white/75 text-[#5b5f6b]"
        }`}
      >
        <Search className="size-5 shrink-0" strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate">{searchHint}</span>
      </button>

      <img
        src={HERO_MASCOT}
        alt=""
        width={84}
        height={84}
        className="animate-mascot-bob pointer-events-none absolute bottom-[3.75rem] right-3 z-20 w-[84px] drop-shadow-[0_8px_10px_rgb(0_0_0/0.25)]"
      />
    </header>
  );
}
