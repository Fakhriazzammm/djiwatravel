import { useRouter } from "@tanstack/react-router";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RANGE_GROUPS,
  RANGE_LABEL,
  describeRange,
  parseDay,
  resolveRange,
  toDayString,
  type RangeKey,
} from "@/lib/date-range";

export type RangeValue = { range: string; from?: string | undefined; to?: string | undefined };

/**
 * One date filter for every Admin analytics page: presets (today, yesterday, this/last week,
 * this/last month, this year, rolling spans) and a from–to date range. It navigates the current
 * route with `range`, `from` and `to` search params, so every filter is a shareable link.
 */
export function AdminRangePicker({
  to,
  search,
  value,
  keys,
  compareNote = true,
}: {
  to: string;
  search: Record<string, unknown>;
  value: RangeValue;
  /** Limit the presets (defaults to all groups). */
  keys?: RangeKey[];
  compareNote?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { range: rangeKey, from: rangeFrom, to: rangeTo } = value;
  const resolved = useMemo(
    () => resolveRange({ range: rangeKey, from: rangeFrom, to: rangeTo }, "30h"),
    [rangeKey, rangeFrom, rangeTo],
  );
  const today = toDayString(Date.now());
  const [from, setFrom] = useState(value.from ?? resolved.fromDay);
  const [until, setUntil] = useState(value.to ?? resolved.toDay);

  useEffect(() => {
    setFrom(value.from ?? resolved.fromDay);
    setUntil(value.to ?? resolved.toDay);
  }, [resolved.fromDay, resolved.toDay, value.from, value.to]);

  const apply = (range: RangeKey, fromDay?: string, toDay?: string) => {
    setOpen(false);
    void router.navigate({
      to,
      search: { ...search, range, from: fromDay, to: toDay },
    } as never);
  };

  const customValid =
    parseDay(from) !== null &&
    parseDay(until) !== null &&
    (parseDay(from) as number) <= (parseDay(until) as number);
  const groups = RANGE_GROUPS.map((group) => ({
    ...group,
    keys: keys ? group.keys.filter((key) => keys.includes(key)) : group.keys,
  })).filter((group) => group.keys.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-2 border border-border bg-card px-3 text-left transition-colors hover:bg-secondary"
        >
          <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold leading-tight">{resolved.label}</span>
            <span className="block text-[10.5px] leading-tight text-muted-foreground">
              {describeRange(resolved)}
            </span>
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        aria-label="Pilih rentang waktu"
        className="w-[22rem] max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-none border-border bg-card p-3 text-card-foreground shadow-lg motion-reduce:animate-none"
      >
        <div className="space-y-2.5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.keys.map((key) => {
                  const active = resolved.key === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => apply(key)}
                      className={`inline-flex min-h-8 items-center gap-1 border px-2.5 text-[12px] transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}
                    >
                      {active && <Check className="size-3" aria-hidden="true" />}
                      {RANGE_LABEL[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-2.5">
            <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rentang tanggal
            </p>
            <div className="flex items-center gap-1.5">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Dari tanggal</span>
                <input
                  type="date"
                  value={from}
                  max={until || today}
                  onChange={(event) => setFrom(event.target.value)}
                  className="min-h-9 w-full border border-border bg-background px-2 text-[12px]"
                />
              </label>
              <span className="text-[11px] text-muted-foreground">s/d</span>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Sampai tanggal</span>
                <input
                  type="date"
                  value={until}
                  min={from}
                  max={today}
                  onChange={(event) => setUntil(event.target.value)}
                  className="min-h-9 w-full border border-border bg-background px-2 text-[12px]"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!customValid}
              onClick={() => apply("kustom", from, until)}
              className="mt-2 min-h-9 w-full bg-foreground px-3 text-[12px] font-semibold text-background disabled:opacity-40"
            >
              Terapkan rentang
            </button>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              Maksimal 366 hari. Waktu dihitung dalam WIB.
            </p>
          </div>
          {compareNote && (
            <p className="text-[10.5px] text-muted-foreground">
              Perbandingan memakai periode sebelumnya dengan panjang yang sama.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
