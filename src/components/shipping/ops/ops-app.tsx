import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { listBatches, listHubQueue, markShippingProblem } from "@/lib/shipping-ops.fn";
import { HUB_LABEL, type Hub } from "@/lib/shipping";
import { OpsBatches } from "./ops-batches";
import { OpsBottomNav, type OpsTab } from "./ops-nav";
import { OpsMore } from "./ops-more";
import { OpsQueue } from "./ops-queue";
import { OpsScan } from "./ops-scan";
import { OpsWeigh } from "./ops-weigh";
import { bigBtn, field, type OpsMe, type QueueItem } from "./ops-types";

const HUB_KEY = "djiwa-ship-hub";

function savedHub(allowed: readonly Hub[]): Hub {
  try {
    const stored = window.localStorage.getItem(HUB_KEY);
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as Hub;
  } catch {
    /* storage can be blocked; the first hub is a fine start */
  }
  return allowed[0] ?? "TASIK";
}

/**
 * The field app for hub staff and Admin, with its own bottom bar: Scan, Antrian (the hub's to-do
 * list), Batch (the trip) and Lainnya (account, and the way back to Admin). Used by the mobile page
 * /petugas and by the Scan tab in Admin, so both behave the same.
 */
export type AdminSlots = {
  /** Every shipment, with filters and the detail screen. */
  orders: ReactNode;
  staff: ReactNode;
  settings: ReactNode;
  /** Shipments that need the team's next move, shown on the Pengiriman tab. */
  todo: number;
  /** The tab the page was opened on (from the link or hash). */
  requestedTab: OpsTab;
};

export function ShippingOpsApp({
  me,
  initialCode,
  onChanged,
  admin,
}: {
  me: OpsMe;
  initialCode: string | null;
  onChanged?: () => void;
  /** Admin only: the rest of Kirim Barang lives in this same app, so there is one navigation. */
  admin?: AdminSlots;
}) {
  const [hub, setHub] = useState<Hub>(() =>
    typeof window === "undefined" ? (me.hubs[0] ?? "TASIK") : savedHub(me.hubs),
  );
  const [tab, setTab] = useState<OpsTab>(admin?.requestedTab ?? "scan");
  const [startLoad, setStartLoad] = useState(false);
  const [active, setActive] = useState<{ id: string; code: string } | null>(null);
  const [weighId, setWeighId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ orderId: string; code: string } | null>(null);
  const [problemNote, setProblemNote] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueError, setQueueError] = useState("");
  const [incoming, setIncoming] = useState(0);

  // A link such as /admin/shipping#settings opens that tab.
  useEffect(() => {
    if (admin) setTab(admin.requestedTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.requestedTab]);

  // The open batch belongs to one hub; moving to another hub starts clean.
  useEffect(() => setActive(null), [hub]);

  // The to-do list and the batches on their way here feed the badges on the bottom bar.
  useEffect(() => {
    let live = true;
    setQueue(null);
    listHubQueue({ data: { hub } })
      .then((rows) => {
        if (live) {
          setQueue(rows);
          setQueueError("");
        }
      })
      .catch((error: unknown) => {
        if (live)
          setQueueError(error instanceof Error ? error.message : "Antrian belum bisa dimuat.");
      });
    listBatches({ data: { hub } })
      .then((list) => live && setIncoming(list.incoming.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hub, refreshKey]);

  const changed = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onChanged?.();
  }, [onChanged]);

  function pickHub(next: Hub) {
    setHub(next);
    try {
      window.localStorage.setItem(HUB_KEY, next);
    } catch {
      /* optional convenience */
    }
  }

  const goTab = (next: OpsTab) => {
    setStartLoad(false);
    setTab(next);
  };

  const todo = (queue ?? []).filter((i) => i.status !== "PAYMENT_PENDING").length;
  const nav = (
    <OpsBottomNav
      tab={tab}
      onTab={goTab}
      badges={{ queue: todo, batch: incoming, ...(admin ? { orders: admin.todo } : {}) }}
      withOrders={Boolean(admin)}
    />
  );

  if (weighId)
    return (
      <div className="pb-24">
        <OpsWeigh
          orderId={weighId}
          onClose={() => setWeighId(null)}
          onDone={() => {
            setWeighId(null);
            changed();
          }}
        />
        {nav}
      </div>
    );

  const wide = tab === "orders" || tab === "staff" || tab === "settings";
  const hubTab = tab === "scan" || tab === "queue" || tab === "batch";
  return (
    <div className={`mx-auto w-full space-y-2.5 pb-24 ${wide ? "" : "max-w-md"}`}>
      {me.hubs.length > 1 && hubTab ? (
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Lokasi">
          {me.hubs.map((h) => (
            <button
              key={h}
              type="button"
              role="tab"
              aria-selected={hub === h}
              onClick={() => pickHub(h)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold ${hub === h ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              {HUB_LABEL[h]}
            </button>
          ))}
        </div>
      ) : hubTab ? (
        <p className="text-[12px] font-semibold text-muted-foreground">Lokasi: {HUB_LABEL[hub]}</p>
      ) : null}

      {problem && (
        <div className="rounded-2xl border border-[#ffc9c5] bg-[#fff0ef] p-3">
          <p className="text-[13px] font-bold text-destructive">Tandai {problem.code} bermasalah</p>
          <input
            className={`${field} mt-2`}
            value={problemNote}
            onChange={(e) => setProblemNote(e.target.value)}
            placeholder="Apa yang terjadi? (rusak, hilang, basah…)"
            aria-label="Catatan masalah"
            autoFocus
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setProblem(null)}
              className={`${bigBtn} border border-border bg-background`}
            >
              Batal
            </button>
            <button
              type="button"
              disabled={problemNote.trim().length < 3}
              onClick={async () => {
                try {
                  await markShippingProblem({
                    data: { orderId: problem.orderId, note: problemNote.trim(), hub },
                  });
                  toast.success("Ditandai bermasalah, pelanggan dikabari");
                  setProblem(null);
                  setProblemNote("");
                  changed();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Belum bisa ditandai.");
                }
              }}
              className={`${bigBtn} bg-destructive text-white`}
            >
              Tandai
            </button>
          </div>
        </div>
      )}

      {tab === "scan" && (
        <OpsScan
          hub={hub}
          batchId={active?.id ?? null}
          batchLabel={active?.code ?? null}
          initialCode={initialCode}
          startMode={startLoad ? "load" : undefined}
          onWeigh={setWeighId}
          onChanged={changed}
          onOpenBatch={() => goTab("batch")}
          onProblem={(orderId, code) => setProblem({ orderId, code })}
        />
      )}
      {tab === "queue" && (
        <OpsQueue
          hub={hub}
          items={queue}
          error={queueError}
          activeBatchId={active?.id ?? null}
          onWeigh={setWeighId}
          onProblem={(orderId, code) => setProblem({ orderId, code })}
          onChanged={changed}
        />
      )}
      {tab === "batch" && (
        <OpsBatches
          me={me}
          hub={hub}
          activeBatchId={active?.id ?? null}
          setActiveBatch={setActive}
          refreshKey={refreshKey}
          onChanged={changed}
          onLoadMode={() => {
            setStartLoad(true);
            setTab("scan");
          }}
        />
      )}
      {tab === "more" && (
        <OpsMore me={me} hub={hub} onAdminTab={admin ? (t) => goTab(t) : undefined} />
      )}
      {admin && tab === "orders" && admin.orders}
      {admin && (tab === "staff" || tab === "settings") && (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => goTab("more")}
            className="tap min-h-10 text-[13px] font-semibold text-brand-red"
          >
            ‹ Lainnya
          </button>
          {tab === "staff" ? admin.staff : admin.settings}
        </div>
      )}
      {nav}
    </div>
  );
}
