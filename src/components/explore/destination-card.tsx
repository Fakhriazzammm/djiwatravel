import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Destination } from "@/lib/catalog";

export function DestinationCard({
  destination,
  available,
}: {
  destination: Destination;
  available: boolean;
}) {
  return (
    <Link
      to="/destination/$code"
      params={{ code: destination.code.toLowerCase() }}
      className="tap relative block min-w-[148px] overflow-hidden rounded-2xl bg-surface shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-20 items-end justify-between bg-gradient-to-br from-brand-red-soft via-secondary to-background p-3">
        <span className="text-3xl drop-shadow-sm">{destination.flag}</span>
        <span className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {destination.region}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[14px] font-semibold">{destination.nameId}</p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {available ? "eSIM tersedia" : "Jelajahi destinasi"}
        </p>
      </div>
    </Link>
  );
}
