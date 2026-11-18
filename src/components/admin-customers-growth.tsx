import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { AdminCustomerGrowth, GrowthPerson } from "@/lib/admin-customers.server";
import { avatarTone, sharePct } from "@/lib/admin-customers-view";
import { formatAdminDateTime } from "@/lib/admin-display";

const num = (value: number) => value.toLocaleString("id-ID");
const MONO = "font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground";

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className={MONO}>{title}</h3>
        {hint && <p className="truncate text-[10.5px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
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
        <div className="h-1.5 bg-[#1d4ed8]" style={{ width: `${Math.max(pct, value ? 1 : 0)}%` }} />
      </div>
      {note && <p className="mt-0.5 text-[10.5px] text-muted-foreground">{note}</p>}
    </li>
  );
}

function DailyChart({ daily }: { daily: AdminCustomerGrowth["daily"] }) {
  const max = Math.max(...daily.map((d) => d.bought + d.rest), 1);
  return (
    <div>
      <div
        className="flex h-28 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label={`Pendaftar baru per hari, ${daily.length} hari`}
      >
        {daily.map((d) => {
          const total = d.bought + d.rest;
          return (
            <div
              key={d.day}
              title={`${d.day}: ${total} baru, ${d.bought} sudah membayar`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <div className="bg-[#d4d4d8]" style={{ height: `${(d.rest / max) * 100}%` }} />
              <div className="bg-[#166534]" style={{ height: `${(d.bought / max) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{daily[0]?.day.slice(5) ?? ""}</span>
        <span>puncak {num(max)}/hari</span>
        <span>{daily.at(-1)?.day.slice(5) ?? ""}</span>
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

export function CustomerGrowth({ data }: { data: AdminCustomerGrowth }) {
  const everyone = data.funnel[0]?.count ?? 0;
  const maxMonth = Math.max(...data.monthly.map((m) => m.total), 1);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          ["Dikenal sistem", num(everyone), `${num(data.members)} member`],
          [
            "Aktif 7 hari",
            num(data.active7),
            `${sharePct(data.active7, everyone) ?? 0}% dari semua`,
          ],
          [
            "Aktif 30 hari",
            num(data.active30),
            `${sharePct(data.active30, everyone) ?? 0}% dari semua`,
          ],
          [
            "Pernah membayar",
            num(data.funnel[3]?.count ?? 0),
            `${sharePct(data.funnel[3]?.count ?? 0, everyone) ?? 0}% dari semua`,
          ],
        ].map(([label, value, hint]) => (
          <div key={label} className="px-3 py-2">
            <p className={MONO}>{label}</p>
            <p className="text-base font-semibold tabular-nums">{value}</p>
            <p className="text-[10.5px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Pendaftar baru per hari" hint="60 hari terakhir">
          {data.daily.length ? (
            <DailyChart daily={data.daily} />
          ) : (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              Belum ada pelanggan baru di 60 hari terakhir.
            </p>
          )}
        </Block>
        <Block title="Pendaftar per bulan" hint="termasuk yang sudah membayar">
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
        <Block title="Corong pelanggan" hint="dari dikenal sampai beli ulang">
          <ul className="space-y-2">
            {data.funnel.map((step, index) => {
              const prev = data.funnel[index - 1]?.count ?? 0;
              const fromPrev = index === 0 ? null : sharePct(step.count, prev);
              return (
                <Bar
                  key={step.label}
                  label={step.label}
                  value={step.count}
                  pct={(step.count / Math.max(everyone, 1)) * 100}
                  note={fromPrev === null ? "semua orang" : `${fromPrev}% dari langkah sebelumnya`}
                />
              );
            })}
          </ul>
        </Block>
        <Block title="Fitur yang dipakai" hint={`dari ${num(data.members)} member`}>
          <ul className="space-y-2">
            {data.features.map((feature) => (
              <Bar
                key={feature.label}
                label={feature.label}
                value={feature.count}
                pct={sharePct(feature.count, data.members) ?? 0}
                note={`${sharePct(feature.count, data.members) ?? 0}% member`}
              />
            ))}
          </ul>
        </Block>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Block title="Belanja terbesar" hint={`${data.topSpenders.length} teratas`}>
          <People people={data.topSpenders} empty="Belum ada pembayaran." />
        </Block>
        <Block title="Belum pernah memesan" hint="member lebih dari 2 hari">
          <People people={data.neverOrdered} empty="Semua member sudah memesan." />
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
