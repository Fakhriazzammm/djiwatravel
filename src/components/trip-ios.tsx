import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Home,
  Ticket,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FixedLayer } from "@/components/motion-primitives";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export type TripTabId = "summary" | "itinerary" | "bookings" | "checklist" | "budget";

const tripTabs: Array<{ id: TripTabId; label: string; icon: LucideIcon }> = [
  { id: "summary", label: "Ringkas", icon: Home },
  { id: "itinerary", label: "Agenda", icon: CalendarDays },
  { id: "bookings", label: "Booking", icon: Ticket },
  { id: "checklist", label: "Checklist", icon: CheckCircle2 },
  { id: "budget", label: "Biaya", icon: WalletCards },
];

/** Bottom tab bar scoped to one trip (replaces the global bar on trip pages), iOS style. */
export function TripTabBar({ tripId, active }: { tripId: string; active: TripTabId }) {
  return (
    <FixedLayer>
      <nav
        aria-label="Bagian perjalanan"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1.5 pb-1">
          {tripTabs.map(({ id, label, icon: Icon }) => {
            const on = id === active;
            const className = `tap flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium ${
              on ? "text-brand-red" : "text-muted-foreground"
            }`;
            const body = (
              <>
                <Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} aria-hidden="true" />
                {label}
              </>
            );
            return id === "summary" ? (
              <Link
                key={id}
                to="/my-trips/$tripId"
                params={{ tripId }}
                className={className}
                aria-current={on ? "page" : undefined}
              >
                {body}
              </Link>
            ) : (
              <Link
                key={id}
                to="/my-trips/$tripId/$section"
                params={{ tripId, section: id }}
                className={className}
                aria-current={on ? "page" : undefined}
              >
                {body}
              </Link>
            );
          })}
        </div>
      </nav>
    </FixedLayer>
  );
}

/** Compact iOS navigation bar: tinted "‹ Back" on the left, one action on the right. */
export function TripNavBar({
  backLabel,
  backTo,
  backTripId,
  action,
}: {
  backLabel: string;
  backTo: "list" | "trip";
  backTripId?: string;
  action?: ReactNode;
}) {
  const className =
    "tap -ml-2 flex min-h-11 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] text-brand-red";
  return (
    <div className="flex h-11 items-center justify-between">
      {backTo === "trip" && backTripId ? (
        <Link to="/my-trips/$tripId" params={{ tripId: backTripId }} className={className}>
          <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden="true" />
          <span className="max-w-[60vw] truncate">{backLabel}</span>
        </Link>
      ) : (
        <Link to="/my-trips" className={className}>
          <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden="true" />
          <span className="max-w-[60vw] truncate">{backLabel}</span>
        </Link>
      )}
      <div className="flex items-center">{action}</div>
    </div>
  );
}

/** iOS-style grouped list container. */
export const iosGroup = "overflow-hidden rounded-[14px] bg-surface ring-1 ring-border/40";
export const iosHeading =
  "px-4 pb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground";

/** In-app confirmation (never window.confirm, which browsers and installed PWAs can suppress). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[320px] rounded-[18px] p-0 text-center">
        <AlertDialogHeader className="p-5 pb-4 text-center sm:text-center">
          <AlertDialogTitle className="text-[15px]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-5">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="grid grid-cols-2 gap-0 divide-x divide-border/70 border-t border-border/70 sm:space-x-0">
          <AlertDialogCancel
            disabled={busy}
            className="m-0 min-h-10 rounded-none rounded-bl-[18px] border-0 bg-transparent text-[14px] text-brand-red shadow-none"
          >
            Batal
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className={`m-0 min-h-10 rounded-none rounded-br-[18px] bg-transparent text-[14px] font-semibold shadow-none hover:bg-transparent ${
              destructive ? "text-destructive" : "text-brand-red"
            }`}
          >
            {busy ? "Memproses…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type SheetAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  primary?: boolean;
  disabled?: boolean;
};

/** iOS action sheet: grouped actions plus a separate Cancel button. */
export function TripActionSheet({
  open,
  onOpenChange,
  title,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto flex w-full max-w-md flex-col gap-2 border-0 bg-transparent p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-none ring-0"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">Pilih tindakan untuk {title}</SheetDescription>
        <div className="overflow-hidden rounded-[14px] bg-background/95 backdrop-blur-xl">
          <p className="px-4 py-3 text-center text-[12px] font-medium text-muted-foreground">
            {title}
          </p>
          {actions.map(({ label, icon: Icon, onSelect, destructive, primary, disabled }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => {
                onOpenChange(false);
                onSelect();
              }}
              className={`tap flex min-h-[52px] w-full items-center justify-center gap-2 border-t border-border/60 text-[15px] disabled:opacity-40 ${
                destructive ? "text-destructive" : "text-brand-red"
              } ${primary ? "font-semibold" : ""}`}
            >
              {Icon && <Icon className="size-[18px]" aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="tap min-h-[52px] w-full rounded-[14px] bg-background text-[15px] font-semibold text-brand-red"
        >
          Batal
        </button>
      </SheetContent>
    </Sheet>
  );
}

/** Progress ring used for checklist and budget tiles. */
export function ProgressRing({
  percent,
  label,
  color,
}: {
  percent: number;
  label: string;
  color: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${value}%, var(--secondary) 0)` }}
    >
      <span className="grid size-[34px] place-items-center rounded-full bg-surface text-[10px] font-bold tabular-nums">
        {value}%
      </span>
    </div>
  );
}
