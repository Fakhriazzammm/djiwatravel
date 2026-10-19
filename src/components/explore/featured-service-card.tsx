import { ArrowUpRight, Smartphone } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Destination } from "@/lib/catalog";
import type { AffiliateService } from "@/lib/affiliate-services";

export function FeaturedServiceCard({
  destination,
  affiliate,
}: {
  destination?: Destination;
  affiliate?: AffiliateService;
}) {
  if (affiliate) {
    return (
      <a
        href={affiliate.affiliateUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tap block rounded-2xl bg-surface p-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
            Partner eksternal
          </span>
          <ArrowUpRight className="size-4" />
        </div>
        <p className="mt-3 font-semibold">{affiliate.productTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {affiliate.partnerName} · transaksi di website partner
        </p>
      </a>
    );
  }
  if (!destination) return null;
  return (
    <Link
      to="/destination/$code"
      params={{ code: destination.code.toLowerCase() }}
      className="tap flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-red-soft">
        <Smartphone className="size-5 text-brand-red" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-brand-red">
          eSIM tersedia
        </span>
        <span className="mt-1 block truncate text-sm font-semibold">eSIM {destination.nameId}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Paket aktual dari katalog
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
