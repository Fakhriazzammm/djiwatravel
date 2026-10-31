import { Check } from "lucide-react";
import { activationTimeline } from "@/lib/travel-journey";
import type { OrderStatus } from "@/lib/orders";

/** Compact stage row drawn from the same `activationTimeline` the eSIM detail page uses. */
export function EsimActivationStepper({ status }: { status: OrderStatus }) {
  const timeline = activationTimeline(status);
  return (
    <ol className="flex items-start" aria-label="Tahap pesanan eSIM">
      {timeline.stages.map((stage, index) => {
        const done = stage.state === "done";
        const current = stage.state === "current";
        const failed = stage.state === "failed";
        return (
          <li
            key={stage.id}
            aria-current={current ? "step" : undefined}
            className="relative flex-1 text-center text-[10.5px] text-muted-foreground"
          >
            {index < timeline.stages.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-1/2 top-[11px] h-0.5 w-full ${done ? "bg-[#34C759]" : "bg-border"}`}
              />
            )}
            <span
              className={`relative z-10 mx-auto mb-1 grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                done
                  ? "bg-[#34C759] text-white"
                  : current
                    ? "scale-110 bg-brand-red text-white"
                    : failed
                      ? "bg-destructive text-white"
                      : "bg-secondary"
              } transition-transform`}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className={current || failed ? "font-semibold text-foreground" : ""}>
              {stage.label}
            </span>
            <span className="sr-only">
              {done ? " selesai" : current ? " sedang berjalan" : failed ? " gagal" : " menunggu"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
