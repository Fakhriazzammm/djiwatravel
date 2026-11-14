import { ConsentGate } from "@/components/consent-gate";
import { useConsent } from "@/hooks/use-consent";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { FeedAvatar } from "@/components/feeds/feed-card";
import { destinations } from "@/lib/catalog";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import {
  FEED_BODY_MAX,
  FEED_KINDS,
  FEED_KIND_LABEL,
  FEED_PLACE_MAX,
  inferFeedKind,
  isFeedKind,
  type FeedKind,
  type FeedPostView,
  type FeedsStatus,
} from "@/lib/feeds";

const sortedDestinations = [...destinations].sort((a, b) => a.nameId.localeCompare(b.nameId, "id"));
const quick =
  "tap flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary text-[12px] font-semibold";

/**
 * The card at the top of the timeline ("Bagikan tips atau tanya traveler…"). It opens in place:
 * text, an optional place and photo, a destination and the kind (guessed from the text).
 */
export function FeedComposer({
  status,
  onPosted,
  startKind,
  flush = false,
}: {
  status: FeedsStatus;
  onPosted: (post: FeedPostView, pending: boolean) => void;
  /** Opens the composer straight away with this kind (e.g. "Bagikan ke Feeds" from a delivered order). */
  startKind?: FeedKind | undefined;
  /** Edge to edge, as the first row of the Feeds page timeline (instead of a rounded card). */
  flush?: boolean | undefined;
}) {
  const shell = flush
    ? "-mx-4 border-y border-border/60 bg-surface px-3 py-3"
    : "rounded-2xl bg-surface p-3";
  const { user } = useBetterAuthUser();
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState<"signin" | "banned" | "consent" | null>(null);
  const consent = useConsent();
  const communityOk = consent.state ? consent.state.purposes.community : status.communityConsent;
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<FeedKind | null>(null);
  const [showPlace, setShowPlace] = useState(false);
  const [place, setPlace] = useState("");
  const [destination, setDestination] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const name = user?.name?.trim() || "";

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  const effectiveKind = kind ?? inferFeedKind(body, showPlace ? place : "");

  useEffect(() => {
    if (!startKind) return;
    if (!status.signedIn) return setGate("signin");
    if (status.banned) return setGate("banned");
    if (!communityOk) return setGate("consent");
    setKind(startKind);
    setOpen(true);
    // Only on arrival: later changes to the session must not reopen a closed composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKind]);

  function begin(action?: "photo" | "place" | "tanya") {
    if (!status.signedIn) return setGate("signin");
    if (status.banned) return setGate("banned");
    if (!communityOk) return setGate("consent");
    setGate(null);
    setOpen(true);
    if (action === "place") setShowPlace(true);
    if (action === "tanya") setKind("tanya");
    if (action === "photo") window.setTimeout(() => fileRef.current?.click(), 0);
  }

  function reset() {
    setOpen(false);
    setBody("");
    setKind(null);
    setShowPlace(false);
    setPlace("");
    setDestination("");
    setPhoto(null);
    setError("");
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Foto harus JPG, PNG atau WebP.");
      return;
    }
    try {
      const blob = await compressReceiptPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setError("");
    } catch {
      setError("Foto belum bisa dibaca. Coba foto lain.");
    }
  }

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("body", text);
      form.set("kind", effectiveKind);
      if (destination) form.set("destination", destination);
      if (showPlace && place.trim()) form.set("place", place.trim());
      if (photo) form.set("photo", photo.blob, "foto.jpg");
      const response = await fetch("/api/feeds-post", { method: "POST", body: form });
      const result = (await response.json().catch(() => ({}))) as {
        post?: FeedPostView;
        pending?: boolean;
        error?: string;
      };
      if (!response.ok || !result.post) {
        setError(result.error || "Postingan belum terkirim. Coba lagi.");
        return;
      }
      reset();
      onPosted(result.post, Boolean(result.pending));
      toast.success(
        result.pending
          ? "Terkirim. Postinganmu ditinjau dulu, biasanya kurang dari 1 jam."
          : "Postinganmu sudah tayang.",
      );
    } catch {
      setError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const avatar = name ? (
    <FeedAvatar name={name} />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-[12px] font-bold text-brand-red"
    >
      ·
    </span>
  );

  if (!open) {
    return (
      <section className={shell} aria-label="Buat postingan">
        <div className="flex items-center gap-2">
          {avatar}
          <button
            type="button"
            onClick={() => begin()}
            className="tap flex min-h-10 flex-1 items-center rounded-full bg-secondary px-4 text-left text-[13px] text-muted-foreground"
          >
            Bagikan tips atau tanya traveler…
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          {status.allowPhotos && (
            <button type="button" onClick={() => begin("photo")} className={quick}>
              <ImagePlus className="size-4" aria-hidden="true" /> Foto
            </button>
          )}
          <button type="button" onClick={() => begin("place")} className={quick}>
            <MapPin className="size-4" aria-hidden="true" /> Tempat
          </button>
          <button type="button" onClick={() => begin("tanya")} className={quick}>
            <span aria-hidden="true" className="text-[14px] leading-none">
              ?
            </span>{" "}
            Tanya
          </button>
        </div>
        {gate === "signin" && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary p-3">
            <p className="text-[12px] text-muted-foreground">Masuk untuk memposting di Feeds.</p>
            <CustomerAuth size="compact" />
          </div>
        )}
        {gate === "consent" && (
          <ConsentGate
            purpose="community"
            text="Nama depan dan postinganmu akan tampil ke traveler lain. Aktifkan “Komunitas” untuk memposting."
            onGranted={() => {
              setGate(null);
              setOpen(true);
            }}
          />
        )}
        {gate === "banned" && (
          <p role="alert" className="mt-3 rounded-xl bg-secondary p-3 text-[12px] text-destructive">
            Akunmu tidak dapat memposting di Feeds. Hubungi Bantuan bila ada pertanyaan.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={shell} aria-label="Buat postingan">
      <div className="flex items-center gap-2">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{name || "Kamu"}</p>
          <label className="sr-only" htmlFor="feed-destination">
            Tujuan
          </label>
          <select
            id="feed-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="mt-0.5 max-w-full rounded-md bg-transparent text-[11px] text-muted-foreground outline-none"
          >
            <option value="">Tanpa tujuan</option>
            {sortedDestinations.map((d) => (
              <option key={d.code} value={d.code}>
                {d.flag} {d.nameId}
              </option>
            ))}
          </select>
        </div>
        <div role="radiogroup" aria-label="Jenis postingan" className="flex gap-1">
          {FEED_KINDS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={effectiveKind === value}
              onClick={() => isFeedKind(value) && setKind(value)}
              className={`tap min-h-8 rounded-full px-2.5 text-[11px] font-semibold ${effectiveKind === value ? "bg-foreground text-background" : "bg-secondary"}`}
            >
              {FEED_KIND_LABEL[value]}
            </button>
          ))}
        </div>
      </div>
      <label className="sr-only" htmlFor="feed-body">
        Isi postingan
      </label>
      <textarea
        id="feed-body"
        ref={textRef}
        value={body}
        maxLength={FEED_BODY_MAX}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          effectiveKind === "tanya"
            ? "Tanya apa ke traveler lain?"
            : "Bagikan tips, cerita, atau tanya traveler lain…"
        }
        className="mt-2 min-h-24 w-full resize-none bg-transparent text-[15px] leading-snug outline-none placeholder:text-muted-foreground"
      />
      {showPlace && (
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-secondary px-3">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={place}
            maxLength={FEED_PLACE_MAX}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="Nama tempat, mis. Ichiran Shibuya"
            aria-label="Nama tempat"
            className="min-h-10 flex-1 bg-transparent text-[13px] outline-none"
          />
          <button
            type="button"
            aria-label="Hapus tempat"
            onClick={() => {
              setShowPlace(false);
              setPlace("");
            }}
            className="tap flex size-8 items-center justify-center text-muted-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {photo && (
        <div className="relative mt-2">
          <img
            src={photo.url}
            alt="Foto yang akan diunggah"
            className="max-h-48 w-full rounded-xl object-cover"
          />
          <button
            type="button"
            aria-label="Hapus foto"
            onClick={() => setPhoto(null)}
            className="tap absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className="mt-2 flex items-center gap-1 border-t border-border/70 pt-2">
        {status.allowPhotos && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`tap flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${photo ? "bg-brand-red-soft text-brand-red" : "bg-secondary"}`}
          >
            <ImagePlus className="size-4" aria-hidden="true" /> Foto
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowPlace((v) => !v)}
          aria-pressed={showPlace}
          className={`tap flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${showPlace ? "bg-brand-red-soft text-brand-red" : "bg-secondary"}`}
        >
          <MapPin className="size-4" aria-hidden="true" /> Tempat
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground" aria-live="polite">
          {body.length}/{FEED_BODY_MAX}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="tap min-h-9 px-3 text-[13px] font-semibold text-muted-foreground"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || busy}
          className="tap min-h-10 rounded-full bg-brand-red px-4 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Mengirim…" : "Kirim"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Lokasi tepat dan tanggal berangkatmu tidak ditampilkan.
        {status.reviewsNewPosts ? " Postingan pertamamu ditinjau tim dulu." : ""}
      </p>
    </section>
  );
}
