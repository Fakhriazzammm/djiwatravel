import { CalendarDays, CheckCircle2, ListChecks, Undo2, WalletCards } from "lucide-react";
import { formatTripMoney } from "@/lib/trip-money";
import type { AgendaChange, ProposalView } from "@/lib/trip-assistant";

const dayLabel = (key: string) => {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(
        date,
      );
};

const OP_LABEL = { add: "Baru", update: "Diubah", remove: "Dihapus" } as const;

function AgendaRows({
  items,
  previous,
}: {
  items: AgendaChange[];
  previous: ProposalView["previous"];
}) {
  const groups: { date: string; rows: AgendaChange[] }[] = [];
  for (const change of items) {
    const prev = change.itemId ? previous[change.itemId] : undefined;
    const date = change.date || prev?.date || "";
    let group = groups.find((g) => g.date === date);
    if (!group) groups.push((group = { date, rows: [] }));
    group.rows.push(change);
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.date}>
          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.date ? dayLabel(group.date) : "Agenda"}
          </p>
          {group.rows.map((change, index) => {
            const prev = change.itemId ? previous[change.itemId] : undefined;
            const title = change.title || prev?.title || "Aktivitas";
            const time = change.startTime
              ? `${change.startTime}${change.endTime ? `-${change.endTime}` : ""}`
              : "";
            return (
              <div
                key={`${change.itemId ?? "new"}-${index}`}
                className="flex min-h-11 items-start gap-2.5 px-3 py-1.5"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    change.op === "remove"
                      ? "bg-destructive/10 text-destructive"
                      : change.op === "update"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-brand-red-soft text-brand-red"
                  }`}
                >
                  {OP_LABEL[change.op]}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13px] font-semibold ${change.op === "remove" ? "line-through opacity-60" : ""}`}
                  >
                    {title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {change.op === "update" &&
                    prev?.startTime &&
                    time &&
                    prev.startTime !== change.startTime
                      ? `${prev.startTime} → ${time}`
                      : time || "Tanpa jam"}
                    {change.location ? ` · ${change.location}` : ""}
                  </span>
                  {change.note && (
                    <span
                      className={`block text-[11px] ${
                        change.hours?.open === false
                          ? "font-semibold text-amber-700"
                          : "text-muted-foreground/80"
                      }`}
                    >
                      {change.hours?.open === true
                        ? "✓ "
                        : change.hours?.open === false
                          ? "⚠ "
                          : ""}
                      {change.note}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** What the AI proposes, readable at a glance, with Apply / Undo. Never edits the payload. */
export function ProposalCard({
  proposal,
  currency,
  busy,
  onApply,
  onUndo,
  onDismiss,
}: {
  proposal: ProposalView;
  currency: string;
  busy: boolean;
  onApply: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { payload } = proposal;
  const Icon =
    payload.kind === "agenda"
      ? CalendarDays
      : payload.kind === "budget" || payload.kind === "expense"
        ? WalletCards
        : ListChecks;
  const money = (minor: number) => formatTripMoney(minor, currency);
  let body: React.ReactNode = null;
  if (payload.kind === "agenda")
    body = <AgendaRows items={payload.items} previous={proposal.previous} />;
  else if (payload.kind === "budget") {
    const sum = payload.budget.categories.reduce((s, c) => s + c.allocatedMinor, 0);
    const total = payload.budget.totalMinor ?? sum;
    body = (
      <div className="px-3 py-2">
        <p className="text-[11px] text-muted-foreground">Total anggaran</p>
        <p className="text-[18px] font-bold tabular-nums">{money(total)}</p>
        <div className="mt-2 space-y-1.5">
          {payload.budget.categories.map((c) => (
            <div key={c.name}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="font-semibold tabular-nums">{money(c.allocatedMinor)}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-brand-red"
                  style={{
                    width: `${Math.min(100, Math.round((c.allocatedMinor / (total || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (payload.kind === "checklist")
    body = (
      <ul className="px-3 py-1.5">
        {payload.checklist.items.map((item) => (
          <li key={item.title} className="flex min-h-9 items-center gap-2 text-[13px]">
            <CheckCircle2
              className="size-4 shrink-0 text-brand-red"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.dueDate && (
              <span className="text-[11px] text-muted-foreground">{dayLabel(item.dueDate)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  else
    body = (
      <div className="px-3 py-2">
        <p className="text-[13px] font-semibold">{payload.expense.description}</p>
        <p className="text-[18px] font-bold tabular-nums">
          {formatTripMoney(payload.expense.amountMinor, payload.expense.currency)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {dayLabel(payload.expense.date)}
          {payload.expense.categoryName ? ` · ${payload.expense.categoryName}` : ""}
          {payload.expense.currency !== currency ? ` · dikonversi ke ${currency}` : ""}
        </p>
      </div>
    );

  const faded = proposal.status === "dismissed" || proposal.status === "undone";
  return (
    <div
      className={`ml-8 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/50 ${faded ? "opacity-60" : ""}`}
      data-testid="assistant-proposal"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          {proposal.title}
        </p>
      </div>
      {body}
      <div className="flex gap-2 border-t border-border/60 px-3 py-2">
        {proposal.status === "proposed" && (
          <>
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="tap min-h-9 flex-1 rounded-xl bg-secondary px-3 text-[13px] font-semibold disabled:opacity-50"
            >
              Tidak
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={busy}
              className="tap min-h-9 flex-[1.5] rounded-xl bg-brand-red px-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Menerapkan…" : "Terapkan"}
            </button>
          </>
        )}
        {proposal.status === "applied" && (
          <>
            <span className="flex min-h-9 flex-1 items-center gap-1.5 text-[13px] font-semibold text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Diterapkan
            </span>
            <button
              type="button"
              onClick={onUndo}
              disabled={busy}
              className="tap inline-flex min-h-9 items-center gap-1 rounded-xl bg-secondary px-3 text-[13px] font-semibold disabled:opacity-50"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              Urungkan
            </button>
          </>
        )}
        {proposal.status === "undone" && (
          <span className="min-h-9 py-2 text-[13px] text-muted-foreground">Dibatalkan</span>
        )}
        {proposal.status === "dismissed" && (
          <span className="min-h-9 py-2 text-[13px] text-muted-foreground">Tidak dipakai</span>
        )}
      </div>
    </div>
  );
}
