import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import { PHOTO_REVIEW_LABEL, SHIPPING_MAX_PHOTOS, type PhotoReview } from "@/lib/shipping";

/** Top-down sketch of the right way to photograph the contents: everything side by side, one layer. */
export function PhotoExample() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="w-full rounded-xl"
      role="img"
      aria-label="Contoh foto: semua barang dijejer satu lapis di alas polos, dilihat dari atas"
    >
      <rect width="260" height="150" rx="10" fill="#E9EBF0" />
      <rect x="14" y="24" width="52" height="70" rx="6" fill="#F59F00" />
      <rect x="22" y="40" width="36" height="8" rx="3" fill="#fff" opacity=".8" />
      <rect x="76" y="30" width="44" height="60" rx="6" fill="#6F4E37" />
      <rect x="82" y="44" width="32" height="8" rx="3" fill="#fff" opacity=".7" />
      <rect x="130" y="26" width="56" height="46" rx="5" fill="#3B5BDB" />
      <rect x="130" y="76" width="56" height="30" rx="5" fill="#5C7CFA" />
      <rect x="196" y="30" width="50" height="40" rx="5" fill="#E03131" />
      <rect x="196" y="74" width="50" height="30" rx="5" fill="#FF8787" />
      <rect x="14" y="108" width="82" height="30" rx="5" fill="#fff" />
      <text x="22" y="127" fontSize="12" fontFamily="monospace" fontWeight="700" fill="#17181C">
        DJW-KR-0042
      </text>
    </svg>
  );
}

const TIPS = [
  "Pakai alas polos (meja atau kain) dan cahaya terang.",
  "Jejerkan semua barang satu lapis, jangan ditumpuk.",
  "Satu foto untuk semua barang, lalu foto dekat untuk label atau merek.",
  "Foto dari atas, tidak gelap, tidak buram.",
];

export function PhotoGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <PhotoExample />
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Semua barang terlihat jelas, tidak bertumpuk, dilihat dari atas.
      </p>
      {!compact && (
        <>
          <p className="ios-section-label mt-3 !px-0">Tips</p>
          <ol className="ios-group divide-y divide-border/70 text-[12px]">
            {TIPS.map((tip, i) => (
              <li key={tip} className="ios-row">
                <span className="ios-tile bg-secondary text-[11px] font-bold">{i + 1}</span>
                <span className="font-medium">{tip}</span>
              </li>
            ))}
          </ol>
          <p className="ios-section-label mt-3 !px-0">Hindari</p>
          <ul className="ios-group divide-y divide-border/70 text-[12px] text-muted-foreground">
            <li className="px-3 py-2">Foto gelap, buram, atau dari jauh.</li>
            <li className="px-3 py-2">Barang tertutup atau masih di dalam tas tertutup.</li>
          </ul>
        </>
      )}
    </div>
  );
}

export function PhotoGuideSheet({ trigger }: { trigger?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap text-[11px] font-semibold text-brand-red underline"
      >
        {trigger ?? "Lihat contoh cara memotret"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4">
          <DialogTitle className="text-[16px]">Cara memotret isi paket</DialogTitle>
          <DialogDescription className="text-[12px]">
            Foto ini dipakai tim kami untuk mencocokkan isi paket saat diterima.
          </DialogDescription>
          <PhotoGuide />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A photo picked on this device: shrunk to a JPEG (which also drops EXIF and location data). */
export type PickedPhoto = { id: string; file: File; url: string };

let counter = 0;

async function prepare(file: File): Promise<PickedPhoto | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const blob = await compressReceiptPhoto(file);
    const prepared = new File([blob], `foto-${Date.now()}-${counter}.jpg`, {
      type: blob.type || "image/jpeg",
    });
    return { id: `p${counter++}`, file: prepared, url: URL.createObjectURL(prepared) };
  } catch {
    return null;
  }
}

/**
 * Camera and gallery buttons plus thumbnails. Used by the booking form, so the files stay in memory
 * and go up with the booking; `onChange` always receives the full list.
 */
export function PhotoPicker({
  photos,
  onChange,
  min,
  error,
}: {
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  min: number;
  error?: string | undefined;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(photos);
  latest.current = photos;
  // Free the preview URLs when the form goes away.
  useEffect(
    () => () => {
      for (const p of latest.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    const next = [...photos];
    let skipped = 0;
    for (const file of Array.from(list)) {
      if (next.length >= SHIPPING_MAX_PHOTOS) {
        skipped++;
        continue;
      }
      const picked = await prepare(file);
      if (picked) next.push(picked);
      else skipped++;
    }
    onChange(next);
    setBusy(false);
    if (skipped > 0) toast.error(`Maksimal ${SHIPPING_MAX_PHOTOS} foto, dan hanya gambar.`);
  }

  const full = photos.length >= SHIPPING_MAX_PHOTOS;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          Foto isi paket{min > 0 ? ` (wajib, minimal ${min})` : ""}
        </p>
        <PhotoGuideSheet trigger="Lihat contoh" />
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative aspect-square overflow-hidden rounded-xl bg-secondary"
          >
            <img src={p.url} alt="Foto isi paket" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Hapus foto"
              onClick={() => {
                URL.revokeObjectURL(p.url);
                onChange(photos.filter((x) => x.id !== p.id));
              }}
              className="tap absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        {!full && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => camera.current?.click()}
              className="tap flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-surface text-[10.5px] font-semibold disabled:opacity-50"
            >
              <Camera className="size-4" aria-hidden="true" />
              Kamera
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => gallery.current?.click()}
              className="tap flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-surface text-[10.5px] font-semibold disabled:opacity-50"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Galeri
            </button>
          </>
        )}
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Ambil foto dengan kamera"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Pilih foto dari galeri"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Jejerkan semua barang dalam satu foto. Maksimal {SHIPPING_MAX_PHOTOS} foto.
      </p>
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const REVIEW_TONE: Record<PhotoReview, string> = {
  PENDING: "bg-secondary text-muted-foreground",
  APPROVED: "bg-[#DCF5E3] text-[#15803D]",
  REDO: "bg-[#FFF1D6] text-[#92400E]",
};

export function PhotoReviewBadge({ review }: { review: PhotoReview }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold ${REVIEW_TONE[review]}`}
    >
      {PHOTO_REVIEW_LABEL[review]}
    </span>
  );
}

/**
 * The customer's proof photos on a booking that already exists: the team's review state, the photos,
 * and (while the parcel is still waiting) adding or removing photos, e.g. after a retake request.
 */
export function ProofPhotos({
  orderId,
  photoIds,
  review,
  note,
  min,
  editable,
  onChanged,
  onRemove,
}: {
  orderId: string;
  photoIds: string[];
  review: PhotoReview;
  note: string | null;
  min: number;
  editable: boolean;
  onChanged: () => void;
  onRemove: (photoId: string) => Promise<unknown>;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const short = photoIds.length < min;
  const full = photoIds.length >= SHIPPING_MAX_PHOTOS;

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      let count = photoIds.length;
      for (const file of Array.from(list)) {
        if (count >= SHIPPING_MAX_PHOTOS) break;
        const picked = await prepare(file);
        if (!picked) continue;
        const form = new FormData();
        form.set("orderId", orderId);
        form.set("photo", picked.file, picked.file.name);
        URL.revokeObjectURL(picked.url);
        const response = await fetch("/api/shipping-photo", { method: "POST", body: form });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(body.error || "Foto belum terunggah");
        count++;
      }
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Foto belum terunggah");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ios-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">Foto isi paket</p>
        <PhotoReviewBadge review={review} />
      </div>
      {review === "REDO" && note && (
        <p className="mt-1 rounded-lg bg-[#FFF1D6] p-2 text-[12px] text-[#92400E]">
          Tim kami meminta foto ulang: {note}
        </p>
      )}
      {short && (
        <p className="mt-1 text-[12px] text-destructive">Foto belum lengkap, minimal {min} foto.</p>
      )}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {photoIds.map((id) => (
          <div key={id} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
            <img
              src={`/api/shipping-photo/${id}`}
              alt="Foto isi paket"
              className="size-full object-cover"
              loading="lazy"
            />
            {editable && (
              <button
                type="button"
                aria-label="Hapus foto"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onRemove(id);
                    onChanged();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Foto belum terhapus");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="tap absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {editable && !full && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => camera.current?.click()}
              className="tap flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-surface text-[10.5px] font-semibold disabled:opacity-50"
            >
              <Camera className="size-4" aria-hidden="true" />
              Kamera
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => gallery.current?.click()}
              className="tap flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-surface text-[10.5px] font-semibold disabled:opacity-50"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              Galeri
            </button>
          </>
        )}
      </div>
      {editable && (
        <>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Ambil foto dengan kamera"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={gallery}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Pilih foto dari galeri"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="mt-2">
            <PhotoGuideSheet />
          </div>
        </>
      )}
    </div>
  );
}
