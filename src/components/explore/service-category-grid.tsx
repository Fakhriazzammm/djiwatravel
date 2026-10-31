import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { assetForService } from "@/lib/explore-assets";
import { serviceHref, serviceStatusLabel, visibleTravelServices } from "@/lib/travel-services";
import "./service-category-grid.css";

const tileClass =
  "group relative flex min-h-[108px] flex-col items-center rounded-2xl px-0.5 pb-2 pt-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ServiceCategoryGrid() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const services = useMemo(() => visibleTravelServices(), []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    // Start all SVG requests together instead of waiting for lazy image observation.
    const links = services
      .map((service) => assetForService(service.icon).src)
      .filter(Boolean)
      .map((href) => {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = href;
        document.head.appendChild(link);
        return link;
      });

    return () => links.forEach((link) => link.remove());
  }, [services]);

  return (
    <>
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-1" role="list">
        {services.map((service) => {
          const asset = assetForService(service.icon);
          const Icon = asset.fallback;
          const href = serviceHref(service);
          const content = (
            <>
              <span className="service-category-icon relative flex size-[56px] items-center justify-center">
                {asset.src ? (
                  <img
                    src={asset.src}
                    alt={asset.alt}
                    className="relative size-[54px] object-contain"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                ) : (
                  <Icon className="relative size-6 text-brand-red" aria-hidden="true" />
                )}
              </span>
              <span className="mt-1.5 line-clamp-1 text-[10px] font-bold leading-tight">
                {service.label}
              </span>
              {service.status === "ACTIVE" ? (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-red-soft px-1.5 py-0.5 text-[8px] font-bold text-brand-red">
                  <span className="size-1.5 rounded-full bg-brand-red" aria-hidden="true" />
                  Tersedia
                </span>
              ) : (
                <span className="mt-0.5 line-clamp-1 text-[8px] font-medium text-muted-foreground">
                  {serviceStatusLabel[service.status]}
                </span>
              )}
            </>
          );
          return (
            <div key={service.id} role="listitem">
              {href ? (
                <Link
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
                <button
                  type="button"
                  aria-label={`${service.label}: ${serviceStatusLabel[service.status]}`}
                  className={`${tileClass} tap w-full opacity-80`}
                  onClick={() => setSelectedService(service.label)}
                >
                  {content}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedService && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm text-muted-foreground"
        >
          {selectedService} segera hadir. Layanan ini belum tersedia saat ini.
        </p>
      )}
    </>
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
