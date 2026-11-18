import { useState, type ReactNode } from "react";
import { Check, Copy, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  SHIPPING_STATUS_LABEL,
  mapsSearchUrl,
  type DropPoint,
  type ShippingStatus,
} from "@/lib/shipping";

export const TRUCK_SRC = "/assets/explore/services/shipping-truck.svg";

export const shippingField =
  "min-h-10 w-full rounded-xl border border-border/70 bg-secondary/70 px-3 text-[14px] outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/15";
export const shippingPrimaryBtn =
  "tap ios-btn w-full bg-primary text-primary-foreground disabled:opacity-50";
export const shippingSoftBtn =
  "tap ios-btn w-full bg-secondary text-foreground disabled:opacity-50";

export function ShippingTruck({ className = "size-10" }: { className?: string }) {
  return (
    <img
      src={TRUCK_SRC}
      alt="Ikon truk pengiriman"
      className={`${className} shrink-0 object-contain`}
      decoding="async"
    />
  );
}

const TONE: Record<ShippingStatus, string> = {
  AWAITING_DROP: "bg-secondary text-muted-foreground",
  RECEIVED: "bg-[#E7ECFF] text-[#3B5BDB]",
  PAYMENT_PENDING: "bg-[#FFF1D6] text-[#92400E]",
  PAID: "bg-[#E7ECFF] text-[#3B5BDB]",
  SHIPPED: "bg-[#E7ECFF] text-[#3B5BDB]",
  ARRIVED: "bg-[#DCF5E3] text-[#15803D]",
  DELIVERED: "bg-[#DCF5E3] text-[#15803D]",
  CANCELLED: "bg-secondary text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-secondary text-muted-foreground",
};

export function ShippingStatusBadge({ status }: { status: ShippingStatus }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TONE[status]}`}
    >
      {SHIPPING_STATUS_LABEL[status]}
    </span>
  );
}

export function CopyButton({ value, label = "Salin" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Tidak bisa menyalin. Tahan teksnya untuk menyalin manual.");
        }
      }}
      className="tap inline-flex min-h-8 items-center gap-1 rounded-lg bg-secondary px-2.5 text-[11px] font-semibold"
    >
      {done ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {done ? "Tersalin" : label}
    </button>
  );
}

export function DropPointCard({ point }: { point: DropPoint }) {
  return (
    <div className="ios-card p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <MapPin className="size-4 text-brand-red" aria-hidden="true" />
        {point.name}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">{point.address}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">Buka {point.hours}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <CopyButton value={point.address} label="Salin alamat" />
        <a
          href={point.mapUrl || mapsSearchUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex min-h-8 items-center gap-1 rounded-lg bg-secondary px-2.5 text-[11px] font-semibold"
        >
          <MapPin className="size-3.5" aria-hidden="true" />
          Buka di Google Maps
        </a>
      </div>
    </div>
  );
}

export function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "pt-1 text-[14px] font-bold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

export function ShippingField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium text-muted-foreground">{label}</span>
        {children}
      </label>
      {error && (
        <span role="alert" className="mt-0.5 block text-[11px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
