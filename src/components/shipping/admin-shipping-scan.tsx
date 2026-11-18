import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { scanShipping } from "@/lib/shipping.fn";
import {
  SHIPPING_STATUS_LABEL,
  formatKg,
  parseScanCode,
  type ShippingStatus,
} from "@/lib/shipping";
import { formatAdminDateTime } from "@/lib/admin-display";
import { StatusPill } from "@/components/admin-shell";

type ScanResult = Awaited<ReturnType<typeof scanShipping>>;
type Mode = "receive" | "weigh" | "handover";
type Entry = { at: number; code: string; result: ScanResult };

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "receive", label: "Terima", hint: "Scan mengubah status ke Diterima di drop point." },
  { id: "weigh", label: "Timbang", hint: "Scan membuka formulir timbang paketnya." },
  { id: "handover", label: "Serah ke kurir", hint: "Scan membuka formulir kurir dan resi." },
];

const input =
  "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-red";
const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const cameraSupported = () =>
  typeof window !== "undefined" &&
  "BarcodeDetector" in window &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Scan tab: the team scans the QR on a parcel label with the phone camera (where the browser can read
 * QR codes), a USB scanner (it types the code and Enter), or by typing the code. "Terima" moves the
 * parcel to "Diterima di drop point" by itself; the other modes open the parcel's own form.
 */
export function AdminShippingScan({
  initialCode,
  onOpen,
  onChanged,
}: {
  initialCode: string | null;
  onOpen: (orderId: string) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("receive");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const field = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (raw: string, forceMode?: "lookup" | "receive") => {
      const code = parseScanCode(raw);
      if (!code) {
        setHistory((h) => [
          { at: Date.now(), code: raw.slice(0, 40), result: { found: false, reason: "invalid" } },
          ...h,
        ]);
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
        setHistory((h) => [{ at: now, code, result }, ...h].slice(0, 12));
        if (result.found && result.outcome === "received") onChanged();
        if (result.found && result.outcome === "found" && !forceMode) onOpen(result.order.id);
      } catch (error) {
        setHistory((h) => [
          {
            at: now,
            code,
            result: { found: false, reason: "invalid" },
          },
          ...h,
        ]);
        void error;
      } finally {
        setBusy(false);
      }
    },
    [mode, onChanged, onOpen],
  );

  // A link opened from the phone's own camera app arrives as ?scan=CODE: look it up, never change it.
  useEffect(() => {
    if (initialCode) void handle(initialCode, "lookup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // Live camera scanning.
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
        if (stopped || !video.current) return;
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
          timer = window.setTimeout(tick, 350);
        };
        void tick();
      } catch {
        setCameraError(
          "Kamera tidak bisa dibuka. Izinkan akses kamera atau pakai scanner/ketik kode.",
        );
        setCameraOn(false);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn, handle]);

  const hint = MODES.find((m) => m.id === mode)!.hint;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-secondary p-1" role="tablist" aria-label="Mode scan">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-10 flex-1 rounded-lg text-xs font-semibold ${mode === m.id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          {cameraOn ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={video} className="h-56 w-full object-cover" muted playsInline />
              <span className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl bg-secondary px-4 text-center text-xs text-muted-foreground">
              {cameraSupported()
                ? "Nyalakan kamera lalu arahkan ke QR di label paket."
                : "Browser ini belum bisa membaca QR lewat kamera. Pakai scanner USB, ketik kode, atau scan dengan aplikasi Kamera ponsel (akan membuka halaman ini)."}
            </div>
          )}
          {cameraError && (
            <p role="alert" className="text-xs text-destructive">
              {cameraError}
            </p>
          )}
          <button
            type="button"
            disabled={!cameraSupported()}
            className={btn}
            onClick={() => {
              setCameraError("");
              setCameraOn((v) => !v);
            }}
          >
            {cameraOn ? (
              <CameraOff className="size-4" aria-hidden="true" />
            ) : (
              <Camera className="size-4" aria-hidden="true" />
            )}
            {cameraOn ? "Matikan kamera" : "Nyalakan kamera"}
          </button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = text;
              setText("");
              void handle(value);
              field.current?.focus();
            }}
          >
            <input
              ref={field}
              className={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Scanner USB atau ketik DJW-KR-0042"
              aria-label="Kode pengiriman"
              autoComplete="off"
              autoFocus
            />
            <button type="submit" disabled={busy || text.trim().length < 4} className={btnPrimary}>
              Cari
            </button>
          </form>
        </div>

        <ul className="space-y-2" aria-live="polite">
          {history.length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Hasil scan muncul di sini.
            </li>
          )}
          {history.map((entry) => (
            <ResultCard key={entry.at + entry.code} entry={entry} mode={mode} onOpen={onOpen} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ResultCard({
  entry,
  mode,
  onOpen,
}: {
  entry: Entry;
  mode: Mode;
  onOpen: (orderId: string) => void;
}) {
  const { result } = entry;
  if (!result.found)
    return (
      <li className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
        {result.reason === "unknown"
          ? `Kode ${entry.code} tidak ada di sistem.`
          : "Isi QR tidak dikenali sebagai kode pengiriman Djiwa."}
      </li>
    );
  const o = result.order;
  const status = o.status as ShippingStatus;
  const [tone, message] =
    result.outcome === "received"
      ? ([
          "text-[#15803D]",
          `Status berubah otomatis ke Diterima, ${formatAdminDateTime(o.receivedAt ?? new Date().toISOString())}.`,
        ] as const)
      : result.outcome === "already"
        ? ([
            "text-[#9a6100]",
            o.receivedAt
              ? `Sudah diterima ${formatAdminDateTime(o.receivedAt)}. Tidak ada yang diubah.`
              : "Status tidak diubah.",
          ] as const)
        : result.outcome === "blocked"
          ? ([
              "text-destructive",
              `Pengiriman ini ${SHIPPING_STATUS_LABEL[status].toLowerCase()}. Jangan diproses.`,
            ] as const)
          : (["text-muted-foreground", "Pengiriman ditemukan."] as const);
  return (
    <li className="rounded-xl bg-secondary p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand-red">{o.code}</p>
          <p className="truncate text-muted-foreground">
            {o.recipientName}, {o.prefecture} · {formatKg(o.estimatedKg)}
          </p>
        </div>
        <StatusPill tone={status === "RECEIVED" ? "good" : "warn"}>{o.statusLabel}</StatusPill>
      </div>
      <p className={`mt-1 font-semibold ${tone}`}>{message}</p>
      <p className="mt-0.5 text-muted-foreground">{o.contents}</p>
      {o.photoShort && (
        <p className="mt-1 font-semibold text-[#9a6100]">
          Foto pelanggan belum lengkap ({o.photoCount}).
        </p>
      )}
      {o.photoReview === "REDO" && (
        <p className="mt-1 font-semibold text-[#9a6100]">
          Sedang menunggu foto ulang dari pelanggan.
        </p>
      )}
      {result.outcome !== "blocked" && (
        <button type="button" className={`${btn} mt-2 w-full`} onClick={() => onOpen(o.id)}>
          {mode === "handover" && status === "PAID"
            ? "Buka formulir kirim"
            : mode === "weigh" && status === "RECEIVED"
              ? "Buka formulir timbang"
              : "Buka detail pengiriman"}
        </button>
      )}
      {mode === "weigh" && status === "AWAITING_DROP" && (
        <p className="mt-1 text-[#9a6100]">Paket belum diterima. Pakai mode Terima dulu.</p>
      )}
      {mode === "handover" && status !== "PAID" && result.outcome !== "blocked" && (
        <p className="mt-1 text-[#9a6100]">Belum dibayar, paket belum boleh diserahkan ke kurir.</p>
      )}
    </li>
  );
}
