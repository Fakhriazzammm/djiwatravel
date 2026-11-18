import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { markShippingProblem } from "@/lib/shipping-ops.fn";
import { HUB_LABEL, type Hub } from "@/lib/shipping";
import { OpsBatches } from "./ops-batches";
import { OpsScan } from "./ops-scan";
import { OpsWeigh } from "./ops-weigh";
import { bigBtn, field, type OpsMe } from "./ops-types";

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
 * The field app for hub staff and Admin: pick where you are once, then Scan and Batch. Used by the
 * mobile page /petugas and by the Scan tab in Admin, so both behave the same.
 */
export function ShippingOpsApp({
  me,
  initialCode,
  onChanged,
}: {
  me: OpsMe;
  initialCode: string | null;
  onChanged?: () => void;
}) {
  const [hub, setHub] = useState<Hub>(() =>
    typeof window === "undefined" ? (me.hubs[0] ?? "TASIK") : savedHub(me.hubs),
  );
  const [tab, setTab] = useState<"scan" | "batch">("scan");
  const [active, setActive] = useState<{ id: string; code: string } | null>(null);
  const [weighId, setWeighId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ orderId: string; code: string } | null>(null);
  const [problemNote, setProblemNote] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadSignal, setLoadSignal] = useState(0);

  // The open batch belongs to one hub; moving to another hub starts clean.
  useEffect(() => setActive(null), [hub]);

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

  if (weighId)
    return (
      <OpsWeigh
        orderId={weighId}
        onClose={() => setWeighId(null)}
        onDone={() => {
          setWeighId(null);
          changed();
        }}
      />
    );

  return (
    <div className="space-y-2.5">
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
      <div
        className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1"
        role="tablist"
        aria-label="Menu"
      >
        {(
          [
            ["scan", "Scan"],
            ["batch", "Batch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 rounded-xl text-[13px] font-semibold ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

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

      <div hidden={tab !== "scan"}>
        <OpsScan
          hub={hub}
          batchId={active?.id ?? null}
          batchLabel={active?.code ?? null}
          initialCode={initialCode}
          loadSignal={loadSignal}
          onWeigh={setWeighId}
          onChanged={changed}
          onOpenBatch={() => setTab("batch")}
          onProblem={(orderId, code) => setProblem({ orderId, code })}
        />
      </div>
      {tab === "batch" && (
        <OpsBatches
          me={me}
          hub={hub}
          activeBatchId={active?.id ?? null}
          setActiveBatch={setActive}
          refreshKey={refreshKey}
          onChanged={changed}
          onLoadMode={() => {
            setTab("scan");
            setLoadSignal((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
