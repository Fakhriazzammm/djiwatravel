import { Menu, X } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminNavigation, isAdminNavigationActive } from "@/components/admin-navigation";

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
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/25 p-0 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-sheet-title"
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[24px] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#d1d1d6] sm:hidden"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between gap-3">
          <h2 id="admin-sheet-title" className="font-semibold">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup detail"
            className="min-h-11 min-w-11 rounded-xl border border-[#e5e5ea] p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]"
          >
            <X className="mx-auto size-4" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </section>
    </div>
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
  return (
    <div className={`min-h-screen ${adminUi.canvas}`}>
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
