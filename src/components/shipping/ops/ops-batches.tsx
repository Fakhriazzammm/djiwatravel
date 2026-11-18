import { useCallback, useEffect, useState } from "react";
import { Printer, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  arriveBatch,
  createBatch,
  departBatch,
  getBatch,
  listBatches,
  unloadFromBatch,
} from "@/lib/shipping-ops.fn";
import {
  BATCH_DESTINATION,
  DESTINATION_LABEL,
  HUB_LABEL,
  formatKg,
  type Hub,
} from "@/lib/shipping";
import { formatAdminDateTime } from "@/lib/admin-display";
import { bigBtn, field, type BatchList, type BatchSlim, type OpsMe } from "./ops-types";

type BatchFull = Awaited<ReturnType<typeof getBatch>>;

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * The Batch tab: open a trip, see what is loaded, send it off with one tap, and close the receiving
 * end (scan the rest, or flag what is missing). Each batch is one leg between two points.
 */
export function OpsBatches({
  me,
  hub,
  activeBatchId,
  setActiveBatch,
  refreshKey,
  onChanged,
  onLoadMode,
}: {
  me: OpsMe;
  hub: Hub;
  activeBatchId: string | null;
  setActiveBatch: (batch: { id: string; code: string } | null) => void;
  refreshKey: number;
  onChanged: () => void;
  onLoadMode: () => void;
}) {
  const [list, setList] = useState<BatchList | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await listBatches({ data: { hub } }));
      setLoadError("");
    } catch (error) {
      setLoadError(message(error, "Daftar batch belum bisa dimuat."));
    }
  }, [hub]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (openId)
    return (
      <BatchDetail
        me={me}
        hub={hub}
        batchId={openId}
        activeBatchId={activeBatchId}
        onClose={() => {
          setOpenId(null);
          void load();
        }}
        onUse={(batch) => {
          setActiveBatch(batch);
          onLoadMode();
        }}
        onChanged={() => {
          onChanged();
          void load();
        }}
      />
    );

  const toLabel = DESTINATION_LABEL[BATCH_DESTINATION[hub]];
  return (
    <div className="space-y-3">
      <CreateBatch
        me={me}
        hub={hub}
        onCreated={(batch) => {
          setActiveBatch(batch);
          setOpenId(batch.id);
          void load();
        }}
      />
      {loadError && (
        <p role="alert" className="text-[12px] text-destructive">
          {loadError}
        </p>
      )}
      <Section
        title={`Terbuka di ${HUB_LABEL[hub]} (menuju ${toLabel})`}
        empty="Belum ada batch terbuka."
      >
        {list?.open.map((b) => (
          <BatchRowCard
            key={b.id}
            b={b}
            active={b.id === activeBatchId}
            onOpen={() => setOpenId(b.id)}
          />
        ))}
      </Section>
      {hub !== "TASIK" && (
        <Section title="Datang ke sini" empty="Tidak ada batch di perjalanan ke lokasi ini.">
          {list?.incoming.map((b) => (
            <BatchRowCard key={b.id} b={b} showProgress onOpen={() => setOpenId(b.id)} />
          ))}
        </Section>
      )}
      <Section title="Sudah berangkat dari sini" empty="Belum ada.">
        {list?.outgoing.map((b) => (
          <BatchRowCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />
        ))}
      </Section>
      <Section title="Selesai (3 hari terakhir)" empty="Belum ada.">
        {list?.recent.map((b) => (
          <BatchRowCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

function BatchRowCard({
  b,
  active = false,
  showProgress = false,
  onOpen,
}: {
  b: BatchSlim;
  active?: boolean;
  showProgress?: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`tap flex w-full items-center justify-between gap-2 rounded-2xl border p-3 text-left ${active ? "border-[#b8e6c6] bg-[#e8f8ed]" : "border-border bg-surface"}`}
      >
        <span className="min-w-0">
          <span className="block font-mono text-[14px] font-bold">{b.code}</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {HUB_LABEL[b.fromHub]} → {DESTINATION_LABEL[b.toHub]} · {b.carrier}
          </span>
        </span>
        <span className="shrink-0 text-right text-[12px]">
          <span className="block font-semibold">
            {showProgress ? `${b.checked}/${b.total}` : `${b.total} paket`}
          </span>
          <span className="block text-muted-foreground">{formatKg(b.kg)}</span>
        </span>
      </button>
    </li>
  );
}

function CreateBatch({
  me,
  hub,
  onCreated,
}: {
  me: OpsMe;
  hub: Hub;
  onCreated: (batch: { id: string; code: string }) => void;
}) {
  const export_ = BATCH_DESTINATION[hub] === "JAPAN";
  const options = export_ ? me.config.couriers : me.config.transport;
  const [carrier, setCarrier] = useState(options[0] ?? "");
  const [custom, setCustom] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCarrier(options[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);
  const chosen = carrier === "__custom" ? custom.trim() : carrier;
  return (
    <form
      className="rounded-2xl border border-border bg-surface p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const created = await createBatch({
            data: {
              fromHub: hub,
              carrier: chosen,
              ...(tracking.trim() ? { tracking: tracking.trim() } : {}),
            },
          });
          setTracking("");
          toast.success(`Batch ${created.code} dibuka`);
          onCreated(created);
        } catch (error) {
          toast.error(message(error, "Batch belum bisa dibuat."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <Truck className="size-4" aria-hidden="true" />
        Batch baru ke {DESTINATION_LABEL[BATCH_DESTINATION[hub]]}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">
            {export_ ? "Partner" : "Pembawa"}
          </span>
          <select className={field} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {!export_ && <option value="__custom">Lainnya…</option>}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">
            {export_ ? "Resi master" : "Resi ekspedisi (opsional)"}
          </span>
          <input className={field} value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </label>
      </div>
      {carrier === "__custom" && (
        <input
          className={`${field} mt-2`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Nama pembawa atau ekspedisi"
          aria-label="Nama pembawa"
        />
      )}
      <button
        type="submit"
        disabled={busy || chosen.length < 2}
        className={`${bigBtn} mt-3 bg-brand-red text-white`}
      >
        Buka batch
      </button>
    </form>
  );
}

function BatchDetail({
  me,
  hub,
  batchId,
  activeBatchId,
  onClose,
  onUse,
  onChanged,
}: {
  me: OpsMe;
  hub: Hub;
  batchId: string;
  activeBatchId: string | null;
  onClose: () => void;
  onUse: (batch: { id: string; code: string }) => void;
  onChanged: () => void;
}) {
  const [batch, setBatch] = useState<BatchFull | null>(null);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState("");
  const [partnerKg, setPartnerKg] = useState("");
  const [missingNote, setMissingNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      const b = await getBatch({ data: { batchId } });
      setBatch(b);
      setTracking((t) => t || b.tracking || "");
    } catch (error) {
      toast.error(message(error, "Batch belum bisa dimuat."));
    }
  }, [batchId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await task();
      toast.success(done);
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(message(error, "Tindakan gagal."));
    } finally {
      setBusy(false);
    }
  }

  if (!batch) return <p className="text-[12px] text-muted-foreground">Memuat batch…</p>;
  const export_ = batch.toHub === "JAPAN";
  const leaving = batch.fromHub === hub;
  const arriving = !export_ && batch.toHub === hub;
  const missing = batch.items.filter((i) => !i.checked);
  const canJapan = export_ && batch.status === "DEPARTED" && me.isAdmin;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onClose}
        className="tap min-h-10 text-[13px] font-semibold text-brand-red"
      >
        ‹ Semua batch
      </button>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="font-mono text-[20px] font-bold">{batch.code}</p>
        <p className="text-[13px] font-medium">
          {HUB_LABEL[batch.fromHub]} → {DESTINATION_LABEL[batch.toHub]} · {batch.carrier}
          {batch.tracking ? ` · resi ${batch.tracking}` : ""}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {batch.status === "OPEN"
            ? "Terbuka"
            : batch.status === "DEPARTED"
              ? `Berangkat ${batch.departedAt ? formatAdminDateTime(batch.departedAt) : ""}`
              : `Tiba ${batch.arrivedAt ? formatAdminDateTime(batch.arrivedAt) : ""}`}
          {" · "}
          {batch.total} paket · {formatKg(batch.kg)}
          {batch.status === "DEPARTED" && !export_ ? ` · ${batch.checked} ter-scan` : ""}
        </p>
      </div>

      <ul className="space-y-1.5">
        {batch.items.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
            Belum ada paket. Buka mode Muat di tab Scan, lalu scan paketnya.
          </li>
        )}
        {batch.items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-2 rounded-xl bg-secondary p-2.5 text-[12px]"
          >
            <span className="min-w-0">
              <span className="block font-mono font-semibold">{i.code}</span>
              <span className="block truncate text-muted-foreground">
                {i.recipientName}, {i.city} · {formatKg(i.kg)}
              </span>
            </span>
            {batch.status === "OPEN" && leaving ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(
                    () => unloadFromBatch({ data: { batchId: batch.id, orderId: i.id } }),
                    `${i.code} dikeluarkan`,
                  )
                }
                className="tap min-h-9 rounded-lg border border-border bg-background px-2.5 font-semibold"
              >
                Keluarkan
              </button>
            ) : batch.status === "DEPARTED" && !export_ ? (
              <span
                className={
                  i.checked ? "font-semibold text-[#15803D]" : "font-semibold text-[#9a6100]"
                }
              >
                {i.checked ? "Ter-scan" : "Belum"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        {batch.status === "OPEN" && leaving && (
          <>
            {activeBatchId !== batch.id && (
              <button
                type="button"
                onClick={() => onUse({ id: batch.id, code: batch.code })}
                className={`${bigBtn} border border-border bg-background`}
              >
                Muat paket ke batch ini
              </button>
            )}
            {activeBatchId === batch.id && (
              <button
                type="button"
                onClick={() => onUse({ id: batch.id, code: batch.code })}
                className={`${bigBtn} border border-border bg-background`}
              >
                Lanjut scan muat
              </button>
            )}
            {export_ && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">
                    Resi master
                  </span>
                  <input
                    className={field}
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted-foreground">
                    Berat partner (kg, opsional)
                  </span>
                  <input
                    className={field}
                    inputMode="decimal"
                    value={partnerKg}
                    onChange={(e) => setPartnerKg(e.target.value)}
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              disabled={busy || batch.total === 0}
              onClick={() =>
                run(
                  () =>
                    departBatch({
                      data: {
                        batchId: batch.id,
                        ...(tracking.trim() ? { tracking: tracking.trim() } : {}),
                        ...(Number(partnerKg.replace(",", ".")) > 0
                          ? { partnerKg: Number(partnerKg.replace(",", ".")) }
                          : {}),
                      },
                    }),
                  `${batch.total} paket berangkat`,
                )
              }
              className={`${bigBtn} bg-brand-red text-white`}
            >
              Berangkat ({batch.total} paket)
            </button>
          </>
        )}

        {batch.status === "DEPARTED" && arriving && (
          <>
            <button
              type="button"
              disabled={busy || missing.length === 0}
              onClick={() =>
                run(
                  () => arriveBatch({ data: { batchId: batch.id, mode: "all_ok" } }),
                  "Semua paket check-in",
                )
              }
              className={`${bigBtn} bg-brand-red text-white`}
            >
              Semua sesuai ({missing.length} belum ter-scan)
            </button>
            {missing.length > 0 && (
              <div className="rounded-2xl border border-[#f1d9a8] bg-[#fffaf0] p-3">
                <p className="text-[12px] font-semibold text-[#9a6100]">
                  {missing.length} paket belum ter-scan: {missing.map((m) => m.code).join(", ")}
                </p>
                <input
                  className={`${field} mt-2`}
                  value={missingNote}
                  onChange={(e) => setMissingNote(e.target.value)}
                  placeholder="Catatan: paket tidak ada"
                  aria-label="Catatan paket tidak ada"
                />
                <button
                  type="button"
                  disabled={busy || missingNote.trim().length < 3}
                  onClick={() =>
                    run(
                      () =>
                        arriveBatch({
                          data: { batchId: batch.id, mode: "finish", note: missingNote.trim() },
                        }),
                      "Batch ditutup, selisih ditandai",
                    )
                  }
                  className={`${bigBtn} mt-2 border border-border bg-background`}
                >
                  Selesai bongkar, tandai yang hilang
                </button>
              </div>
            )}
          </>
        )}
        {canJapan && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => arriveBatch({ data: { batchId: batch.id, mode: "all_ok" } }),
                "Semua paket ditandai tiba di Jepang",
              )
            }
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Tiba di Jepang (semua paket)
          </button>
        )}
        {export_ && batch.status === "DEPARTED" && !me.isAdmin && (
          <p className="text-[12px] text-muted-foreground">Tiba di Jepang dicatat oleh Admin.</p>
        )}
        {batch.total > 0 && (
          <button
            type="button"
            onClick={async () => {
              try {
                const print = await import("@/lib/shipping-print");
                await print.downloadBatchManifestPdf({
                  code: batch.code,
                  from: HUB_LABEL[batch.fromHub],
                  to: DESTINATION_LABEL[batch.toHub],
                  carrier: batch.carrier,
                  tracking: batch.tracking,
                  items: batch.items,
                });
              } catch {
                toast.error("Manifest belum bisa dibuat di perangkat ini.");
              }
            }}
            className={`${bigBtn} border border-border bg-background`}
          >
            <Printer className="size-4" aria-hidden="true" />
            Cetak manifest (PDF)
          </button>
        )}
      </div>
    </div>
  );
}
