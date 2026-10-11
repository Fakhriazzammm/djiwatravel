import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Home, Compass, Smartphone, User, ChevronLeft, WalletCards } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import logo from "@/assets/logo.png";
import { springSnappy } from "@/lib/motion";
import { FixedLayer } from "@/components/motion-primitives";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/my-esim", label: "My eSIM", icon: Smartphone },
  { to: "/balance", label: "Wallet", icon: WalletCards },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const isActiveTab = (to: string, pathname: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

export function TabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 backdrop-blur-xl safe-bottom">
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = isActiveTab(to, pathname);
          return (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${
                active ? "text-brand-red" : "text-muted-foreground"
              }`}>
              <span className="relative flex h-7 w-12 items-center justify-center rounded-full">
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-full bg-brand-red-soft"
                    transition={springSnappy}
                  />
                )}
                <Icon className="relative size-[22px]" strokeWidth={1.8} />
              </span>
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

/** iOS nav bar: back left, title centered, equal-width spacer right. */
export function BackBar({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <div className="mb-3 grid h-11 grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center">
      <button onClick={() => router.history.back()} className="tap -ml-1.5 flex items-center text-[16px] text-brand-red" aria-label="Kembali">
        <ChevronLeft className="size-6 shrink-0" strokeWidth={2.2} /> Kembali
      </button>
      <span className="truncate text-center text-[16px] font-semibold">{title}</span>
      <span />
    </div>
  );
}

export function StickyCta({
  children,
  aboveTabBar = true,
}: {
  children: ReactNode;
  /** Set false on pages rendered with `Page tabs={false}` so the bar sits at the
   * bottom instead of floating where the tab bar would have been. */
  aboveTabBar?: boolean;
}) {
  return (
    <FixedLayer>
      <div
        className={`fixed inset-x-0 ${
          aboveTabBar
            ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
            : "bottom-0 safe-bottom"
        } z-40 border-t bg-surface/95 px-4 pt-2.5 backdrop-blur-xl`}
      >
        <div className="mx-auto max-w-md">{children}</div>
      </div>
    </FixedLayer>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="min-w-0 truncate text-[18px] font-bold">{children}</h2>
      {action && <div className="shrink-0 text-[13px] font-medium text-muted-foreground">{action}</div>}
    </div>
  );
}

export const btnBase = "tap flex w-full items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-40";
export const btnPrimary = `${btnBase} h-12 bg-primary text-[16px] text-primary-foreground`;
export const btnRed = `${btnBase} h-12 bg-brand-red text-[16px] text-primary-foreground`;
export const btnSoft = `${btnBase} h-11 bg-secondary text-[14px] text-secondary-foreground`;
export const group = "overflow-hidden rounded-2xl bg-surface divide-y";
export const row = "flex min-h-12 items-center justify-between gap-3 px-4 py-3";
export const label = "mb-2 px-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground";
