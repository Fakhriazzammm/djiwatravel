import { createFileRoute, Link } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { Page, Wordmark, btnPrimary } from "@/components/shell";
import { useOrders, type Order } from "@/lib/orders";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import { activationTimeline, type ActivationStageState } from "@/lib/travel-journey";

/**
 * Compact form of the activation timeline. The full card lives on the detail page; here the
 * card only needs to answer "where is my eSIM now" without pushing the list apart.
 * Colour alone never carries the meaning: the headline sentence states it in words too.
 */
const STAGE_SEGMENT: Record<ActivationStageState, string> = {
  done: "bg-success",
  current: "bg-primary",
  todo: "bg-secondary",
  failed: "bg-brand-red",
};

export const Route = createFileRoute("/my-esim/")({
  head: () => ({
    meta: [
      { title: "My eSIM — Djiwa Travel" },
      { name: "description", content: "Semua eSIM perjalananmu di satu tempat." },
      { property: "og:title", content: "My eSIM — Djiwa Travel" },
      { property: "og:description", content: "Semua eSIM perjalananmu di satu tempat." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyEsim,
});

export function EsimCard({ o }: { o: Order }) {
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const durationDays = o.durationDays ?? 0;
  const total = o.volumeBytes == null ? null : o.volumeBytes / 1_000_000_000;
  const left = total === null ? null : Math.max(0, total - (o.usedGb ?? 0));
  const quotaLabel = total === null ? "Unlimited" : `${total.toFixed(1)} GB`;
  const pct = total && left !== null ? Math.round((left / total) * 100) : 100;
  const status = effectiveOrderStatus(o.status, o.expiresAt);
  const ready = status === "READY" || status === "INSTALLED";
  const timeline = activationTimeline(status);
  const doneStages = timeline.stages.filter((stage) => stage.state === "done").length;
  return (
    // The wrapper keeps the receipt link outside the card link, so no nested anchors.
    <div className="rounded-2xl bg-surface p-5">
      <Link
        to={ready ? "/my-esim/$id" : "/order/$id"}
        params={{ id: o.id }}
        className="tap block"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">🌐</span>
          <div className="flex-1">
            <p className="font-semibold">{packageName}</p>
            <p className="text-sm text-muted-foreground">
              {locationLabel} · {quotaLabel} · {durationDays} hari
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-success/15 text-success" : "bg-brand-red-soft text-brand-red"}`}
          >
            {ORDER_STATUS_LABEL[status]}
          </span>
        </div>
        {!ready && (
          <div className="mt-3">
            <div className="flex gap-1" aria-hidden="true">
              {timeline.stages.map((stage) => (
                <span
                  key={stage.id}
                  className={`h-1.5 flex-1 rounded-full ${STAGE_SEGMENT[stage.state]}`}
                />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {timeline.headline} · {doneStages} dari {timeline.stages.length} tahap
            </p>
          </div>
        )}
        {ready && (
          <>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${pct < 20 ? "bg-brand-red" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span>{left !== null ? `${left.toFixed(1)} GB tersisa` : "Unlimited"}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
          </>
        )}
      </Link>
      <Link
        to="/receipt/$id"
        params={{ id: o.id }}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red"
      >
        <ReceiptText className="size-3.5" aria-hidden="true" />
        Lihat struk
      </Link>
    </div>
  );
}

function MyEsim() {
  const orders = useOrders();
  const ready =
    orders?.filter((o) => {
      const status = effectiveOrderStatus(o.status, o.expiresAt);
      return status === "READY" || status === "INSTALLED";
    }) ?? [];
  const pending =
    orders?.filter((o) => {
      const status = effectiveOrderStatus(o.status, o.expiresAt);
      return status !== "READY" && status !== "INSTALLED" && status !== "REFUNDED";
    }) ?? [];
  return (
    <Page>
      <h1 className="large-title pt-4">My eSIM</h1>
      {orders === null ? (
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-secondary" />
      ) : orders.length === 0 ? (
        <div className="mt-24 text-center">
          <Wordmark className="mx-auto h-20" />
          <p className="mt-2 text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
          <p className="mt-6">Belum ada eSIM. Mau pergi ke mana?</p>
          <Link to="/explore" className={`${btnPrimary} mt-6`}>
            Cari Destinasi
          </Link>
        </div>
      ) : (
        <>
          {ready.length > 0 && <Section title="Siap dipakai" items={ready} />}
          {pending.length > 0 && <Section title="Menunggu" items={pending} />}
        </>
      )}
    </Page>
  );
}

function Section({ title, items }: { title: string; items: Order[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {items.map((o) => (
          <EsimCard key={o.id} o={o} />
        ))}
      </div>
    </section>
  );
}
