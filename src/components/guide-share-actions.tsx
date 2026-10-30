import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

export function GuideShareActions({ title, url }: { title: string; url: string }) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const shareText = `${title} — Djiwa Travel ${url}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Tautan panduan disalin.");
    } catch {
      setMessage("Tidak dapat menyalin otomatis. Salin tautan dari bilah alamat.");
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setMessage("Panduan belum dapat dibagikan. Coba salin tautannya.");
      }
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-surface p-4" aria-label="Bagikan panduan">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Share2 className="size-4 text-brand-red" aria-hidden="true" />
        Bagikan panduan ini
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canNativeShare && (
          <button type="button" onClick={() => void nativeShare()} className={actionClass}>
            <Share2 className="size-4" aria-hidden="true" /> Bagikan panduan
          </button>
        )}
        <a href={whatsappUrl} target="_blank" rel="noreferrer" className={actionClass}>
          WhatsApp
        </a>
        <a href={facebookUrl} target="_blank" rel="noreferrer" className={actionClass}>
          Facebook
        </a>
        <a href={xUrl} target="_blank" rel="noreferrer" className={actionClass}>
          X
        </a>
        <button type="button" onClick={() => void copyLink()} className={actionClass}>
          {message === "Tautan panduan disalin." ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {message === "Tautan panduan disalin." ? "Tautan disalin" : "Salin tautan"}
        </button>
      </div>
      <p className="mt-2 min-h-5 text-xs text-muted-foreground" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

const actionClass =
  "inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
