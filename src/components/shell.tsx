import { Link, useRouter } from "@tanstack/react-router";
import { Home, Compass, Smartphone, User, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import logo from "@/assets/logo.png";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/my-esim", label: "My eSIM", icon: Smartphone },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/90 backdrop-blur-xl safe-bottom">
      <div className="mx-auto flex max-w-md justify-around pt-2">
        {tabs.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
            className="flex w-20 flex-col items-center gap-1 py-1 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: "text-brand-red" }}>
            <Icon className="size-6" strokeWidth={1.6} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Wordmark({ className = "h-10" }: { className?: string }) {
  return <img src={logo} alt="Djiwa Travel" className={`w-auto ${className}`} />;
}

export function Page({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  return (
    <div className={`mx-auto min-h-screen max-w-md px-5 safe-top ${tabs ? "pb-28" : "pb-32"}`}>
      {children}
      {tabs && <TabBar />}
    </div>
  );
}

export function BackBar({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <div className="-mx-2 mb-2 flex h-11 items-center">
      <button onClick={() => router.history.back()} className="tap flex items-center text-[17px] text-brand-red" aria-label="Kembali">
        <ChevronLeft className="size-7" strokeWidth={2} /> Kembali
      </button>
      {title && <span className="ml-auto mr-2 text-[15px] font-semibold">{title}</span>}
    </div>
  );
}

export function StickyCta({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/90 px-5 pt-3 backdrop-blur-xl safe-bottom">
      <div className="mx-auto max-w-md pb-2">{children}</div>
    </div>
  );
}

export const btnPrimary = "tap flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[17px] font-semibold text-primary-foreground disabled:opacity-50";
export const btnRed = "tap flex h-14 w-full items-center justify-center rounded-2xl bg-brand-red text-[17px] font-semibold text-primary-foreground dark:text-foreground";
export const btnSoft = "tap flex h-12 w-full items-center justify-center rounded-2xl bg-secondary text-[15px] font-semibold text-secondary-foreground";
export const group = "overflow-hidden rounded-2xl bg-surface divide-y";
