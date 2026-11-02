import { InstallAppCard } from "@/components/install-app-card";
import { OrderLoading } from "@/components/order-loading";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Globe2, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { QuotaRing } from "@/components/esim-quota-ring";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { Page, Wordmark, btnPrimary } from "@/components/shell";
import { destinationArt } from "@/lib/destination-art";
import { useOrders, type Order } from "@/lib/orders";
import { useHomeEsimConfig } from "@/hooks/use-home-esim-config";
import { effectiveOrderStatus } from "@/lib/esim-status";
import { locationCodesLabel } from "@/lib/package-copy";
import { easeIos, springIos, springSnappy } from "@/lib/motion";
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
  const locationLabel = locationCodesLabel(o.locationCodes);
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

type Tab = "active" | "pending" | "history";

const TAB_LABEL: Record<Tab, string> = {
  active: "Aktif",
  pending: "Menunggu",
  history: "Riwayat",
};
const TABS = Object.keys(TAB_LABEL) as Tab[];
const HISTORY_PAGE = 5;

function MyEsim() {
  const orders = useOrders();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<Tab | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const groups = useMemo(() => {
    const list = orders ?? [];
    const by = (pick: (s: ReturnType<typeof effectiveOrderStatus>) => boolean) =>
      list.filter((o) => pick(effectiveOrderStatus(o.status, o.expiresAt)));
    return {
      active: by((s) => s === "READY" || s === "INSTALLED"),
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
  const { active, pending, expired, closed } = groups;
  const history = [...expired, ...closed];
  const counts: Record<Tab, number> = {
    active: active.length,
    pending: pending.length,
    history: history.length,
  };
  // Finished eSIMs are archived into Riwayat automatically; open on the first tab with content.
  const fallback: Tab = active.length > 0 ? "active" : pending.length > 0 ? "pending" : "history";
  const tab = picked ?? fallback;
  const summary =
    orders && orders.length > 0
      ? [
          active.length > 0 && `${active.length} siap dipakai`,
          pending.length > 0 && `${pending.length} menunggu`,
          history.length > 0 && `${history.length} riwayat`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: Tab) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(current) + step + TABS.length) % TABS.length]!;
    setPicked(next);
    document.getElementById(`esim-tab-${next}`)?.focus();
  };

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
      <InstallAppCard className="mt-4" />
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
          <div
            role="tablist"
            aria-label="Status eSIM"
            className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1"
          >
            {TABS.map((key) => {
              const selected = key === tab;
              return (
                <button
                  key={key}
                  id={`esim-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="esim-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setPicked(key)}
                  onKeyDown={(event) => onTabKey(event, key)}
                  className={`relative min-h-11 rounded-xl text-[13px] font-semibold transition-colors ${FOCUS} ${selected ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {selected && (
                    <motion.span
                      layoutId="esim-tab-indicator"
                      className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
                      transition={reduce ? { duration: 0 } : springSnappy}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-1.5">
                    {TAB_LABEL[key]}
                    <span className="opacity-60">{counts[key]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div key={tab} id="esim-tabpanel" role="tabpanel" aria-labelledby={`esim-tab-${tab}`}>
            {tab === "active" &&
              (active.length > 0 ? (
                <Section title="Siap dipakai" items={active} />
              ) : (
                <EmptyTab
                  title="Belum ada eSIM aktif"
                  hint={
                    history.length > 0
                      ? "eSIM yang sudah selesai tersimpan di Riwayat."
                      : "Pilih paket untuk perjalananmu berikutnya."
                  }
                  onHistory={history.length > 0 ? () => setPicked("history") : undefined}
                />
              ))}
            {tab === "pending" &&
              (pending.length > 0 ? (
                <Section title="Menunggu" items={pending} />
              ) : (
                <EmptyTab
                  title="Tidak ada pesanan yang menunggu"
                  hint="Semua pesananmu sudah selesai diproses."
                />
              ))}
            {tab === "history" &&
              (history.length > 0 ? (
                <>
                  <Section
                    title="Kedaluwarsa"
                    items={expired.slice(0, historyLimit)}
                    total={expired.length}
                  />
                  {historyLimit > expired.length && closed.length > 0 && (
                    <Section
                      title="Refund, dibatalkan, atau gagal"
                      items={closed.slice(0, historyLimit - expired.length)}
                      total={closed.length}
                    />
                  )}
                  {history.length > historyLimit && (
                    <button
                      type="button"
                      onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                      className={`tap mt-4 min-h-11 w-full rounded-2xl bg-surface text-[14px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_rgba(60,60,67,0.14)] ${FOCUS}`}
                    >
                      Lihat lebih banyak ({history.length - historyLimit})
                    </button>
                  )}
                </>
              ) : (
                <EmptyTab
                  title="Riwayat masih kosong"
                  hint="eSIM yang kedaluwarsa atau dibatalkan akan muncul di sini."
                />
              ))}
          </div>
        </>
      )}
    </Page>
  );
}

function EmptyTab({
  title,
  hint,
  onHistory,
}: {
  title: string;
  hint: string;
  onHistory?: (() => void) | undefined;
}) {
  return (
    <div className="mt-12 text-center">
      <img
        src="/assets/esim/esim-pass-global-v1.webp"
        alt=""
        width={96}
        height={96}
        className="mx-auto size-24 object-contain opacity-90"
      />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>
      <div className="mt-5 flex flex-col items-center gap-2">
        <Link to="/esim/finder" className={btnPrimary}>
          Beli eSIM
        </Link>
        {onHistory && (
          <button
            type="button"
            onClick={onHistory}
            className={`tap min-h-11 rounded-xl px-4 text-[14px] font-semibold text-brand-red ${FOCUS}`}
          >
            Lihat Riwayat
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, items, total }: { title: string; items: Order[]; total?: number }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
        {title}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold">
          {total ?? items.length}
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
