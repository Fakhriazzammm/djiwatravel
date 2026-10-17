import { LogOut, Menu, X } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminNavigation, isAdminNavigationActive } from "@/components/admin-navigation";
import { FixedLayer } from "@/components/motion-primitives";
import { signOutBetterAuth } from "@/lib/better-auth-client";

const adminUi = {
  canvas: "bg-[#f2f2f7] text-[#17181a]",
  surface: "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
  control: "min-h-11 rounded-xl text-[13px]",
  label: "text-[11px] font-medium text-[#667085]",
  value: "tabular-nums text-base font-semibold tracking-tight",
} as const;

export function AdminSurface({
  children,
  className = "",
  as: Comp = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return <Comp className={`${adminUi.surface} ${className}`}>{children}</Comp>;
}

export function AdminPageHeader({
  title,
  detail,
  actions,
}: {
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-[20px] font-bold tracking-tight">{title}</h1>
        {detail && <p className="mt-0.5 truncate text-xs text-[#6e6e73]">{detail}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AdminDetailSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  void open;
  void onClose;
  return (
    <section className="mt-2 rounded-2xl border border-black/[0.06] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function AdminShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setOpen(false);
    menuTriggerRef.current?.focus();
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);
  useEffect(() => {
    if (open) document.body.classList.add("overflow-hidden");
    else document.body.classList.remove("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);
  const handleLogout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutBetterAuth();
      window.location.assign("/admin/login");
    } catch {
      setSigningOut(false);
    }
  }, [signingOut]);
  return (
    <div className={`min-h-screen ${adminUi.canvas}`}>
      {/* The page body is wrapped in an animating transition, so chrome that must hug the
          viewport has to leave that subtree — otherwise `position: fixed` anchors to the
          page box and the drawer/backdrop slide away with the content. */}
      <FixedLayer>
        <aside
          id="admin-mobile-drawer"
          aria-label="Navigasi admin"
          className={`fixed inset-y-0 left-0 z-50 w-[272px] border-r border-black/[0.06] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0a84ff]">
                Djiwa Travel
              </p>
              <h2 className="mt-1 text-lg font-bold">Admin console</h2>
            </div>
            <button
              type="button"
              onClick={closeMenu}
              className="min-h-11 min-w-11 rounded-xl p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] lg:hidden"
              aria-label="Tutup menu"
            >
              <X className="mx-auto size-5" />
            </button>
          </div>
          <nav className="mt-7 space-y-1" aria-label="Menu admin">
            {adminNavigation.map(([label, href, Icon]) => {
              const active = isAdminNavigationActive(location.pathname, href);
              return (
                <Link
                  key={href}
                  to={href as never}
                  onClick={closeMenu}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${active ? "bg-[#eaf3ff] text-[#0a67c7]" : "text-[#6e6e73] hover:bg-[#f5f5f7]"}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute bottom-5 left-4 right-4 rounded-2xl bg-[#f7f7f8] p-3 text-xs text-[#6e6e73]">
            <p className="font-semibold text-[#17181a]">Mode operasional</p>
            <p className="mt-1">Data mengikuti readiness server.</p>
          </div>
        </aside>
        {open && (
          <button
            type="button"
            aria-label="Tutup sidebar"
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            onClick={closeMenu}
          />
        )}
      </FixedLayer>
      <main className="lg:pl-[272px]">
        <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-[#f2f2f7]/95 px-3 py-2 backdrop-blur sm:px-5 lg:py-3">
          <div className="mx-auto flex max-w-[1360px] items-center gap-3">
            <button
              ref={menuTriggerRef}
              type="button"
              className="min-h-11 min-w-11 rounded-xl border border-black/[0.06] bg-white p-2 lg:hidden"
              aria-label="Buka menu"
              aria-expanded={open}
              aria-controls="admin-mobile-drawer"
              onClick={() => setOpen(true)}
            >
              <Menu className="mx-auto size-5" />
            </button>
            <div className="min-w-0">
              <p className="hidden text-[11px] text-[#8e8e93] sm:block">Admin / {title}</p>
              <h1 className="truncate text-[17px] font-bold sm:text-xl">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-[#fff4df] px-2.5 py-1 text-[11px] font-semibold text-[#9a6100] sm:inline-flex">
                Readiness terbatas
              </span>
              <div className="size-9 rounded-full bg-[#17181a] text-center text-xs font-bold leading-9 text-white">
                AD
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={signingOut}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-2.5 text-xs font-semibold text-[#4b5563] transition-colors hover:bg-[#f5f5f7] disabled:cursor-wait disabled:opacity-60"
                aria-label="Logout"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                {signingOut ? "Keluar…" : "Logout"}
              </button>
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1360px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
          {subtitle && <p className="sr-only">{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

export type AdminStatItem = {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "neutral" | "good" | "warn" | "danger";
};

/**
 * Ringkasan status admin. Di mobile menjadi satu strip yang bisa di-swipe supaya daftar utama
 * tetap terlihat tanpa scroll; di sm+ kembali menjadi grid dengan pemisah.
 */
export function AdminStatStrip({
  items,
  columns = 3,
  className = "",
}: {
  items: AdminStatItem[];
  columns?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  const cols = {
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
    6: "sm:grid-cols-6",
  }[columns];
  return (
    <div
      className={`-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:grid sm:gap-y-2 sm:divide-x sm:divide-y sm:divide-black/[0.06] sm:px-0 sm:pb-0 ${cols} ${className}`}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="shrink-0 snap-start px-2 py-0.5 sm:min-w-0 sm:px-2.5 sm:py-1.5"
        >
          <p className="whitespace-nowrap text-[11px] text-[#6e6e73]">{item.label}</p>
          <p
            className={`text-base font-semibold tabular-nums tracking-tight ${
              item.tone === "warn"
                ? "text-[#9a6100]"
                : item.tone === "danger"
                  ? "text-[#c7352d]"
                  : item.tone === "good"
                    ? "text-[#1f6b34]"
                    : ""
            }`}
          >
            {item.value}
          </p>
          {item.detail && (
            <p className="whitespace-nowrap text-[11px] text-[#8e8e93]">{item.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Bottom sheet standar admin. Dipakai untuk filter/aturan supaya kontrol tidak perlu diletakkan
 * di ujung halaman yang panjang dan tidak menutupi daftar saat tidak dipakai.
 */
export function AdminSheet({
  open,
  title,
  detail,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  detail?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <FixedLayer>
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/25"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          aria-label={`Tutup ${title}`}
          className="absolute inset-0 h-full w-full cursor-default"
          onClick={onClose}
        />
        <div className="relative z-10 max-h-[78dvh] w-full overflow-auto rounded-t-2xl border-t border-black/[0.06] bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl lg:left-[272px]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold">{title}</h2>
              {detail && <p className="mt-0.5 text-xs text-[#6e6e73]">{detail}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="min-h-9 min-w-9 shrink-0 rounded-xl border border-black/[0.06]"
            >
              <X className="mx-auto size-4" />
            </button>
          </div>
          <div className="mt-2">{children}</div>
          {footer}
        </div>
      </div>
    </FixedLayer>
  );
}

/** Anggaran tinggi agar tabel/daftar jadi satu-satunya area yang menggulir di layar kecil. */
export const ADMIN_LIST_HEIGHT =
  "max-h-[calc(100dvh-13rem)] md:max-h-[calc(100vh-19rem)] overflow-auto";

export function AdminPageState({
  title = "Data belum tersambung",
  detail = "Read model operasional belum tersedia. Tidak ada angka atau record contoh yang ditampilkan.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] p-3">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-5 text-[#6e6e73]">{detail}</p>
    </div>
  );
}
export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {detail && <p className="mt-0.5 text-xs text-[#6e6e73]">{detail}</p>}
    </div>
  );
}
export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const classes = {
    neutral: "bg-[#f0f0f3] text-[#6e6e73]",
    good: "bg-[#e8f8ed] text-[#248a3d]",
    warn: "bg-[#fff4df] text-[#9a6100]",
    danger: "bg-[#fff0ef] text-[#c7352d]",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}
export function DisabledSafeAction({
  children,
  reason = "Aksi aktif setelah backend dan permission tersedia.",
}: {
  children: ReactNode;
  reason?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={reason}
      className="min-h-11 cursor-not-allowed rounded-xl border border-[#e5e5ea] px-3 text-sm font-semibold text-[#a1a1a8]"
    >
      {children}
    </button>
  );
}
