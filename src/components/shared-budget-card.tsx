import { Wallet } from "lucide-react";

export type BudgetLine = {
  name: string;
  amount: string;
  share: number;
  /** Where the amount comes from. */
  note?: string;
  /** One of our own features that can book or check this line (flight search, eSIM). */
  action?: { label: string; href: string };
};

/**
 * Planned budget of a template or a shared itinerary: the total and one bar per category. It shows
 * amounts set aside in advance, never what a traveler actually spent.
 */
export function SharedBudgetCard({
  title,
  total,
  note,
  lines,
}: {
  title: string;
  total: string;
  note: string;
  lines: BudgetLine[];
}) {
  return (
    <section aria-label={title} className="rounded-2xl bg-surface p-3 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold">
            <Wallet className="size-4 text-brand-red" aria-hidden="true" />
            {title}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
        </div>
        <p className="shrink-0 text-[17px] font-bold tabular-nums leading-6">{total}</p>
      </div>
      {lines.length > 1 && (
        <ul className="mt-2.5 space-y-2">
          {lines.map((line) => (
            <li key={line.name}>
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate font-medium">{line.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{line.amount}</span>
              </div>
              {(line.note || line.action) && (
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {line.note}
                  {line.action && (
                    <>
                      {line.note ? " " : ""}
                      <a href={line.action.href} className="font-semibold text-brand-red">
                        {line.action.label}
                      </a>
                    </>
                  )}
                </p>
              )}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-brand-red"
                  style={{ width: `${Math.max(3, Math.min(100, Math.round(line.share * 100)))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
