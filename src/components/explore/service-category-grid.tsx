import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { assetForService } from "@/lib/explore-assets";
import { serviceHref, serviceStatusLabel, visibleTravelServices } from "@/lib/travel-services";

export function ServiceCategoryGrid() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {visibleTravelServices().map((service) => {
        const asset = assetForService(service.icon);
        const Icon = asset.fallback;
        const content = (
          <>
            <span className="relative flex size-12 items-center justify-center rounded-2xl bg-secondary/80">
              {asset.src ? (
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="size-11 object-contain"
                  loading="lazy"
                />
              ) : (
                <Icon className="size-6 text-brand-red" aria-hidden="true" />
              )}
            </span>
            <span className="mt-1.5 line-clamp-1 text-[11px] font-semibold">{service.label}</span>
            {service.status !== "ACTIVE" && (
              <span className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">
                {serviceStatusLabel[service.status]}
              </span>
            )}
          </>
        );
        const href = serviceHref(service);
        return href ? (
          <Link
            key={service.id}
            to={href}
            className="tap flex min-h-24 flex-col items-center rounded-2xl p-1 text-center hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </Link>
        ) : (
          <div
            key={service.id}
            aria-label={`${service.label}: ${serviceStatusLabel[service.status]}`}
            className="flex min-h-24 flex-col items-center rounded-2xl p-1 text-center opacity-75"
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
