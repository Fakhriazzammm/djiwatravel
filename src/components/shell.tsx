import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Home, Compass, BriefcaseBusiness, User, ChevronLeft, WalletCards } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import logo from "@/assets/logo.png";
import { springSnappy } from "@/lib/motion";
import { FixedLayer } from "@/components/motion-primitives";

const tabs = [
  { to: "/", label: "Beranda", icon: Home },
  { to: "/explore", label: "Jelajah", icon: Compass },
  { to: "/my-trips", label: "Perjalanan", icon: BriefcaseBusiness },
  { to: "/wallet", label: "Dompet", icon: WalletCards },
  { to: "/profile", label: "Profil", icon: User },
] as const;

const isActiveTab = (to: string, pathname: string) =>
  to === "/"
    ? pathname === "/"
    : pathname === to ||
      pathname.startsWith(`${to}/`) ||
      (to === "/explore" && pathname === "/esim/finder");

/** Remembers the previous tab so the pill can slide from it even though each route mounts its own bar. */
let previousTabIndex: number | null = null;

export function TabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeIndex = tabs.findIndex(({ to }) => isActiveTab(to, pathname));
  const fromIndex = previousTabIndex ?? activeIndex;
  useEffect(() => {
    if (activeIndex >= 0) previousTabIndex = activeIndex;
  }, [activeIndex]);
  return (
    <nav
      aria-label="Navigasi utama"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="glass pointer-events-auto relative mx-auto grid max-w-[406px] grid-cols-5 rounded-[34px] border border-white/65 p-1.5 shadow-[0_14px_38px_rgb(40_30_90/0.22),inset_0_1px_0_rgb(255_255_255/0.8)]">
        {activeIndex >= 0 && (
          <motion.span
            aria-hidden="true"
            initial={{ x: `${Math.max(fromIndex, 0) * 100}%` }}
            animate={{ x: `${activeIndex * 100}%` }}
            transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.8 }}
            className="absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-[26px] bg-brand-red-soft shadow-[inset_0_0_0_1px_rgb(200_52_58/0.12),0_4px_12px_rgb(200_52_58/0.15)]"
          />
        )}
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = isActiveTab(to, pathname);
          return (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              aria-current={active ? "page" : undefined}
              className={`tap relative z-10 flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-[26px] text-[10px] font-medium tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "text-brand-red" : "text-muted-foreground"
              }`}
            >
              <motion.span
                animate={{ scale: active ? 1.14 : 1, y: active ? -2 : 0 }}
                transition={springSnappy}
                className="flex size-7 items-center justify-center"
              >
                <Icon className="size-[24px]" strokeWidth={active ? 2.2 : 1.7} />
              </motion.span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Wordmark({ className = "h-10" }: { className?: string }) {
  return <img src={logo} alt="Djiwa Travel" className={`w-auto ${className}`} />;
}

export function Page({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  return (
    <>
      <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 safe-top">{children}</div>
      {tabs && (
        <FixedLayer>
          <TabBar />
        </FixedLayer>
      )}
    </>
  );
}

/**
 * The one round header control used across customer pages (back, menu, notifications, account):
 * a 40px frosted-glass circle with a thin 2pt-style glyph, like iOS navigation bar buttons.
 */
export const glassIconButtonClass =
  "tap flex size-10 shrink-0 items-center justify-center rounded-full bg-white/75 text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_2px_8px_-2px_rgb(0_0_0/0.14)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** iOS nav bar: back left, title centered, optional action right. */
export function BackBar({
  title,
  action,
  fallbackTo = "/",
}: {
  title?: string;
  action?: ReactNode;
  fallbackTo?: string;
}) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }
    void router.navigate({ to: fallbackTo });
  };
  return (
    <div className="mb-3 grid h-11 grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center">
      <button type="button" onClick={goBack} className={glassIconButtonClass} aria-label="Kembali">
        <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden="true" />
      </button>
      <span className="truncate text-center text-[16px] font-semibold">{title}</span>
      <span className="flex items-center justify-end">{action}</span>
    </div>
  );
}

export function StickyCta({
  children,
  aboveTabBar = true,
  compact = false,
}: {
  children: ReactNode;
  /** Set false on pages rendered with `Page tabs={false}` so the bar sits at the
   * bottom instead of floating where the tab bar would have been. */
  aboveTabBar?: boolean;
  compact?: boolean;
}) {
  return (
    <FixedLayer>
      <div
        className={`fixed inset-x-0 ${
          aboveTabBar ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]" : "bottom-0 safe-bottom"
        } glass z-40 border-t border-black/[0.08] px-4 ${compact ? "pt-1.5" : "pt-2.5"}`}
      >
        <div className="mx-auto max-w-md">{children}</div>
      </div>
    </FixedLayer>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="min-w-0 truncate text-[22px] font-bold tracking-[-0.02em]">{children}</h2>
      {action && <div className="shrink-0 text-[15px] font-medium text-brand-red">{action}</div>}
    </div>
  );
}

export const btnBase =
  "tap flex w-full items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-40";
export const btnPrimary = `${btnBase} h-12 bg-primary text-[16px] text-primary-foreground`;
export const btnRed = `${btnBase} h-12 bg-brand-red text-[16px] text-primary-foreground`;
export const btnSoft = `${btnBase} h-11 bg-secondary text-[14px] text-secondary-foreground`;
export const group = "overflow-hidden rounded-2xl bg-surface divide-y divide-border/70";
export const row = "flex min-h-12 items-center justify-between gap-3 px-4 py-3";
export const label =
  "mb-2 px-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground";
