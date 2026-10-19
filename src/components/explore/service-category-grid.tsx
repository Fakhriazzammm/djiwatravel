import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { assetForService } from "@/lib/explore-assets";
import { serviceHref, serviceStatusLabel, visibleTravelServices } from "@/lib/travel-services";

const tileClass =
  "group relative flex min-h-[132px] flex-col items-center rounded-2xl px-1.5 pb-2.5 pt-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const tileVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 360, damping: 30, mass: 0.8 },
  },
};

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      // All tiles enter as one coordinated group; the assets must not appear one-by-one.
      staggerChildren: 0,
      delayChildren: 0,
    },
  },
};

export function ServiceCategoryGrid() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const services = useMemo(() => visibleTravelServices(), []);

  useEffect(() => setMounted(true), []);

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
  }, [reduceMotion, services]);

  return (
    <motion.div
      className="grid grid-cols-4 gap-2.5"
      variants={gridVariants}
      initial={mounted && !reduceMotion ? "hidden" : false}
      animate="show"
      role="list"
    >
      {services.map((service) => {
        const asset = assetForService(service.icon);
        const Icon = asset.fallback;
        const href = serviceHref(service);
        const content = (
          <>
            <span className="relative flex size-[74px] items-center justify-center">
              {asset.src ? (
                <img
                  src={asset.src}
                  alt={asset.alt}
                  className="relative size-[70px] object-contain"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
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
        return (
          <motion.div key={service.id} variants={tileVariants} role="listitem">
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
              <div
                aria-label={`${service.label}: ${serviceStatusLabel[service.status]}`}
                className={`${tileClass} opacity-80`}
              >
                {content}
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
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
