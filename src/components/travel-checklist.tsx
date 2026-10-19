import { CalendarDays, Check, Trash2 } from "lucide-react";
import type { ChecklistKey, ChecklistItem } from "@/lib/travel-journey";
import { group, row } from "@/components/shell";

const STATE_LABEL: Record<ChecklistItem["state"], string> = {
  done: "Selesai",
  due: "Saatnya dilakukan",
  upcoming: "Belum waktunya",
  "no-date": "Isi tanggal keberangkatan",
};

export function TravelChecklist({
  items,
  departureDate,
  daysUntil,
  progress,
  onSetDepartureDate,
  onToggle,
  compact = false,
}: {
  items: ChecklistItem[];
  departureDate: string | null;
  daysUntil: number | null;
  progress: { done: number; total: number; percent: number };
  onSetDepartureDate: (value: string | null) => void;
  onToggle: (key: ChecklistKey, done: boolean) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl bg-surface ${compact ? "p-4" : "p-5"}`}
      data-testid="travel-checklist"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Persiapan perjalanan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Centang langkahnya supaya tidak ada yang terlewat sebelum berangkat.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold">
          {progress.done}/{progress.total}
        </span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mt-5">
        <label className="block text-[13px] font-medium" htmlFor="departure-date">
          Tanggal keberangkatan
        </label>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {daysUntil === null
            ? "Isi tanggalnya supaya kami bisa mengingatkan langkah yang harus dilakukan lebih dulu."
            : "Pengingat di bawah mengikuti tanggal ini."}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="departure-date"
            type="date"
            value={departureDate ?? ""}
            onChange={(event) =>
              onSetDepartureDate(event.target.value === "" ? null : event.target.value)
            }
            className="h-11 flex-1 rounded-xl bg-secondary px-3 text-[14px]"
          />
          {departureDate && (
            <button
              type="button"
              onClick={() => onSetDepartureDate(null)}
              aria-label="Hapus tanggal keberangkatan"
              className="tap flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {daysUntil !== null && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-red">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {daysUntil === 0
              ? "Hari keberangkatan"
              : daysUntil > 0
                ? `${daysUntil} hari lagi`
                : daysUntil === -1
                  ? "Sudah berangkat kemarin"
                  : `Sudah berangkat ${Math.abs(daysUntil)} hari lalu`}
          </p>
        )}
      </div>

      <ul className={`${group} mt-5`}>
        {items.map((item) => {
          const done = item.state === "done";
          return (
            <li key={item.key}>
              <label className={`${row} cursor-pointer items-start gap-3`}>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) => onToggle(item.key, event.target.checked)}
                  className="mt-0.5 size-5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[14px] font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                    >
                      {item.label}
                    </span>
                    {item.milestone && (
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {item.milestone}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {item.hint}
                  </span>
                  <span className="sr-only">{STATE_LABEL[item.state]}</span>
                </span>
                {done && (
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {items.every((item) => item.state === "no-date") && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Checklist tetap bisa dicentang tanpa tanggal; pengingat H-7 dan H-1 muncul setelah tanggal
          diisi.
        </p>
      )}
    </section>
  );
}
