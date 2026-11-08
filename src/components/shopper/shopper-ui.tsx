import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { brandById, type ShopperProduct } from "@/lib/personal-shopper";

/** Flat T-shirt glyph shown while a store image loads or when it is missing. */
function TeeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M9 9l7-4c1.5 3 6.5 3 8 0l7 4-3 7-3-1.5V34H15V14.5L12 16z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  );
}

/** Product photo from the store CDN with a quiet fallback. Square-ish, rounded, never stretched. */
export function ProductImage({
  src,
  alt,
  className = "",
  children,
}: {
  src: string | null;
  alt: string;
  className?: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-secondary text-muted-foreground ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <TeeGlyph className="size-1/2" />
      )}
      {children}
    </div>
  );
}

export function SaleTag({ product }: { product: Pick<ShopperProduct, "originalPrice" | "isNew"> }) {
  if (product.originalPrice)
    return (
      <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-red px-1.5 py-0.5 text-[9px] font-bold text-white">
        Diskon
      </span>
    );
  if (product.isNew)
    return (
      <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background">
        Baru
      </span>
    );
  return null;
}

export function BrandBubble({
  brand,
  size = 46,
  selected = false,
  muted = false,
}: {
  brand: "all" | ShopperProduct["brand"];
  size?: number;
  selected?: boolean;
  muted?: boolean;
}) {
  const info = brand === "all" ? null : brandById(brand);
  return (
    <span
      style={{
        width: size,
        height: size,
        background: info ? info.color : undefined,
      }}
      className={`flex items-center justify-center rounded-full text-[13px] font-extrabold transition-all duration-300 ${
        info ? "text-white" : "bg-secondary text-foreground"
      } ${selected ? "scale-[1.08] ring-2 ring-brand-red ring-offset-2 ring-offset-background" : ""} ${
        muted ? "opacity-45" : ""
      }`}
    >
      {info ? info.monogram : "All"}
    </span>
  );
}

/** Bottom sheet with the app's compact styling. */
export function ShopperSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-0 rounded-t-[22px] border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
      >
        <div
          className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/25"
          aria-hidden="true"
        />
        <SheetTitle className="text-[16px] font-bold leading-tight">{title}</SheetTitle>
        {description ? (
          <SheetDescription className="mt-0.5 text-[12px]">{description}</SheetDescription>
        ) : (
          <SheetDescription className="sr-only">{title}</SheetDescription>
        )}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function Chip({
  on,
  onClick,
  children,
  soon = false,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  soon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap ios-chip transition-colors ${
        on ? "bg-brand-red text-white" : "bg-secondary text-foreground"
      } ${soon ? "opacity-60" : ""}`}
    >
      {children}
      {soon ? <span className="ml-1 text-[8px] font-bold opacity-80">Segera</span> : null}
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary p-0.5">
      <button
        type="button"
        aria-label="Kurangi"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="tap flex size-7 items-center justify-center rounded-full bg-surface text-[15px] font-semibold disabled:opacity-40"
      >
        −
      </button>
      <b className="min-w-5 text-center text-[13px]">{value}</b>
      <button
        type="button"
        aria-label="Tambah"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="tap flex size-7 items-center justify-center rounded-full bg-surface text-[15px] font-semibold disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}
