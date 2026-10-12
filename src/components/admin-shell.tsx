import { Menu, X } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminNavigation } from "@/components/admin-navigation";

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
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeMenu]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-[#111113]">
      <aside
        id="admin-mobile-drawer"
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-[#e5e5ea] bg-white p-5 transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0a84ff]">
              Djiwa Travel
            </p>
            <h2 className="mt-1 text-lg font-bold">Admin</h2>
          </div>
          <button
            className="min-h-11 min-w-11 rounded-xl p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] lg:hidden"
            aria-label="Tutup menu"
            onClick={closeMenu}
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Menu admin">
          {adminNavigation.map(([label, href, Icon]) => {
            const active =
              location.pathname === href ||
              (href === "/admin/dashboard" && location.pathname === "/admin");
            return (
              <Link
                key={href}
                to={href as never}
                onClick={closeMenu}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${active ? "bg-[#eaf3ff] text-[#0a67c7]" : "text-[#6b6b72] hover:bg-[#f4f4f5]"}`}
              >
                <Icon className="size-4" strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-[#e5e5ea] bg-[#fafafa] p-3 text-xs text-[#6b6b72]">
          <p className="font-semibold text-[#111113]">Mode operasional</p>
          <p className="mt-1">Data dan aksi mengikuti readiness server.</p>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Tutup sidebar"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={closeMenu}
        />
      )}
      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[#e5e5ea]/80 bg-white/95 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3">
            <button
              ref={menuTriggerRef}
              className="min-h-11 min-w-11 rounded-xl border border-[#e5e5ea] p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] lg:hidden"
              aria-label="Buka menu"
              aria-expanded={open}
              aria-controls="admin-mobile-drawer"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-xs font-medium text-[#8a8a91]">Admin / {title}</p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-[#fff4df] px-3 py-1.5 text-xs font-semibold text-[#9a6100] sm:inline-flex">
                Readiness terbatas
              </span>
              <div className="size-9 rounded-full bg-[#111113] text-center text-xs font-bold leading-9 text-white">
                AD
              </div>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
          {subtitle && <p className="mb-6 max-w-2xl text-sm text-[#6b6b72]">{subtitle}</p>}
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
    <div className="rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#6b6b72]">{detail}</p>
    </div>
  );
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {detail && <p className="mt-1 text-sm text-[#8a8a91]">{detail}</p>}
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
    neutral: "bg-[#f4f4f5] text-[#6b6b72]",
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
