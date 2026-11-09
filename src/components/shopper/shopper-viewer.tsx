import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { imageVariant, type GalleryImage } from "@/lib/personal-shopper";

const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 280;

/** One photo: pinch or double-tap to zoom, drag to look around while zoomed. */
function ZoomSlide({
  image,
  active,
  onZoomChange,
}: {
  image: GalleryImage;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  // Leaving a slide puts it back to normal so the next visit starts fit-to-screen.
  useEffect(() => {
    if (!active) setView({ scale: 1, x: 0, y: 0 });
  }, [active]);
  useEffect(() => {
    if (active) onZoomChange(view.scale > 1.01);
  }, [active, view.scale, onZoomChange]);

  const clamp = (scale: number, x: number, y: number) => {
    const rect = box.current?.getBoundingClientRect();
    const maxX = rect ? (rect.width * (scale - 1)) / 2 : 0;
    const maxY = rect ? (rect.height * (scale - 1)) / 2 : 0;
    return {
      scale,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const onDown = (event: ReactPointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        scale: view.scale,
      };
    }
  };
  const onMove = (event: ReactPointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const scale = Math.max(
        1,
        Math.min(MAX_SCALE, pinch.current.scale * (distance / pinch.current.distance)),
      );
      setView((v) => clamp(scale, v.x, v.y));
    } else if (pointers.current.size === 1 && view.scale > 1) {
      setView((v) => clamp(v.scale, v.x + next.x - previous.x, v.y + next.y - previous.y));
    }
  };
  const onUp = (event: ReactPointerEvent) => {
    const moved = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!moved) return;
    // A tap, not a drag: two quick taps toggle the zoom.
    if (Math.hypot(event.clientX - moved.x, event.clientY - moved.y) < 6) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        setView((v) => (v.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }));
      } else lastTap.current = now;
    }
  };

  return (
    <div
      ref={box}
      data-testid="viewer-slide"
      className="flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
      style={{ touchAction: view.scale > 1.01 ? "none" : "pan-x" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {failed ? (
        <p className="text-[13px] text-white/70">Foto tidak bisa dimuat</p>
      ) : (
        <img
          src={imageVariant(image.src, 1100) ?? image.src}
          alt={image.label}
          draggable={false}
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: pointers.current.size ? "none" : "transform 0.2s ease-out",
          }}
        />
      )}
    </div>
  );
}

/**
 * Full-screen photo viewer: swipe between photos, pinch or double-tap to zoom, thumbnails to
 * jump. `footer` holds the one action that belongs next to the photo (for example "Titip").
 */
export function ImageViewer({
  images,
  index,
  open,
  title,
  onClose,
  footer,
}: {
  images: GalleryImage[];
  index: number;
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [current, setCurrent] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const count = images.length;

  const goTo = useCallback(
    (next: number, smooth = true) => {
      const el = track.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(count - 1, next));
      const left = clamped * el.clientWidth;
      if (smooth && typeof el.scrollTo === "function") el.scrollTo({ left, behavior: "smooth" });
      else el.scrollLeft = left;
      setCurrent(clamped);
    },
    [count],
  );

  useEffect(() => {
    if (!open) return;
    setCurrent(index);
    setZoomed(false);
    const frame = requestAnimationFrame(() => goTo(index, false));
    return () => cancelAnimationFrame(frame);
  }, [open, index, goTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goTo(current + 1);
      if (event.key === "ArrowLeft") goTo(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, current, goTo]);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (count === 0) return null;
  const shown = images[Math.min(current, count - 1)]!;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/95 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[70] mx-auto flex max-w-md flex-col outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-3 pb-1 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/80">{title}</p>
            <span className="text-[12px] tabular-nums text-white/70" aria-live="polite">
              {Math.min(current, count - 1) + 1} / {count}
            </span>
            <DialogPrimitive.Close
              aria-label="Tutup foto"
              className="tap flex size-9 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={track}
              onScroll={onScroll}
              className={`flex h-full snap-x snap-mandatory ${zoomed ? "overflow-x-hidden" : "overflow-x-auto"} [scrollbar-width:none]`}
            >
              {images.map((image, i) => (
                <ZoomSlide
                  key={image.src}
                  image={image}
                  active={i === current}
                  onZoomChange={setZoomed}
                />
              ))}
            </div>
            {count > 1 && current > 0 && !zoomed && (
              <button
                type="button"
                aria-label="Foto sebelumnya"
                onClick={() => goTo(current - 1)}
                className="tap absolute left-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white sm:flex"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            )}
            {count > 1 && current < count - 1 && !zoomed && (
              <button
                type="button"
                aria-label="Foto berikutnya"
                onClick={() => goTo(current + 1)}
                className="tap absolute right-2 top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white sm:flex"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
            <p className="mb-1.5 text-center text-[11px] text-white/70">{shown.label}</p>
            {count > 1 && (
              <div className="mb-2 flex justify-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {images.map((image, i) => (
                  <button
                    key={image.src}
                    type="button"
                    aria-label={`Foto ${i + 1}: ${image.label}`}
                    aria-current={i === current}
                    onClick={() => goTo(i)}
                    className={`size-11 shrink-0 overflow-hidden rounded-lg border-2 ${
                      i === current ? "border-white" : "border-transparent opacity-60"
                    }`}
                  >
                    <img
                      src={imageVariant(image.src, 160) ?? image.src}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
            {footer}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
