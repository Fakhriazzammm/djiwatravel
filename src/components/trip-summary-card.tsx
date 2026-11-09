import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  MapPin,
  TriangleAlert,
  Ticket,
  Users,
  WalletCards,
} from "lucide-react";
import { springIos } from "@/lib/motion";
import { compactMoney } from "@/lib/trip-budget-format";
import { formatTripMoney } from "@/lib/trip-money";
import type { SummaryAction, TripSummary } from "@/lib/trip-summary";

const DAYS_SHOWN = 3;

function Bar({ percent, tone = "brand" }: { percent: number; tone?: "brand" | "warn" | "ok" }) {
  const reduce = Boolean(useReducedMotion());
  const color = tone === "warn" ? "bg-destructive" : tone === "ok" ? "bg-success" : "bg-brand-red";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        transition={{ ...springIos, delay: 0.15 }}
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
  percent,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  percent?: number;
  tone?: "brand" | "warn" | "ok";
}) {
  return (
    <div className="min-w-0 rounded-xl bg-secondary/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="text-brand-red">{icon}</span>
        {label}
      </div>
      <p className="mt-0.5 truncate text-[15px] font-bold tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      {percent !== undefined && (
        <div className="mt-1.5">
          <Bar percent={percent} {...(tone ? { tone } : {})} />
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap flex min-h-11 w-full items-center gap-2 px-3 text-left"
      >
        <span className="text-brand-red">{icon}</span>
        <span className="flex-1 text-[13px] font-bold">{title}</span>
        {badge && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums">
            {badge}
          </span>
        )}
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springIos}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const SECTION_LINKS = [
  { section: "itinerary", label: "Agenda" },
  { section: "budget", label: "Biaya" },
  { section: "checklist", label: "Checklist" },
  { section: "bookings", label: "Booking" },
] as const;

const ACTION_LABEL: Record<SummaryAction, string> = {
  plan: "Isi",
  tidy: "Rapikan",
  budget: "Atur",
  checklist: "Cek",
  pin: "Pasang",
};

/**
 * "Ringkas semua": the whole trip in one balloon: header, four numbers, what needs attention (each
 * with a button that acts on it), the agenda by day, budget by category, open checklist items and
 * bookings. Sections fold; everything links to its page.
 */
export function TripSummaryCard({
  summary,
  tripId,
  onAction,
}: {
  summary: TripSummary;
  tripId: string;
  onAction: (action: SummaryAction) => void;
}) {
  const [allDays, setAllDays] = useState(false);
  const money = (minor: number) => formatTripMoney(minor, summary.currency);
  const { agenda, budget, checklist, bookings, attention } = summary;
  const shownDays = allDays ? agenda.days : agenda.days.slice(0, DAYS_SHOWN);
  const checkPct = checklist.total ? Math.round((checklist.done / checklist.total) * 100) : 0;
  const over = budget.set && budget.spentMinor > budget.totalMinor;

  return (
    <div data-testid="trip-summary" className="border-t border-border/60">
      <div className="bg-brand-red-soft/60 px-3 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{summary.destination || summary.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {summary.datesLabel}
              {summary.travelers > 0 ? ` · ${summary.travelers} traveler` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-red px-2.5 py-1 text-[11px] font-bold text-white">
            {summary.countdown}
          </span>
        </div>
        {summary.cities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.cities.map((city) => (
              <span
                key={city}
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold"
              >
                <MapPin className="size-3 text-brand-red" aria-hidden="true" />
                {city}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        <Tile
          icon={<CalendarDays className="size-3.5" aria-hidden="true" />}
          label="Agenda"
          value={`${agenda.total} aktivitas`}
          hint={`${agenda.daysFilled} dari ${agenda.daysTotal} hari terisi`}
          percent={agenda.daysTotal ? (agenda.daysFilled / agenda.daysTotal) * 100 : 0}
        />
        <Tile
          icon={<WalletCards className="size-3.5" aria-hidden="true" />}
          label="Biaya"
          value={budget.set ? compactMoney(budget.spentMinor, summary.currency) : "Belum diatur"}
          hint={
            budget.set
              ? `dari ${compactMoney(budget.totalMinor, summary.currency)}`
              : "Atur anggaran"
          }
          percent={budget.percent}
          tone={over ? "warn" : "brand"}
        />
        <Tile
          icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}
          label="Checklist"
          value={`${checklist.done}/${checklist.total}`}
          hint={
            checklist.total ? `${checklist.total - checklist.done} belum selesai` : "Belum ada item"
          }
          percent={checkPct}
          tone={checklist.total && checklist.done === checklist.total ? "ok" : "brand"}
        />
        <Tile
          icon={<Ticket className="size-3.5" aria-hidden="true" />}
          label="Booking"
          value={`${bookings.length} aktif`}
          hint={bookings.some((b) => b.pending) ? "ada yang menunggu" : "semua beres"}
        />
      </div>

      {attention.length > 0 && (
        <div
          className="mx-3 mb-3 rounded-xl bg-amber-50 p-2.5 text-amber-950"
          data-testid="summary-attention"
        >
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Perlu perhatian
          </p>
          <ul className="space-y-1">
            {attention.map((item) => (
              <li key={item.id} className="flex min-h-8 items-center gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1">{item.text}</span>
                {item.action && (
                  <button
                    type="button"
                    onClick={() => onAction(item.action!)}
                    className="tap min-h-8 shrink-0 rounded-full bg-amber-200/80 px-2.5 text-[11px] font-bold"
                  >
                    {ACTION_LABEL[item.action]}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section
        icon={<CalendarDays className="size-4" aria-hidden="true" />}
        title="Agenda per hari"
        badge={`${agenda.pinned}/${agenda.total} di peta`}
      >
        <div className="space-y-2.5">
          {shownDays.map((day) => (
            <div key={day.date}>
              <p className="flex items-center gap-2 text-[12px] font-bold">
                {day.label}
                <span className="font-normal text-muted-foreground">
                  {day.empty ? "kosong" : `${day.items.length} aktivitas`}
                </span>
              </p>
              {day.empty ? (
                <button
                  type="button"
                  onClick={() => onAction("plan")}
                  className="tap mt-1 min-h-8 w-full rounded-xl border border-dashed border-border text-[12px] font-semibold text-brand-red"
                >
                  Isi hari ini bersama Travo
                </button>
              ) : (
                <ul className="mt-1 space-y-1 border-l-2 border-brand-red/25 pl-2.5">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                        {item.time || "·"}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                      {item.clash && (
                        <span className="text-[10px] font-bold text-amber-700">bentrok</span>
                      )}
                      {!item.pinned && (
                        <MapPin
                          className="size-3 shrink-0 text-muted-foreground/50"
                          aria-label="belum di peta"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {agenda.days.length > DAYS_SHOWN && (
            <button
              type="button"
              onClick={() => setAllDays((v) => !v)}
              className="tap min-h-8 text-[12px] font-semibold text-brand-red"
            >
              {allDays ? "Tampilkan lebih sedikit" : `Lihat semua ${agenda.days.length} hari`}
            </button>
          )}
        </div>
      </Section>

      <Section
        icon={<WalletCards className="size-4" aria-hidden="true" />}
        title="Anggaran"
        badge={budget.set ? `${budget.percent}%` : "—"}
        defaultOpen={budget.set}
      >
        {budget.set ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] text-muted-foreground">Sisa</span>
              <span
                className={`text-[17px] font-bold tabular-nums ${over ? "text-destructive" : ""}`}
              >
                {money(budget.remainingMinor)}
              </span>
            </div>
            {budget.categories.map((c) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {compactMoney(c.spentMinor, summary.currency)} /{" "}
                    {compactMoney(c.allocatedMinor, summary.currency)}
                  </span>
                </div>
                <Bar
                  percent={
                    c.allocatedMinor
                      ? (c.spentMinor / c.allocatedMinor) * 100
                      : c.spentMinor
                        ? 100
                        : 0
                  }
                  tone={c.allocatedMinor && c.spentMinor > c.allocatedMinor ? "warn" : "brand"}
                />
              </div>
            ))}
            {budget.recent.length > 0 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Terakhir:{" "}
                {budget.recent
                  .map((r) => `${r.description} ${compactMoney(r.amountMinor, summary.currency)}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAction("budget")}
            className="tap min-h-9 w-full rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white"
          >
            Atur anggaran bersama Travo
          </button>
        )}
      </Section>

      <Section
        icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        title="Checklist"
        badge={`${checklist.done}/${checklist.total}`}
        defaultOpen={checklist.open.length > 0}
      >
        {checklist.open.length ? (
          <ul className="space-y-1">
            {checklist.open.map((c) => (
              <li key={c.id} className="flex min-h-7 items-center gap-2 text-[12.5px]">
                <span
                  className="size-3.5 shrink-0 rounded-full border-[1.5px] border-brand-red"
                  aria-hidden="true"
                />
                {c.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {checklist.total ? "Semua persiapan selesai." : "Belum ada item checklist."}
          </p>
        )}
      </Section>

      <Section
        icon={<Ticket className="size-4" aria-hidden="true" />}
        title="Booking"
        badge={String(bookings.length)}
        defaultOpen={bookings.length > 0}
      >
        {bookings.length ? (
          <ul className="space-y-1">
            {bookings.map((b) => (
              <li key={b.id} className="flex min-h-7 items-center gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-medium">{b.title}</span>
                <span className="text-[11px] text-muted-foreground">{b.category}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${b.pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                >
                  {b.status || "tercatat"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Belum ada pemesanan tercatat.</p>
        )}
      </Section>

      <nav
        className="flex gap-1.5 overflow-x-auto border-t border-border/60 px-3 py-2.5 [scrollbar-width:none]"
        aria-label="Buka halaman"
      >
        {SECTION_LINKS.map((l) => (
          <Link
            key={l.section}
            to="/my-trips/$tripId/$section"
            params={{ tripId, section: l.section }}
            className="tap inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-semibold"
          >
            {l.label}
          </Link>
        ))}
        <span className="inline-flex min-h-8 shrink-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">
          <Users className="size-3" aria-hidden="true" />
          Data dari semua halaman
        </span>
      </nav>
    </div>
  );
}
