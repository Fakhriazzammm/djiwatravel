import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { CountUp, GrowBar, Reveal, useInView, useReducedMotion } from "@/components/admin-motion";
import { changePct } from "@/lib/date-range";
import type { AdminCustomerGrowth, GrowthPerson } from "@/lib/admin-customers.server";
import { avatarTone, sharePct } from "@/lib/admin-customers-view";
import { formatAdminDateTime } from "@/lib/admin-display";

const num = (value: number) => value.toLocaleString("id-ID");
const MONO = "font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Reveal className="border border-border bg-card p-3 transition-colors hover:border-foreground/25">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className={MONO}>{title}</h3>
        {hint && <p className="truncate text-[10.5px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Reveal>
  );
}

function Bar({
  label,
  value,
  pct,
  note,
}: {
  label: string;
  value: number;
  pct: number;
  note?: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="min-w-0 truncate">{label}</span>
        <b className="shrink-0 tabular-nums">{num(value)}</b>
      </div>
      <div className="mt-1 h-1.5 bg-secondary">
        <GrowBar percent={Math.max(pct, value ? 1 : 0)} className="h-1.5 bg-[#1d4ed8]" />
      </div>
      {note && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{note}</p>}
    </li>
  );
}

function DailyChart({ daily }: { daily: AdminCustomerGrowth["daily"] }) {
  const max = Math.max(...daily.map((d) => d.bought + d.rest), 1);
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const shown = seen || reduced;
  const step = Math.max(1, Math.ceil(daily.length / 8));
  const current = hover === null ? null : daily[hover];
  return (
    <div>
      <div
        ref={ref}
        className="relative"
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        <div
          className="flex h-32 items-end gap-[2px] border-b border-border"
          role="img"
          aria-label={`Pendaftar baru, ${daily.length} titik`}
        >
          {daily.map((d, index) => {
            const total = d.bought + d.rest;
            return (
              <button
                key={`${d.label}-${index}`}
                type="button"
                aria-label={`${d.label}: ${total} baru, ${d.bought} sudah membayar`}
                onPointerEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                className={`flex h-full min-w-0 flex-1 flex-col justify-end outline-none transition-opacity focus-visible:ring-1 focus-visible:ring-brand-red ${hover !== null && hover !== index ? "opacity-45" : ""}`}
              >
                <span
                  className="bg-[#d4d4d8]"
                  style={{
                    height: shown ? `${(d.rest / max) * 100}%` : "0%",
                    transition: reduced
                      ? "none"
                      : `height 650ms cubic-bezier(0.22,1,0.36,1) ${Math.min(index * 12, 500)}ms`,
                  }}
                />
                <span
                  className="bg-[#166534]"
                  style={{
                    height: shown ? `${(d.bought / max) * 100}%` : "0%",
                    transition: reduced
                      ? "none"
                      : `height 650ms cubic-bezier(0.22,1,0.36,1) ${Math.min(index * 12, 500)}ms`,
                  }}
                />
              </button>
            );
          })}
        </div>
        {current && (
          <span
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap border border-border bg-card px-2 py-1 font-mono text-[10px] shadow-sm"
            style={{
              left: `${Math.min(88, Math.max(12, (((hover ?? 0) + 0.5) / daily.length) * 100))}%`,
            }}
          >
            <b>{current.bought + current.rest}</b> baru · {current.bought} membayar{" "}
            <span className="text-muted-foreground">{current.label}</span>
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {daily.map((d, index) => (
          <span
            key={`${d.label}-${index}`}
            className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-foreground"
          >
            {index % step === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <p className="mt-1.5 flex gap-3 text-[10.5px] text-muted-foreground">
        <span>
          <i className="mr-1 inline-block size-2 bg-[#166534]" />
          Sudah membayar
        </span>
        <span>
          <i className="mr-1 inline-block size-2 bg-[#d4d4d8]" />
          Belum membayar
        </span>
        <span className="ml-auto">puncak {num(max)}</span>
      </p>
    </div>
  );
}

function People({ people, empty }: { people: GrowthPerson[]; empty: string }) {
  if (people.length === 0)
    return <p className="py-3 text-center text-[11px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            to="/admin/customer/$id"
            params={{ id: person.id }}
            className="flex items-center gap-2 py-1.5 hover:bg-secondary/60"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${avatarTone(person.id)}`}
            >
              {(person.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{person.name}</span>
              {person.email && person.email !== person.name && (
                <span className="block truncate text-[10.5px] text-muted-foreground">
                  {person.email}
                </span>
              )}
            </span>
            <span className="shrink-0 text-right text-[10.5px] text-muted-foreground">
              {person.note}
              {person.lastActivityAt && (
                <span className="block">{formatAdminDateTime(person.lastActivityAt)}</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: number;
  hint: ReactNode;
  delta?: number | null;
}) {
  return (
    <div className="px-3 py-2 transition-colors hover:bg-secondary/40">
      <p className={MONO}>{label}</p>
      <p className="text-base font-semibold tabular-nums">
        <CountUp value={value} />
        {delta !== undefined && delta !== null && (
          <span
            className={`ml-1.5 text-[10.5px] font-medium ${delta < 0 ? "text-destructive" : "text-emerald-600"}`}
          >
            {delta < 0 ? "▼" : "▲"} {Math.abs(delta)}%
          </span>
        )}
      </p>
      <p className="truncate text-[10.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function CustomerGrowth({ data }: { data: AdminCustomerGrowth }) {
  const cohort = data.funnel[0]?.count ?? 0;
  const maxMonth = Math.max(...data.monthly.map((m) => m.total), 1);
  const k = data.kpi;
  return (
    <div className="space-y-3">
      <Reveal className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Kpi
          label="Pelanggan baru"
          value={k.newPeople}
          delta={changePct(k.newPeople, k.previousNewPeople)}
          hint={`${data.window.label} · vs periode sebelumnya`}
        />
        <Kpi
          label="Sudah membayar"
          value={k.newBuyers}
          hint={`${sharePct(k.newBuyers, k.newPeople) ?? 0}% dari pelanggan baru`}
        />
        <Kpi
          label="Aktif dalam rentang"
          value={k.activeInRange}
          hint="aktivitas terakhir di rentang ini"
        />
        <Kpi label="Total dikenal" value={k.everyone} hint={`${num(k.members)} member`} />
      </Reveal>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block
          title={
            data.window.granularity === "hour"
              ? "Pendaftar baru per jam"
              : "Pendaftar baru per hari"
          }
          hint={
            data.window.fromDay === data.window.toDay
              ? data.window.fromDay
              : `${data.window.fromDay} s/d ${data.window.toDay}`
          }
        >
          {data.daily.some((d) => d.bought + d.rest > 0) ? (
            <DailyChart daily={data.daily} />
          ) : (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Belum ada pelanggan baru pada rentang ini.
            </p>
          )}
        </Block>
        <Block title="Pendaftar per bulan" hint="12 bulan terakhir">
          <ul className="space-y-2">
            {data.monthly.map((m) => (
              <Bar
                key={m.month}
                label={m.month}
                value={m.total}
                pct={(m.total / maxMonth) * 100}
                note={`${num(m.bought)} sudah membayar`}
              />
            ))}
            {data.monthly.length === 0 && (
              <li className="py-3 text-center text-[11px] text-muted-foreground">
                Belum ada data.
              </li>
            )}
          </ul>
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Corong pelanggan" hint="pendaftar dalam rentang">
          <ul className="space-y-2">
            {data.funnel.map((step, index) => {
              const prev = data.funnel[index - 1]?.count ?? 0;
              const fromPrev = index === 0 ? null : sharePct(step.count, prev);
              return (
                <Bar
                  key={step.label}
                  label={step.label}
                  value={step.count}
                  pct={(step.count / Math.max(cohort, 1)) * 100}
                  note={
                    fromPrev === null
                      ? "semua pendaftar di rentang ini"
                      : `${fromPrev}% dari langkah sebelumnya`
                  }
                />
              );
            })}
          </ul>
        </Block>
        <Block title="Fitur yang dipakai" hint={`dari ${num(data.cohortMembers)} member baru`}>
          <ul className="space-y-2">
            {data.features.map((feature) => (
              <Bar
                key={feature.label}
                label={feature.label}
                value={feature.count}
                pct={sharePct(feature.count, data.cohortMembers) ?? 0}
                note={`${sharePct(feature.count, data.cohortMembers) ?? 0}% member baru`}
              />
            ))}
          </ul>
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Belanja terbesar" hint="sepanjang waktu">
          <People people={data.topSpenders} empty="Belum ada pembayaran." />
        </Block>
        <Block title="Belum pernah memesan" hint="member baru di rentang ini">
          <People people={data.neverOrdered} empty="Semua member baru sudah memesan." />
        </Block>
        <Block title="Hampir pergi" hint="pernah membayar, sepi 60+ hari">
          <People people={data.slipping} empty="Tidak ada saat ini." />
        </Block>
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        Segmen RFM, cohort retensi, dan pendapatan lengkap ada di{" "}
        <Link to="/admin/analytics" className="underline">
          Analitik
        </Link>
        .
      </p>
    </div>
  );
}
