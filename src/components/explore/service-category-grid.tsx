import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { assetForService } from "@/lib/explore-assets";
import { serviceHref, serviceStatusLabel, visibleTravelServices } from "@/lib/travel-services";

const tileClass =
  "group relative flex min-h-[132px] flex-col items-center rounded-2xl px-1.5 pb-2.5 pt-2 text-center transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ServiceCategoryGrid() {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {visibleTravelServices().map((service) => {
        const asset = assetForService(service.icon);
        const Icon = asset.fallback;
        const href = serviceHref(service);
        const content = (
          <>
            <span className="relative flex size-[74px] items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5">
              {asset.src ? (
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="relative size-[70px] object-contain"
                  loading="lazy"
                />
              ) : (
                <Icon className="relative size-6 text-brand-red" aria-hidden="true" />
              )}
            </span>
            <span className="mt-2 line-clamp-1 text-[11px] font-bold leading-tight">
              {service.label}
            </span>
            {service.status === "ACTIVE" ? (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-red-soft px-1.5 py-0.5 text-[9px] font-bold text-brand-red">
                <span className="size-1.5 rounded-full bg-brand-red" aria-hidden="true" />
                Tersedia
              </span>
            ) : (
              <span className="mt-1 line-clamp-1 text-[9px] font-medium text-muted-foreground">
                {serviceStatusLabel[service.status]}
              </span>
            )}
          </>
        );
        return href ? (
          <Link
            key={service.id}
            to={href}
            aria-label={`${service.label}: buka halaman layanan`}
            className={`${tileClass} tap`}
          >
            {content}
            <ChevronRight
              className="absolute right-1.5 top-1.5 size-3.5 text-muted-foreground/70"
              aria-hidden="true"
            />
          </Link>
        ) : (
          <div
            key={service.id}
            aria-label={`${service.label}: ${serviceStatusLabel[service.status]}`}
            className={`${tileClass} opacity-80`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function ServiceSectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[18px] font-bold">{title}</h2>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

export function ServiceCardArrow() {
  return <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />;
}
