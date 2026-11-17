import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import { startMyChatThread } from "@/lib/shopper-chat.fn";
import { ShopperSheet } from "./shopper-ui";

const field = "min-h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[13px]";
const authMessage = (e: unknown) => (e instanceof Error ? e.message : "");
const needsLogin = (e: unknown) => /autentikasi|login|masuk/i.test(authMessage(e));
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * A fresh conversation: what the customer is after, an optional link, and an optional photo.
 * Lives outside shopper-chat.tsx so the catalogue page only loads this sheet, not the whole inbox.
 */
export function NewMessageSheet({
  open,
  onClose,
  initialText = "",
}: {
  open: boolean;
  onClose: () => void;
  /** Seeds the message, e.g. a brand that has no catalogue and is bought on request. */
  initialText?: string;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const key = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  // Each open starts clean: the seed for request-only brands, otherwise an empty message.
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setUrl("");
    setPhoto(null);
    setError("");
    setSignIn(false);
    key.current = crypto.randomUUID();
  }, [open, initialText]);
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const blob = URL.createObjectURL(photo);
    setPreview(blob);
    return () => URL.revokeObjectURL(blob);
  }, [photo]);
  function pickPhoto(file: File | null) {
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      setError("Pilih JPG, PNG atau WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Foto maksimal 5 MB.");
      return;
    }
    setError("");
    setPhoto(file);
  }
  /** The photo goes in as its own message on the thread we just opened. */
  async function sendPhoto(threadId: string) {
    const form = new FormData();
    form.set("threadId", threadId);
    form.set("body", "");
    form.set("clientKey", crypto.randomUUID());
    form.set("photo", await compressReceiptPhoto(photo!), "produk.jpg");
    const response = await fetch("/api/shopper-chat", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Foto belum terkirim.");
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await startMyChatThread({ data: { text, url, clientKey: key.current } });
      if (photo) {
        // The request is already with the team; a failed photo must not hide that.
        try {
          await sendPhoto(r.threadId);
        } catch (e) {
          toast.error(authMessage(e) || "Foto belum terkirim. Coba kirim lagi di chat.");
        }
      }
      key.current = crypto.randomUUID();
      setText("");
      setUrl("");
      setPhoto(null);
      onClose();
      await navigate({ to: "/titip-belanja/pesan/$id", params: { id: r.threadId } });
    } catch (e) {
      // A guest can write the request; signing in is only needed to keep the thread.
      if (needsLogin(e)) setSignIn(true);
      else setError(authMessage(e) || "Pesan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ShopperSheet
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      title="Tanya tim Djiwa"
      description="Ceritakan barang yang kamu cari. Tim kami mencarikan lalu mengirim penawaran."
    >
      <div className="space-y-3 py-3">
        <label className="block text-[12px]">
          Barang yang dicari
          <textarea
            className={`${field} mt-1 py-2`}
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Contoh: poster くら寿司 A3, kondisi bagus, 1 barang"
          />
        </label>
        <label className="block text-[12px]">
          Link produk (opsional)
          <input
            className={`${field} mt-1`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <div className="text-[12px]">
          Foto barang (opsional)
          <label className="mt-1 flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary p-3 text-center">
            <ImagePlus className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {photo ? photo.name : "Pilih foto · JPG, PNG, WebP maks 5 MB"}
            </span>
            <input
              type="file"
              accept={PHOTO_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {preview && (
            <span className="mt-2 flex items-start gap-2">
              <img
                src={preview}
                alt="Foto barang yang dipilih"
                className="max-h-32 rounded-xl object-contain"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="Hapus foto"
                className="tap grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Foto diperkecil dan metadata lokasi dihapus sebelum dikirim.
          </span>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-brand-red">
            {error}
          </p>
        )}
        {signIn ? (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              Masuk dulu supaya tim bisa membalas dan mengirim penawaran.
            </p>
            <CustomerAuth size="block" />
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || (text.trim().length < 3 && url.trim().length < 8)}
            onClick={() => void submit()}
            className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
          >
            {busy ? "Mengirim…" : "Kirim ke tim"}
          </button>
        )}
      </div>
    </ShopperSheet>
  );
}
