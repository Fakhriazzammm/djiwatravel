import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { destinationPhoto } from "@/lib/destination-artwork";
import type { Destination } from "@/lib/catalog";

export function DestinationCard({
  destination,
  available,
}: {
  destination: Destination;
  available: boolean;
}) {
  const photo = destinationPhoto(destination.code);

  return (
    <Link
      to="/destination/$code"
      params={{ code: destination.code.toLowerCase() }}
      className="tap relative block min-w-[148px] overflow-hidden rounded-2xl bg-surface shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-brand-red-soft via-secondary to-background">
        {photo ? (
          <img
            src={photo}
            alt={`Pemandangan ${destination.nameId}`}
            className="size-full object-cover"
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="text-3xl drop-shadow-sm" aria-hidden="true">
              {destination.flag}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
        <span className="absolute bottom-2 left-2 rounded-full bg-background/85 px-2 py-1 text-[10px] font-semibold text-foreground backdrop-blur-sm">
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
