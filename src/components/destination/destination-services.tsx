import { ArrowUpRight, Check, Clock3 } from "lucide-react";
import type { Destination } from "@/lib/catalog";
import { activeAffiliateServices, affiliateServices } from "@/lib/affiliate-services";
import { travelServices } from "@/lib/travel-services";

export function DestinationServices({ destination }: { destination: Destination }) {
  const affiliate = activeAffiliateServices(affiliateServices).filter(
    (item) => item.destinationCode.toUpperCase() === destination.code.toUpperCase(),
  );
  const available = travelServices.filter(
    (service) => service.id === "esim" || service.status === "AFFILIATE",
  );
  const upcoming = travelServices.filter(
    (service) => service.id !== "esim" && service.status === "COMING_SOON",
  );
  return (
    <section className="mt-5 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Kebutuhan perjalanan</h2>
          <p className="mt-1 text-xs text-muted-foreground">Layanan untuk {destination.nameId}</p>
        </div>
        <span className="rounded-full bg-brand-red-soft px-2 py-1 text-[10px] font-bold text-brand-red">
          Destination-first
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {available.map((service) => (
          <div
            key={service.id}
            className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm"
          >
            <Check className="size-4 text-success" />
            <span className="font-semibold">{service.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">Aktif</span>
          </div>
        ))}
        {affiliate.map((item) => (
          <a
            key={item.id}
            href={item.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm"
          >
            <ArrowUpRight className="size-4" />
            <span className="min-w-0 flex-1 truncate font-semibold">{item.productTitle}</span>
            <span className="text-[10px] text-muted-foreground">Partner</span>
          </a>
        ))}
        {upcoming.slice(0, 4).map((service) => (
          <div
            key={service.id}
            className="flex items-center gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground"
          >
            <Clock3 className="size-4" />
            <span className="font-medium">{service.label}</span>
            <span className="ml-auto text-[10px]">Segera</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Layanan selain eSIM belum dapat dipesan dan tidak membuat checkout palsu.
      </p>
    </section>
  );
}
