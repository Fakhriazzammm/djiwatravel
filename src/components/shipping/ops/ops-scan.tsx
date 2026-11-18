import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { scanOps } from "@/lib/shipping-ops.fn";
import {
  HUB_MODES,
  HUB_LABEL,
  SHIPPING_STATUS_LABEL,
  formatKg,
  parseAnyCode,
  type Hub,
  type HubMode,
  type ShippingStatus,
} from "@/lib/shipping";
import { formatAdminDateTime } from "@/lib/admin-display";
import { bigBtn, field, type ScanResult } from "./ops-types";

type Entry = { id: number; at: number; code: string; result: ScanResult };
type Flash = "ok" | "warn" | "bad" | null;
let entryId = 0;

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;
const cameraSupported = () =>
  typeof window !== "undefined" &&
  "BarcodeDetector" in window &&
  Boolean(navigator.mediaDevices?.getUserMedia);
const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration is a nicety, never required */
  }
};

/**
 * One scan screen for every hub. The hub the person works at decides what a scan does: Tasikmalaya
 * receives at the door, Bandung and Jakarta check parcels in, and "Muat" fills the open batch. The
 * newest result is a big colour-coded card with the next move under the thumb; older scans fold away.
 */
export function OpsScan({
  hub,
  batchId,
  batchLabel,
  initialCode,
  loadSignal,
  onWeigh,
  onChanged,
  onOpenBatch,
  onProblem,
}: {
  hub: Hub;
  /** The open batch parcels are loaded into (load mode). */
  batchId: string | null;
  batchLabel: string | null;
  initialCode: string | null;
  /** Bumped when the team picks a batch to load: jump to the load mode. */
  loadSignal: number;
  onWeigh: (orderId: string) => void;
  onChanged: () => void;
  onOpenBatch: (batchId: string) => void;
  onProblem: (orderId: string, code: string) => void;
}) {
  const modes = HUB_MODES[hub];
  const [mode, setMode] = useState<HubMode>(modes[0]!.id);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const supported = cameraSupported();

  // Changing hub changes what a scan means: start from that hub's first mode.
  useEffect(() => setMode(HUB_MODES[hub][0]!.id), [hub]);
  useEffect(() => {
    if (loadSignal > 0) setMode("load");
  }, [loadSignal]);

  const signal = useCallback((kind: Exclude<Flash, null>) => {
    setFlash(kind);
    buzz(kind === "ok" ? 60 : kind === "warn" ? [40, 60, 40] : [120, 60, 120]);
    window.setTimeout(() => setFlash(null), 900);
  }, []);

  const handle = useCallback(
    async (raw: string, forceLookup = false) => {
      const parsed = parseAnyCode(raw);
      const push = (result: ScanResult, code: string) =>
        setHistory((h) => [{ id: ++entryId, at: Date.now(), code, result }, ...h].slice(0, 30));
      if (!parsed) {
        push({ found: false, reason: "invalid" }, raw.slice(0, 40));
        signal("bad");
        return;
      }
      const now = Date.now();
      if (lastCode.current.code === parsed.code && now - lastCode.current.at < 4000) return;
      lastCode.current = { code: parsed.code, at: now };
      setBusy(true);
      try {
        const result = await scanOps({
          data: {
            code: parsed.code,
            hub,
            mode: forceLookup ? "lookup" : mode,
            ...(mode === "load" && batchId ? { batchId } : {}),
          },
        });
        push(result, parsed.code);
        if (!result.found) signal("bad");
        else if (result.kind === "batch") signal("ok");
        else if (["received", "checked_in", "loaded"].includes(result.outcome)) {
          signal("ok");
          onChanged();
        } else if (result.outcome === "found") signal("ok");
        else if (result.outcome === "already") signal("warn");
        else signal("bad");
      } catch {
        push({ found: false, reason: "invalid" }, parsed.code);
        signal("bad");
      } finally {
        setBusy(false);
      }
    },
    [batchId, hub, mode, onChanged, signal],
  );

  useEffect(() => {
    if (initialCode) void handle(initialCode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  useEffect(() => {
    if (supported) setCameraOn(true);
  }, [supported]);

  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!cameraOn) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
          .BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !video.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) await handle(found[0].rawValue);
          } catch {
            /* a frame that cannot be read is skipped */
          }
          timer = window.setTimeout(tick, 300);
        };
        void tick();
      } catch {
        setCameraError("Kamera tidak bisa dibuka. Izinkan akses kamera di browser.");
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn, handle]);

  const latest = history[0] ?? null;
  const ring =
    flash === "ok"
      ? "ring-4 ring-[#34C759]"
      : flash === "warn"
        ? "ring-4 ring-[#FF9F0A]"
        : flash === "bad"
          ? "ring-4 ring-[#FF3B30]"
          : "ring-0";
  const needsBatch = mode === "load" && !batchId;

  return (
    <div className="space-y-2.5">
      <div
        className="grid gap-1 rounded-2xl bg-secondary p-1"
        style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="Mode scan"
      >
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-11 rounded-xl px-1 text-[13px] font-semibold ${mode === m.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "load" && (
        <div
          className={`rounded-xl px-3 py-2 text-[12px] ${batchId ? "bg-[#e8f8ed] text-[#15803D]" : "bg-[#fffaf0] text-[#9a6100]"}`}
        >
          {batchId
            ? `Memuat ke ${batchLabel ?? "batch"}. Scan paket satu per satu.`
            : "Belum ada batch terbuka. Buka tab Batch dan buat batch dulu."}
        </div>
      )}

      <div
        className={`relative aspect-[4/3] max-h-[40dvh] w-full overflow-hidden rounded-2xl bg-black transition-shadow ${ring}`}
      >
        {cameraOn ? (
          <>
            <video ref={video} className="size-full object-cover" muted playsInline />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80"
            />
            <button
              type="button"
              aria-label="Matikan kamera"
              onClick={() => setCameraOn(false)}
              className="tap absolute bottom-2 right-2 flex size-10 items-center justify-center rounded-full bg-black/55 text-white"
            >
              <CameraOff className="size-5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-secondary px-4 text-center">
            {supported ? (
              <button
                type="button"
                onClick={() => {
                  setCameraError("");
                  setCameraOn(true);
                }}
                className="tap inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-red px-4 text-[14px] font-semibold text-white"
              >
                <Camera className="size-5" aria-hidden="true" />
                Nyalakan kamera
              </button>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Browser ini belum bisa membaca QR lewat kamera. Pakai scanner USB atau ketik kode di
                bawah, atau scan dengan aplikasi Kamera ponsel (QR membuka halaman ini).
              </p>
            )}
            {cameraError && (
              <p role="alert" className="text-[12px] text-destructive">
                {cameraError}
              </p>
            )}
          </div>
        )}
      </div>

      {latest ? (
        <ResultCard
          key={latest.id}
          entry={latest}
          hub={hub}
          busy={busy}
          needsBatch={needsBatch}
          onWeigh={onWeigh}
          onOpenBatch={onOpenBatch}
          onProblem={onProblem}
          onNext={() => setHistory((h) => h.slice(1))}
          onReceive={() => {
            lastCode.current = { code: "", at: 0 };
            setHistory((h) => h.slice(1));
            void handle(latest.code);
          }}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
          Arahkan kamera ke QR di label paket. Hasilnya muncul di sini.
        </div>
      )}

      {typing || !supported ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text;
            setText("");
            void handle(value);
          }}
        >
          <input
            className={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scanner USB atau ketik DJW-KR-0042"
            aria-label="Kode pengiriman"
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus={!supported}
          />
          <button
            type="submit"
            disabled={busy || text.trim().length < 4}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand-red px-4 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Cari
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setTyping(true)}
          className="tap inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-[13px] font-semibold"
        >
          <Keyboard className="size-4" aria-hidden="true" />
          Ketik kode atau pakai scanner USB
        </button>
      )}

      {history.length > 1 && (
        <details className="rounded-2xl bg-secondary p-3 text-[12px]">
          <summary className="cursor-pointer font-semibold">
            Riwayat scan ({history.length - 1})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {history.slice(1).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{e.code}</span>
                <span className="text-muted-foreground">{summaryOf(e.result)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function summaryOf(r: ScanResult) {
  if (!r.found) return r.reason === "unknown" ? "Tidak ada di sistem" : "QR tidak dikenali";
  if (r.kind === "batch")
    return `Batch ${r.batch.status === "OPEN" ? "terbuka" : "dalam perjalanan"}`;
  return (
    {
      received: "Diterima",
      checked_in: "Check-in",
      loaded: "Dimuat",
      already: "Sudah",
      wrong_place: "Salah tempat",
      not_ready: "Belum siap",
      blocked: SHIPPING_STATUS_LABEL[r.order.status as ShippingStatus],
      problem: "Bermasalah",
      found: r.order.statusLabel,
    } as const
  )[r.outcome];
}

function ResultCard({
  entry,
  hub,
  busy,
  needsBatch,
  onWeigh,
  onOpenBatch,
  onProblem,
  onReceive,
  onNext,
}: {
  entry: Entry;
  hub: Hub;
  busy: boolean;
  needsBatch: boolean;
  onWeigh: (orderId: string) => void;
  onOpenBatch: (batchId: string) => void;
  onProblem: (orderId: string, code: string) => void;
  onReceive: () => void;
  onNext: () => void;
}) {
  const { result } = entry;
  const next = (
    <button
      type="button"
      onClick={onNext}
      className={`${bigBtn} border border-border bg-background`}
    >
      Scan berikutnya
    </button>
  );
  if (!result.found)
    return (
      <div role="alert" className="rounded-2xl border border-[#ffc9c5] bg-[#fff0ef] p-4">
        <p className="text-[15px] font-bold text-destructive">
          {result.reason === "unknown" ? "Kode tidak ada di sistem" : "QR bukan label Djiwa"}
        </p>
        <p className="mt-0.5 text-[12px] text-destructive/90">
          {result.reason === "unknown"
            ? `${entry.code} tidak ditemukan. Periksa kodenya.`
            : "Isi QR tidak dikenali sebagai kode pengiriman. Coba scan ulang."}
        </p>
        <div className="mt-3">{next}</div>
      </div>
    );

  if (result.kind === "batch") {
    const b = result.batch;
    return (
      <div className="rounded-2xl border border-border bg-secondary p-4" aria-live="polite">
        <p className="font-mono text-[18px] font-bold">{b.code}</p>
        <p className="text-[13px] font-medium">
          {HUB_LABEL[b.fromHub]} → {b.toHub === "JAPAN" ? "Jepang" : HUB_LABEL[b.toHub]} ·{" "}
          {b.carrier}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {b.total} paket · {formatKg(b.kg)} · {b.checked} ter-scan
        </p>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => onOpenBatch(b.id)}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Buka batch
          </button>
          {next}
        </div>
      </div>
    );
  }

  const o = result.order;
  const outcome = result.outcome;
  const kind =
    outcome === "received" || outcome === "checked_in" || outcome === "loaded"
      ? "ok"
      : outcome === "already"
        ? "warn"
        : outcome === "found"
          ? "neutral"
          : "bad";
  const skin = {
    ok: "border-[#b8e6c6] bg-[#e8f8ed]",
    warn: "border-[#f1d9a8] bg-[#fffaf0]",
    bad: "border-[#ffc9c5] bg-[#fff0ef]",
    neutral: "border-border bg-secondary",
  }[kind];
  const color = {
    ok: "text-[#15803D]",
    warn: "text-[#9a6100]",
    bad: "text-destructive",
    neutral: "text-foreground",
  }[kind];
  const title =
    outcome === "received"
      ? "Diterima di Tasikmalaya"
      : outcome === "checked_in"
        ? `Check-in di ${HUB_LABEL[hub]}`
        : outcome === "loaded"
          ? `Dimuat ke ${("batchCode" in result ? (result.batchCode as string | null) : null) ?? "batch"}`
          : outcome === "already"
            ? "Sudah tercatat sebelumnya"
            : outcome === "wrong_place"
              ? "Salah tempat"
              : outcome === "not_ready"
                ? "Belum bisa dimuat"
                : outcome === "blocked"
                  ? `Jangan diproses: ${SHIPPING_STATUS_LABEL[o.status as ShippingStatus].toLowerCase()}`
                  : outcome === "problem"
                    ? "Paket bermasalah"
                    : o.statusLabel;
  const msg = result.message;
  const status = o.status as ShippingStatus;
  const progress =
    "progress" in result ? (result.progress as { checked: number; total: number } | null) : null;
  const loaded = "loaded" in result ? (result.loaded as { total: number; kg: number }) : null;

  return (
    <div className={`rounded-2xl border p-4 ${skin}`} aria-live="polite">
      <p className={`text-[20px] font-bold leading-tight ${color}`}>{title}</p>
      <p className="mt-1 font-mono text-[18px] font-bold tracking-wide">{o.code}</p>
      <p className="mt-0.5 text-[13px] font-medium">
        {o.recipientName}, {o.prefecture} · {formatKg(o.billedKg ?? o.estimatedKg)}
      </p>
      <p className="text-[12px] text-muted-foreground">{o.contents}</p>
      {msg && <p className={`mt-1 text-[12px] font-semibold ${color}`}>{msg}</p>}
      {outcome === "already" && o.sinceAt && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {o.statusLabel} sejak {formatAdminDateTime(o.sinceAt)}. Tidak ada yang diubah.
        </p>
      )}
      {outcome === "received" && (
        <p className="mt-1 text-[12px] text-muted-foreground">Pelanggan sudah dikabari.</p>
      )}
      {progress && (
        <p className="mt-1 text-[12px] font-semibold">
          {progress.checked} dari {progress.total} paket di batch ini sudah ter-scan
          {progress.checked === progress.total ? ", batch selesai" : ""}.
        </p>
      )}
      {loaded && (
        <p className="mt-1 text-[12px] font-semibold">
          {loaded.total} paket dimuat · {formatKg(loaded.kg)}
        </p>
      )}
      {outcome === "problem" && o.problemNote && (
        <p className="mt-1 text-[12px] text-destructive">{o.problemNote}</p>
      )}
      {(o.photoShort || o.photoReview === "REDO") && hub === "TASIK" && (
        <p className="mt-1 text-[12px] font-semibold text-[#9a6100]">
          {o.photoReview === "REDO"
            ? "Menunggu foto ulang dari pelanggan."
            : `Foto pelanggan belum lengkap (${o.photoCount}).`}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {outcome === "found" && status === "AWAITING_DROP" && hub === "TASIK" && (
          <button
            type="button"
            disabled={busy}
            onClick={onReceive}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Terima di drop point
          </button>
        )}
        {hub === "TASIK" && (status === "RECEIVED" || status === "EXPIRED") && (
          <button
            type="button"
            onClick={() => onWeigh(o.id)}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Timbang sekarang
          </button>
        )}
        {needsBatch && outcome === "not_ready" && (
          <p className="text-[12px] text-[#9a6100]">Buka tab Batch untuk membuat batch.</p>
        )}
        {["TO_BANDUNG", "AT_BANDUNG", "TO_JAKARTA", "AT_JAKARTA", "PAID", "SHIPPED"].includes(
          status,
        ) &&
          kind !== "bad" && (
            <button
              type="button"
              onClick={() => onProblem(o.id, o.code)}
              className={`${bigBtn} border border-border bg-background text-destructive`}
            >
              Tandai rusak atau hilang
            </button>
          )}
        {next}
      </div>
    </div>
  );
}
