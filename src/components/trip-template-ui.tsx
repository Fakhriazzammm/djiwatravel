import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Sparkles, Users } from "lucide-react";
import { isAllowedImageUrl } from "@/lib/place-image";
import { compactIdr } from "@/lib/trip-templates";

export type TemplateCardData = {
  slug: string;
  title: string;
  destinationName: string;
  days: number;
  coverUrl: string | null;
  uses: number;
  featured: boolean;
  ownerName: string | null;
  byTravo: boolean;
};

export type TemplateViewItem = {
  /** Stable id inside one template page: links a list row to its pin on the map. */
  id?: string;
  lat?: number | null;
  lng?: number | null;
  /** Planned cost per traveler in rupiah. */
  costIdr?: number | null;
  day: number;
  start: string | null;
  end: string | null;
  title: string;
  location: string | null;
  category: string | null;
  image: string | null;
};

const CATEGORY: Record<string, string> = {
  wisata: "Wisata",
  kuliner: "Kuliner",
  belanja: "Belanja",
  transport: "Transport",
  akomodasi: "Akomodasi",
};

const MASCOT = "/assets/home-hero/mascot-map-v1.png";

/**
 * Cover of a template: its photo, or a brand gradient. With `branded` it carries the Djiwa Travel
 * badge and the mascot, so a shared template reads as ours even before the page is read.
 */
export function TemplateCover({
  url,
  title,
  className = "h-28",
  branded = false,
}: {
  url: string | null;
  title: string;
  className?: string;
  branded?: boolean;
}) {
  const photo = url && isAllowedImageUrl(url);
  return (
    <div className={`relative w-full overflow-hidden rounded-xl ${className}`}>
      {photo ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-full items-end bg-gradient-to-br from-brand-red/90 to-brand-red/50 p-2.5"
        >
          <span className="line-clamp-2 text-[13px] font-bold leading-4 text-white">{title}</span>
        </div>
      )}
      {branded && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 to-transparent"
          />
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-red shadow">
            Djiwa Travel
          </span>
          <span className="absolute bottom-2.5 left-3 right-24 line-clamp-2 text-[15px] font-bold leading-5 text-white drop-shadow">
            {title}
          </span>
          <img
            src={MASCOT}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 right-1 h-24 w-auto drop-shadow-lg"
          />
        </>
      )}
    </div>
  );
}

export function TemplateCard({ template }: { template: TemplateCardData }) {
  return (
    <Link
      to="/template/$slug"
      params={{ slug: template.slug }}
      className="tap block rounded-2xl bg-surface p-2 ring-1 ring-border/50"
    >
      <TemplateCover url={template.coverUrl} title={template.destinationName} />
      <div className="px-1 pb-1 pt-2">
        <p className="line-clamp-2 text-[14px] font-semibold leading-[18px]">{template.title}</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="size-3" aria-hidden="true" />
          <span className="truncate">{template.destinationName}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{template.days} hari</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          {template.byTravo ? (
            <Sparkles className="size-3 text-brand-red" aria-hidden="true" />
          ) : (
            <Users className="size-3" aria-hidden="true" />
          )}
          <span className="truncate">
            {template.byTravo ? "Disusun Travo" : (template.ownerName ?? "Member Djiwa")}
            {template.uses > 0 ? ` · dipakai ${template.uses}x` : ""}
          </span>
        </p>
      </div>
    </Link>
  );
}

/** Read-only itinerary grouped by "Hari N" (a template has no dates). */
export function TemplateDays({
  items,
  days,
  activeId = null,
  onSelect,
}: {
  items: TemplateViewItem[];
  days: number;
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const byDay = new Map<number, TemplateViewItem[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  return (
    <div className="space-y-3">
      {Array.from({ length: days }, (_, i) => i + 1)
        .filter((day) => byDay.has(day))
        .map((day) => (
          <section
            key={day}
            className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border/50"
          >
            <h3 className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2 text-[13px] font-bold">
              <CalendarDays className="size-3.5 text-brand-red" aria-hidden="true" />
              Hari {day}
            </h3>
            <ol className="divide-y divide-border/50">
              {byDay.get(day)!.map((item, index) => (
                <li
                  key={`${day}-${index}`}
                  id={item.id ? `item-${item.id}` : undefined}
                  onClick={item.id && onSelect ? () => onSelect(item.id!) : undefined}
                  className={`flex gap-2.5 px-3 py-2.5 transition-colors ${item.id && onSelect ? "cursor-pointer" : ""} ${item.id && item.id === activeId ? "bg-brand-red/10" : ""}`}
                >
                  <span className="w-11 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {item.start ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-[18px]">{item.title}</p>
                    {item.location && (
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {item.location}
                      </p>
                    )}
                    {item.costIdr ? (
                      <p className="mt-0.5 text-[11px] font-medium text-brand-red">
                        ≈ {compactIdr(item.costIdr)} / orang
                      </p>
                    ) : null}
                    {item.category && CATEGORY[item.category] && (
                      <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {CATEGORY[item.category]}
                      </span>
                    )}
                  </div>
                  {item.image && isAllowedImageUrl(item.image) && (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="size-11 shrink-0 rounded-lg object-cover"
                    />
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
    </div>
  );
}
