import { OrderLoading } from "@/components/order-loading";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Globe2, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { QuotaRing } from "@/components/esim-quota-ring";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { Page, Wordmark, btnPrimary } from "@/components/shell";
import { destinationArt } from "@/lib/destination-art";
import { useOrders, type Order } from "@/lib/orders";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { effectiveOrderStatus } from "@/lib/esim-status";
import { easeIos, springIos } from "@/lib/motion";
import {
  activationTimeline,
  formatData,
  formatGb,
  formatRemainingPercent,
  reorderIntent,
  usageView,
  type ActivationStageState,
} from "@/lib/travel-journey";

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

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

export function EsimCard({ o, index = 0 }: { o: Order; index?: number }) {
  const reduce = useReducedMotion();
  const lowPercent = useHomeEsimConfig().lowQuotaPercent;
  const [artFailed, setArtFailed] = useState(false);
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const durationDays = o.durationDays ?? 0;
  const status = effectiveOrderStatus(o.status, o.expiresAt);
  const ready = status === "READY" || status === "INSTALLED";
  const history = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(status);
  const quotaLabel =
    o.unlimited === true
      ? "Unlimited"
      : o.volumeBytes != null && o.volumeBytes > 0
        ? formatGb(o.volumeBytes)
        : "Kuota belum tersedia";
  const usage = usageView({
    volumeBytes: o.usageVolumeBytes ?? o.volumeBytes ?? null,
    usedGb: o.usedGb ?? null,
    unlimited: o.unlimited === true,
    active: status === "INSTALLED",
    lowPercent,
  });
  const timeline = activationTimeline(status);
  const doneStages = timeline.stages.filter((stage) => stage.state === "done").length;
  const art = destinationArt(o.locationCodes?.[0]);
  const lowQuota = status === "INSTALLED" && usage.kind === "measured" && usage.low;
  const reorder = reorderIntent({
    packageId: o.packageId,
    status,
    locationCodes: o.locationCodes,
  });
  const showReorder = history || lowQuota;
  const inProgress = !ready && !history;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...springIos, delay: Math.min(index, 6) * 0.05 }}
      className="overflow-hidden rounded-[24px] border border-border/60 bg-surface shadow-[0_12px_28px_-22px_rgba(0,0,0,0.35)]"
    >
      {/* The receipt/reorder links live in the footer, outside this link, so no nested anchors. */}
      <Link
        to={ready ? "/my-esim/$id" : "/order/$id"}
        params={{ id: o.id }}
        className={`tap group block p-4 ${FOCUS} ${history ? "" : art.tint}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`grid size-14 shrink-0 place-items-center rounded-2xl bg-white/70 ${history ? "opacity-60 grayscale" : ""}`}
          >
            {art.src && !artFailed ? (
              <img
                src={art.src}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                onError={() => setArtFailed(true)}
                className="size-12 object-contain"
              />
            ) : (
              <Globe2 className="size-7 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-[16px] font-semibold leading-snug ${history ? "text-foreground/70" : ""}`}
              >
                {packageName}
              </p>
              <ChevronRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {locationLabel} · {quotaLabel} · {durationDays} hari
            </p>
            <div className="mt-2">
              <EsimStatusBadge status={status} low={lowQuota} />
            </div>
          </div>
        </div>

        {inProgress && (
          <div className="mt-4">
            <div className="flex gap-1" aria-hidden="true">
              {timeline.stages.map((stage, i) => (
                <span
                  key={stage.id}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
                >
                  <motion.span
                    className={`block h-full origin-left rounded-full ${STAGE_SEGMENT[stage.state]}`}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: stage.state === "todo" ? 0 : 1 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { duration: 0.5, ease: easeIos, delay: 0.15 + i * 0.08 }
                    }
                  />
                </span>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {timeline.headline} · {doneStages} dari {timeline.stages.length} tahap
            </p>
          </div>
        )}

        {status === "INSTALLED" &&
          usage.kind === "measured" &&
          usage.remainingPercent !== null &&
          usage.remainingBytes !== null && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/70 p-3">
              <QuotaRing
                percent={usage.remainingPercent}
                label={formatRemainingPercent(usage)}
                valueText={`Sisa ${formatData(usage.remainingBytes)} (${formatRemainingPercent(usage)})`}
                low={usage.low}
                size={52}
              />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  <span>{formatData(usage.remainingBytes)} tersisa</span>
                </p>
                {usage.totalBytes !== null && (
                  <p className="text-[12px] text-muted-foreground">
                    dari {formatGb(usage.totalBytes)}
                  </p>
                )}
              </div>
            </div>
          )}
        {status === "INSTALLED" && usage.kind !== "measured" && (
          <p className="mt-4 rounded-2xl bg-white/70 p-3 text-sm text-muted-foreground">
            {usage.kind === "unlimited" ? "Unlimited" : usage.note}
          </p>
        )}
        {status === "READY" && (
          <p className="mt-4 rounded-2xl bg-white/70 p-3 text-[13px] text-muted-foreground">
            eSIM siap. Ketuk untuk memasang dan melihat kode aktivasi.
          </p>
        )}
        {history && <p className="mt-3 text-[12px] text-muted-foreground">{timeline.headline}</p>}
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2">
        <Link
          to="/receipt/$id"
          params={{ id: o.id }}
          className={`tap inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground ${FOCUS}`}
        >
          <ReceiptText className="size-4" aria-hidden="true" />
          Lihat struk
        </Link>
        {showReorder && (
          <Link
            to={reorder.href}
            params={{ id: reorder.packageId }}
            className={`tap inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold text-brand-red ${FOCUS}`}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {reorder.label}
          </Link>
        )}
      </div>
    </motion.article>
  );
}

type Filter = "all" | "active" | "pending" | "history";

const FILTER_LABEL: Record<Filter, string> = {
  all: "Semua",
  active: "Aktif",
  pending: "Menunggu",
  history: "Riwayat",
};

function MyEsim() {
  const orders = useOrders();
  const [filter, setFilter] = useState<Filter>("all");
  const groups = useMemo(() => {
    const list = orders ?? [];
    const by = (pick: (s: ReturnType<typeof effectiveOrderStatus>) => boolean) =>
      list.filter((o) => pick(effectiveOrderStatus(o.status, o.expiresAt)));
    return {
      ready: by((s) => s === "READY" || s === "INSTALLED"),
      pending: by(
        (s) =>
          s !== "READY" &&
          s !== "INSTALLED" &&
          !["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(s),
      ),
      expired: by((s) => s === "EXPIRED"),
      closed: by((s) => s === "REFUNDED" || s === "CANCELLED" || s === "PROVISIONING_FAILED"),
    };
  }, [orders]);
  const { ready, pending, expired, closed } = groups;
  const historyCount = expired.length + closed.length;
  const counts: Record<Filter, number> = {
    all: orders?.length ?? 0,
    active: ready.length,
    pending: pending.length,
    history: historyCount,
  };
  const filters = (Object.keys(FILTER_LABEL) as Filter[]).filter(
    (key) => key === "all" || counts[key] > 0,
  );
  const activeFilter = filters.includes(filter) ? filter : "all";
  const show = (key: Exclude<Filter, "all">) => activeFilter === "all" || activeFilter === key;
  const summary =
    orders && orders.length > 0
      ? [
          ready.length > 0 && `${ready.length} siap dipakai`,
          pending.length > 0 && `${pending.length} menunggu`,
          historyCount > 0 && `${historyCount} riwayat`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <Page>
      <header className="flex items-start justify-between gap-3 pt-4">
        <div>
          <h1 className="large-title">My eSIM</h1>
          {summary && <p className="mt-1 text-[13px] text-muted-foreground">{summary}</p>}
        </div>
        <Link
          to="/esim/finder"
          aria-label="Beli eSIM baru"
          className={`tap grid size-11 shrink-0 place-items-center rounded-full bg-brand-red text-white shadow-[0_8px_18px_-8px_rgba(182,61,75,0.7)] ${FOCUS}`}
        >
          <Plus className="size-5" aria-hidden="true" />
        </Link>
      </header>
      {orders === null ? (
        <OrderLoading list label="Memuat eSIM…" />
      ) : orders.length === 0 ? (
        <div className="mt-20 text-center">
          <img
            src="/assets/esim/esim-pass-global-v1.webp"
            alt=""
            width={128}
            height={128}
            className="mx-auto size-32 object-contain"
          />
          <Wordmark className="mx-auto mt-2 h-12" />
          <p className="mt-2 text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
          <p className="mt-6">Belum ada eSIM. Mau pergi ke mana?</p>
          <Link to="/explore" className={`${btnPrimary} mt-6`}>
            Cari Destinasi
          </Link>
        </div>
      ) : (
        <>
          {filters.length > 2 && (
            <div
              role="group"
              aria-label="Filter eSIM"
              className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4"
            >
              {filters.map((key) => {
                const selected = key === activeFilter;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilter(key)}
                    className={`tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors ${FOCUS} ${selected ? "bg-foreground text-background" : "bg-surface text-muted-foreground shadow-[inset_0_0_0_1px_rgba(60,60,67,0.14)]"}`}
                  >
                    {FILTER_LABEL[key]}
                    <span className={selected ? "opacity-70" : "opacity-60"}>{counts[key]}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div key={activeFilter}>
            {show("active") && ready.length > 0 && <Section title="Siap dipakai" items={ready} />}
            {show("pending") && pending.length > 0 && <Section title="Menunggu" items={pending} />}
            {show("history") && expired.length > 0 && (
              <Section title="Kedaluwarsa" items={expired} />
            )}
            {show("history") && closed.length > 0 && (
              <Section title="Refund, dibatalkan, atau gagal" items={closed} />
            )}
          </div>
        </>
      )}
    </Page>
  );
}

function Section({ title, items }: { title: string; items: Order[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
        {title}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
          {items.length}
        </span>
      </h2>
      <div className="space-y-3">
        {items.map((o, index) => (
          <EsimCard key={o.id} o={o} index={index} />
        ))}
      </div>
    </section>
  );
}
