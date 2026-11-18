import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Undo2 } from "lucide-react";
import { runAdminShippingAction, scanShipping } from "@/lib/shipping.fn";
import {
  SHIPPING_STATUS_LABEL,
  formatKg,
  parseScanCode,
  type ShippingStatus,
} from "@/lib/shipping";
import { formatAdminDateTime } from "@/lib/admin-display";

type ScanResult = Awaited<ReturnType<typeof scanShipping>>;
type Mode = "receive" | "weigh" | "handover";
type Entry = { id: number; at: number; code: string; result: ScanResult; undone?: boolean };
type Flash = "ok" | "warn" | "bad" | null;

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "receive", label: "Terima", hint: "Scan langsung mengubah status ke Diterima." },
  { id: "weigh", label: "Timbang", hint: "Scan membuka formulir timbang." },
  { id: "handover", label: "Serah ke kurir", hint: "Scan membuka formulir kurir dan resi." },
];

const input =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus:border-brand-red";

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

let entryId = 0;

/**
 * Scan tab, built for one hand at the drop point: the camera opens on its own, the newest result is
 * a big colour-coded card with the next action under the thumb, and older scans fold away. "Terima"
 * moves a parcel to "Diterima di drop point" by itself (with Urungkan one tap away); "Timbang" and
 * "Serah ke kurir" open the parcel's own form, already scrolled to the field to fill.
 */
export function AdminShippingScan({
  initialCode,
  onOpen,
  onChanged,
}: {
  initialCode: string | null;
  /** Opens a parcel in the list; `focus` says which form the team wants next. */
  onOpen: (orderId: string, focus?: "weigh" | "ship") => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("receive");
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const supported = cameraSupported();

  const push = useCallback((entry: Omit<Entry, "id">) => {
    setHistory((h) => [{ ...entry, id: ++entryId }, ...h].slice(0, 30));
  }, []);

  const signal = useCallback((kind: Exclude<Flash, null>) => {
    setFlash(kind);
    buzz(kind === "ok" ? 60 : kind === "warn" ? [40, 60, 40] : [120, 60, 120]);
    window.setTimeout(() => setFlash(null), 900);
  }, []);

  const handle = useCallback(
    async (raw: string, forceMode?: "lookup" | "receive") => {
      const code = parseScanCode(raw);
      if (!code) {
        push({
          at: Date.now(),
          code: raw.slice(0, 40),
          result: { found: false, reason: "invalid" },
        });
        signal("bad");
        return;
      }
      // A camera sees the same label many times a second: ignore repeats for a few seconds.
      const now = Date.now();
      if (lastCode.current.code === code && now - lastCode.current.at < 4000) return;
      lastCode.current = { code, at: now };
      setBusy(true);
      try {
        const result = await scanShipping({
          data: { code, mode: forceMode ?? (mode === "receive" ? "receive" : "lookup") },
        });
        push({ at: now, code, result });
        if (!result.found) signal("bad");
        else if (result.outcome === "received") {
          signal("ok");
          onChanged();
        } else if (result.outcome === "found") {
          signal("ok");
          if (!forceMode) onOpen(result.order.id, mode === "handover" ? "ship" : "weigh");
        } else signal("warn");
      } catch {
        push({ at: now, code, result: { found: false, reason: "invalid" } });
        signal("bad");
      } finally {
        setBusy(false);
      }
    },
    [mode, onChanged, onOpen, push, signal],
  );

  // A link opened from the phone's own camera app arrives as ?scan=CODE: look it up, never change it.
  useEffect(() => {
    if (initialCode) void handle(initialCode, "lookup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // The camera starts by itself where the browser can read QR codes.
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

  async function undo(entry: Entry) {
    if (!entry.result.found) return;
    setBusy(true);
    try {
      await runAdminShippingAction({
        data: { orderId: entry.result.order.id, action: "undo_receive" },
      });
      setHistory((h) => h.map((e) => (e.id === entry.id ? { ...e, undone: true } : e)));
      lastCode.current = { code: "", at: 0 }; // the same label can be scanned again right away
      onChanged();
    } catch {
      signal("bad");
    } finally {
      setBusy(false);
    }
  }

  const latest = history[0] ?? null;
  const receivedToday = history.filter(
    (e) => e.result.found && e.result.outcome === "received" && !e.undone,
  ).length;
  const ring =
    flash === "ok"
      ? "ring-4 ring-[#34C759]"
      : flash === "warn"
        ? "ring-4 ring-[#FF9F0A]"
        : flash === "bad"
          ? "ring-4 ring-[#FF3B30]"
          : "ring-0";

  return (
    <div className="space-y-2.5">
      <div
        className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1"
        role="tablist"
        aria-label="Mode scan"
      >
        {MODES.map((m) => (
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

      <div
        className={`relative aspect-[4/3] max-h-[44dvh] w-full overflow-hidden rounded-2xl bg-black transition-shadow ${ring}`}
      >
        {cameraOn ? (
          <>
            <video ref={video} className="size-full object-cover" muted playsInline />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80"
            />
            <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
              {MODES.find((m) => m.id === mode)!.hint}
            </span>
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
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-secondary px-6 text-center">
            {supported ? (
              <button
                type="button"
                onClick={() => {
                  setCameraError("");
                  setCameraOn(true);
                }}
                className="tap inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand-red px-5 text-[14px] font-semibold text-white"
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
          busy={busy}
          onOpen={onOpen}
          onUndo={() => void undo(latest)}
          onReceive={() => {
            lastCode.current = { code: "", at: 0 };
            setHistory((h) => h.slice(1));
            void handle(latest.result.found ? latest.result.order.code : latest.code, "receive");
          }}
          onNext={() => setHistory((h) => h.slice(1))}
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
            className={input}
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
            {receivedToday > 0 ? ` · ${receivedToday} diterima` : ""}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {history.slice(1).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">
                  {e.result.found ? e.result.order.code : e.code}
                </span>
                <span className="text-muted-foreground">{summaryOf(e)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function summaryOf(e: Entry) {
  if (!e.result.found)
    return e.result.reason === "unknown" ? "Tidak ada di sistem" : "QR tidak dikenali";
  if (e.undone) return "Diurungkan";
  return e.result.outcome === "received"
    ? "Diterima"
    : e.result.outcome === "already"
      ? "Sudah diterima"
      : e.result.outcome === "blocked"
        ? SHIPPING_STATUS_LABEL[e.result.order.status as ShippingStatus]
        : e.result.order.statusLabel;
}

const bigBtn =
  "tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-semibold disabled:opacity-50";

function ResultCard({
  entry,
  busy,
  onOpen,
  onUndo,
  onReceive,
  onNext,
}: {
  entry: Entry;
  busy: boolean;
  onOpen: (orderId: string, focus?: "weigh" | "ship") => void;
  onUndo: () => void;
  onReceive: () => void;
  onNext: () => void;
}) {
  const { result } = entry;
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
        <button
          type="button"
          onClick={onNext}
          className={`${bigBtn} mt-3 border border-border bg-background`}
        >
          Scan berikutnya
        </button>
      </div>
    );

  const o = result.order;
  const status = o.status as ShippingStatus;
  const kind = entry.undone
    ? "undone"
    : result.outcome === "received"
      ? "ok"
      : result.outcome === "already"
        ? "warn"
        : result.outcome === "blocked"
          ? "bad"
          : "neutral";
  const skin = {
    ok: "border-[#b8e6c6] bg-[#e8f8ed]",
    warn: "border-[#f1d9a8] bg-[#fffaf0]",
    bad: "border-[#ffc9c5] bg-[#fff0ef]",
    undone: "border-border bg-secondary",
    neutral: "border-border bg-secondary",
  }[kind];
  const title = {
    ok: "Diterima",
    warn: "Sudah diterima sebelumnya",
    bad: `Jangan diproses: ${SHIPPING_STATUS_LABEL[status].toLowerCase()}`,
    undone: "Penerimaan diurungkan",
    neutral: o.statusLabel,
  }[kind];
  const titleColor = {
    ok: "text-[#15803D]",
    warn: "text-[#9a6100]",
    bad: "text-destructive",
    undone: "text-foreground",
    neutral: "text-foreground",
  }[kind];

  // A parcel looked up (Camera-app link, or Timbang/Serah mode) that is still waiting at the door.
  const canReceive = !entry.undone && status === "AWAITING_DROP" && result.outcome === "found";
  const canWeigh = !entry.undone && (status === "RECEIVED" || status === "EXPIRED");
  const canShip = !entry.undone && status === "PAID";

  return (
    <div className={`rounded-2xl border p-4 ${skin}`} aria-live="polite">
      <p className={`text-[20px] font-bold leading-tight ${titleColor}`}>{title}</p>
      <p className="mt-1 font-mono text-[18px] font-bold tracking-wide">{o.code}</p>
      <p className="mt-0.5 text-[13px] font-medium">
        {o.recipientName}, {o.prefecture} · {formatKg(o.estimatedKg)}
      </p>
      <p className="text-[12px] text-muted-foreground">{o.contents}</p>
      {kind === "ok" && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {formatAdminDateTime(o.receivedAt ?? new Date().toISOString())}. Pelanggan sudah dikabari.
        </p>
      )}
      {kind === "warn" && o.receivedAt && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Diterima {formatAdminDateTime(o.receivedAt)}. Tidak ada yang diubah.
        </p>
      )}
      {(o.photoShort || o.photoReview === "REDO") && (
        <p className="mt-1 text-[12px] font-semibold text-[#9a6100]">
          {o.photoReview === "REDO"
            ? "Menunggu foto ulang dari pelanggan."
            : `Foto pelanggan belum lengkap (${o.photoCount}).`}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {canReceive && (
          <button
            type="button"
            disabled={busy}
            onClick={onReceive}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Terima di drop point
          </button>
        )}
        {canWeigh && (
          <button
            type="button"
            onClick={() => onOpen(o.id, "weigh")}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Timbang sekarang
          </button>
        )}
        {canShip && (
          <button
            type="button"
            onClick={() => onOpen(o.id, "ship")}
            className={`${bigBtn} bg-brand-red text-white`}
          >
            Isi kurir dan resi
          </button>
        )}
        {kind === "ok" && (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            className={`${bigBtn} border border-border bg-background`}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Urungkan terima
          </button>
        )}
        {!canWeigh && !canShip && kind !== "bad" && kind !== "ok" && (
          <button
            type="button"
            onClick={() => onOpen(o.id)}
            className={`${bigBtn} border border-border bg-background`}
          >
            Buka detail pengiriman
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className={`${bigBtn} ${canWeigh || canShip || canReceive || kind === "ok" ? "text-muted-foreground" : "bg-background border border-border"}`}
        >
          Scan berikutnya
        </button>
      </div>
    </div>
  );
}
