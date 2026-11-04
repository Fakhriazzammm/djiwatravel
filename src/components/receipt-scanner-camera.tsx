import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Check, Images, Triangle, X, Zap } from "lucide-react";
import { frameDifference, frameStats, looksLikeReceipt } from "@/lib/receipt-image";
import type { ScanItem } from "@/lib/receipt-scan-client";

type Props = {
  items: ScanItem[];
  readCount: number;
  /** Scans left today; at 0 the shutter is off. */
  remaining: number;
  /** Photos still allowed in this session. */
  room: number;
  onCapture: (photo: Blob) => void;
  onPick: (files: File[]) => void;
  onDone: () => void;
  onClose: () => void;
};

const SAMPLE_W = 64;
const SAMPLE_H = 48;

/**
 * Full-screen camera for several receipts. "Otomatis" takes the photo by itself once a receipt-like
 * paper is in the frame and the phone has been still for a second; the shutter always works too.
 * Without camera access (denied, no camera, desktop) the same screen offers the gallery.
 */
export function ReceiptScannerCamera({
  items,
  readCount,
  remaining,
  room,
  onCapture,
  onPick,
  onDone,
  onClose,
}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const sample = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "denied" | "unsupported">("starting");
  const [auto, setAuto] = useState(true);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [hint, setHint] = useState<"aim" | "hold" | "shot">("aim");
  const stillFrames = useRef(0);
  const armed = useRef(true);
  const lastGray = useRef<Uint8ClampedArray | null>(null);
  const latest = useRef({ onCapture, remaining, room, auto });
  latest.current = { onCapture, remaining, room, auto };
  const gallery = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const el = video.current;
        if (el) {
          el.srcObject = media;
          await el.play().catch(() => undefined);
        }
        const caps = media.getVideoTracks()[0]?.getCapabilities?.() as
          { torch?: boolean } | undefined;
        setTorchSupported(Boolean(caps?.torch));
        setState("live");
      } catch {
        if (!cancelled) setState("denied");
      }
    }
    void start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);

  const shoot = useCallback(() => {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) latest.current.onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  }, []);

  // Stillness and "receipt in frame" check, five times a second, on a tiny grayscale copy.
  useEffect(() => {
    if (state !== "live") return;
    const timer = window.setInterval(() => {
      const el = video.current;
      if (!el || !el.videoWidth) return;
      const canvas = (sample.current ??= document.createElement("canvas"));
      canvas.width = SAMPLE_W;
      canvas.height = SAMPLE_H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(el, 0, 0, SAMPLE_W, SAMPLE_H);
      const rgba = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      const gray = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H);
      for (let i = 0; i < gray.length; i++)
        gray[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
      const diff = lastGray.current ? frameDifference(gray, lastGray.current) : 99;
      lastGray.current = gray;
      const detected = looksLikeReceipt(frameStats(gray, SAMPLE_W, SAMPLE_H));
      if (diff > 7) armed.current = true; // the scene moved: ready for the next receipt
      if (diff < 2.4 && detected) stillFrames.current++;
      else stillFrames.current = 0;
      const { auto: isAuto, remaining: left, room: free } = latest.current;
      setHint(detected ? "hold" : "aim");
      if (isAuto && armed.current && stillFrames.current >= 5 && left > 0 && free > 0) {
        armed.current = false;
        stillFrames.current = 0;
        setHint("shot");
        shoot();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [state, shoot]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch((value) => !value);
    } catch {
      setTorchSupported(false);
    }
  }

  const blocked = remaining <= 0 || room <= 0;
  const reading = items.filter((i) => i.status === "sending").length;
  const live = state === "live";
  const hintText =
    remaining <= 0
      ? "Scan harian habis"
      : room <= 0
        ? "Batas foto sekali scan tercapai"
        : hint === "shot"
          ? "Memotret…"
          : hint === "hold"
            ? "Struk terdeteksi · tahan stabil"
            : "Arahkan ke struk";

  return (
    <motion.div
      className="fixed inset-0 z-[70] overflow-hidden bg-[#161618] text-white"
      role="dialog"
      aria-label="Kamera scan struk"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <AnimatePresence>
        <motion.div
          key={items.length}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-white"
          initial={{ opacity: items.length ? 0.55 : 0 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        />
      </AnimatePresence>
      <video
        ref={video}
        playsInline
        muted
        className="absolute inset-0 size-full object-cover"
        aria-hidden="true"
      />
      {!live && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div className="max-w-[280px]">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-white/15">
              <Camera className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[15px] font-semibold">
              {state === "starting" ? "Membuka kamera…" : "Kamera belum diizinkan"}
            </p>
            {state !== "starting" && (
              <>
                <p className="mt-1 text-[12px] text-white/75">
                  Aktifkan di pengaturan browser, atau pilih foto dari galeri.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => gallery.current?.click()}
                    className="tap min-h-11 rounded-xl bg-white text-[14px] font-semibold text-brand-red"
                  >
                    Pilih dari galeri
                  </button>
                  <button
                    type="button"
                    onClick={() => native.current?.click()}
                    className="tap min-h-11 rounded-xl bg-white/15 text-[14px] font-semibold"
                  >
                    Buka kamera bawaan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-black/25" aria-hidden="true" />

      <div className="absolute inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] flex items-center justify-between pt-2">
        <button
          type="button"
          aria-label="Tutup"
          onClick={onClose}
          className="tap grid size-11 place-items-center rounded-full bg-white/15"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[12px] font-semibold">
          <span className={`size-2 rounded-full ${reading ? "bg-white/60" : "bg-[#5BD08A]"}`} />
          {readCount} struk dibaca
        </div>
        {torchSupported ? (
          <button
            type="button"
            aria-label="Lampu kilat"
            aria-pressed={torch}
            onClick={() => void toggleTorch()}
            className={`tap grid size-11 place-items-center rounded-full ${torch ? "bg-white text-black" : "bg-white/15"}`}
          >
            <Zap className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {live && (
        <>
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-[19%] bottom-[28%]"
            aria-hidden="true"
          >
            {(
              [
                "left-0 top-0 border-l-4 border-t-4 rounded-tl-xl",
                "right-0 top-0 border-r-4 border-t-4 rounded-tr-xl",
                "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl",
                "right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl",
              ] as const
            ).map((corner) => (
              <span key={corner} className={`absolute size-9 border-white ${corner}`} />
            ))}
          </div>
          <div className="absolute inset-x-0 top-[72%] flex justify-center">
            <div
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold ${hint === "aim" || blocked ? "bg-black/55" : "bg-brand-red"}`}
              role="status"
            >
              {hint !== "aim" && !blocked && <Check className="size-4" aria-hidden="true" />}
              {hintText}
            </div>
          </div>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/60 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-9">
        {items.length > 0 && (
          <div className="flex items-center gap-2.5 pb-3.5">
            <div className="flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-1.5 pl-1 pr-1.5 [scrollbar-width:none]">
              {items.map((item) => (
                <motion.span
                  key={item.id}
                  initial={{ scale: 0.4, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  className="relative block h-16 w-[52px] shrink-0 rounded-[10px] ring-2 ring-white/55"
                >
                  <img src={item.url} alt="" className="size-full rounded-[10px] object-cover" />
                  <span
                    className={`absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full ${
                      item.status === "ready"
                        ? "bg-[#5BD08A] text-[#0B3B1E]"
                        : item.status === "sending" || item.status === "offline"
                          ? "bg-white text-brand-red"
                          : "bg-[#E8A317] text-[#3A2600]"
                    }`}
                  >
                    {item.status === "ready" ? (
                      <Check className="size-3" strokeWidth={3} aria-label="Siap" />
                    ) : item.status === "sending" || item.status === "offline" ? (
                      <span
                        className="block size-2.5 animate-spin rounded-full border-2 border-[#F0D5D7] border-t-brand-red"
                        aria-label="Membaca"
                      />
                    ) : (
                      <Triangle className="size-2.5" aria-label="Perlu dicek" />
                    )}
                  </span>
                </motion.span>
              ))}
            </div>
            <button
              type="button"
              onClick={onDone}
              className="tap min-h-11 shrink-0 rounded-[14px] bg-white px-3.5 text-[14px] font-bold text-brand-red"
            >
              Selesai · {items.length}
            </button>
          </div>
        )}
        <div className="flex items-center justify-around">
          <button
            type="button"
            aria-label="Pilih banyak dari galeri"
            onClick={() => gallery.current?.click()}
            disabled={blocked}
            className="tap grid place-items-center rounded-xl border-2 border-white/70 bg-[#4A4038] disabled:opacity-40"
            style={{ width: 48, height: 48 }}
          >
            <Images className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Ambil foto"
            onClick={shoot}
            disabled={!live || blocked}
            className="tap grid place-items-center rounded-full border-4 border-white disabled:opacity-40"
            style={{ width: 76, height: 76 }}
          >
            <span className="block rounded-full bg-white" style={{ width: 58, height: 58 }} />
          </button>
          <button
            type="button"
            aria-pressed={auto}
            onClick={() => setAuto((value) => !value)}
            className="tap w-12 text-center text-[11px] font-semibold"
          >
            {auto ? "Otomatis" : "Manual"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-white/80">
          {auto ? "Foto otomatis saat struk diam 1 detik" : "Ketuk tombol putih untuk memotret"}
          {remaining <= 10 && remaining > 0 ? ` · sisa ${remaining} scan hari ini` : ""}
        </p>
      </div>

      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="receipt-gallery-input"
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
      <input
        ref={native}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="receipt-native-input"
        onChange={(event) => {
          onPick([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </motion.div>
  );
}
