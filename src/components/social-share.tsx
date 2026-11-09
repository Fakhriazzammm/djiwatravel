import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { SiFacebook, SiInstagram, SiTelegram, SiWhatsapp, SiX } from "react-icons/si";
import { toast } from "sonner";

function downloadFile(file: File) {
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/**
 * One share card for every share sheet: Instagram Story (a generated image through the system
 * share sheet, or a download), WhatsApp, Telegram, X, Facebook, save image, and copy link.
 */
export function SocialShare({
  url,
  text,
  makeImage,
  label = "Bagikan",
}: {
  url: string;
  text: string;
  makeImage: () => Promise<File>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function shareImage(save: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const file = await makeImage();
      if (!save && navigator.canShare?.({ files: [file] })) {
        try {
          // The system sheet lists Instagram Stories, WhatsApp Status, and other installed apps.
          await navigator.share({ files: [file], text, url });
          return;
        } catch (cause) {
          if ((cause as Error).name === "AbortError") return;
        }
      }
      downloadFile(file);
      toast.success(save ? "Gambar disimpan" : "Gambar disimpan. Unggah ke Instagram Story.");
    } catch {
      toast.error("Gambar belum dapat dibuat. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Tautan disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Tautan belum dapat disalin.");
    }
  }

  const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const enc = encodeURIComponent;
  const tile = "grid size-9 place-items-center rounded-full text-white";
  const item =
    "tap flex flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-medium text-muted-foreground disabled:opacity-60";

  return (
    <section className="rounded-2xl bg-surface p-3 ring-1 ring-border/60" aria-label={label}>
      <button
        type="button"
        disabled={busy}
        onClick={() => shareImage(false)}
        className="tap flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(45deg,#f9a03a,#e1306c_55%,#7a3fd0)] text-[14px] font-semibold text-white disabled:opacity-60"
      >
        <SiInstagram className="size-4" />
        {busy ? "Membuat gambar…" : "Bagikan ke Instagram Story"}
      </button>
      <div className="mt-2.5 grid grid-cols-6 gap-1">
        <button
          type="button"
          className={item}
          onClick={() => open(`https://wa.me/?text=${enc(`${text}\n${url}`)}`)}
        >
          <span className={`${tile} bg-[#25d366]`}>
            <SiWhatsapp className="size-[18px]" />
          </span>
          WhatsApp
        </button>
        <button
          type="button"
          className={item}
          onClick={() => open(`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`)}
        >
          <span className={`${tile} bg-[#27a7e7]`}>
            <SiTelegram className="size-[18px]" />
          </span>
          Telegram
        </button>
        <button
          type="button"
          className={item}
          onClick={() => open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`)}
        >
          <span className={`${tile} bg-black`}>
            <SiX className="size-4" />
          </span>
          X
        </button>
        <button
          type="button"
          className={item}
          onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`)}
        >
          <span className={`${tile} bg-[#1877f2]`}>
            <SiFacebook className="size-[18px]" />
          </span>
          Facebook
        </button>
        <button type="button" className={item} disabled={busy} onClick={() => shareImage(true)}>
          <span className={`${tile} bg-secondary text-foreground`}>
            <Download className="size-4" />
          </span>
          Gambar
        </button>
        <button type="button" className={item} onClick={copy}>
          <span className={`${tile} bg-secondary text-foreground`}>
            {copied ? <Check className="size-4 text-[#1fa855]" /> : <Copy className="size-4" />}
          </span>
          Salin
        </button>
      </div>
    </section>
  );
}
