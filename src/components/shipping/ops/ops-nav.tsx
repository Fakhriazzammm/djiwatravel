import { Camera, ListChecks, Menu, Package, Truck } from "lucide-react";
import { FixedLayer } from "@/components/motion-primitives";

/** `orders`, `staff` and `settings` exist for Admin only; staff and settings are reached from Lainnya. */
export type OpsTab = "scan" | "queue" | "orders" | "batch" | "more" | "staff" | "settings";

const ITEMS: { id: OpsTab; label: string; icon: typeof Camera }[] = [
  { id: "scan", label: "Scan", icon: Camera },
  { id: "queue", label: "Antrian", icon: ListChecks },
  { id: "orders", label: "Pengiriman", icon: Package },
  { id: "batch", label: "Batch", icon: Truck },
  { id: "more", label: "Lainnya", icon: Menu },
];

/**
 * Bottom bar for the field screen only: the four things staff do, one thumb away. Scan is the home
 * tab; Antrian is the hub's to-do list; Batch is the trip; Lainnya holds location and account.
 */
export function OpsBottomNav({
  tab,
  onTab,
  badges,
  withOrders = false,
}: {
  tab: OpsTab;
  onTab: (tab: OpsTab) => void;
  badges: Partial<Record<OpsTab, number>>;
  /** Admin also gets the list of every shipment as its own tab. */
  withOrders?: boolean;
}) {
  const items = ITEMS.filter((i) => withOrders || i.id !== "orders");
  return (
    <FixedLayer>
      <nav
        aria-label="Menu petugas"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        <div
          role="tablist"
          className={`mx-auto grid max-w-md px-1 pb-1 pt-1.5 ${items.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}
        >
          {items.map(({ id, label, icon: Icon }) => {
            const on = tab === id || (id === "more" && (tab === "staff" || tab === "settings"));
            const count = badges[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={count > 0 ? `${label}, ${count} perlu perhatian` : label}
                onClick={() => onTab(id)}
                className={`tap flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium ${on ? "text-brand-red" : "text-muted-foreground"}`}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} aria-hidden="true" />
                  {count > 0 && (
                    <span className="absolute -right-3 -top-1 flex min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </FixedLayer>
  );
}
