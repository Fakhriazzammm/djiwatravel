import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CustomerAuth } from "@/components/customer-auth";
import { startMyChatThread } from "@/lib/shopper-chat.fn";
import { ShopperSheet } from "./shopper-ui";

const field = "min-h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[13px]";
const authMessage = (e: unknown) => (e instanceof Error ? e.message : "");
const needsLogin = (e: unknown) => /autentikasi|login|masuk/i.test(authMessage(e));

/**
 * A fresh conversation: what the customer is after, and optionally a link.
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
    setError("");
    setSignIn(false);
    key.current = crypto.randomUUID();
  }, [open, initialText]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await startMyChatThread({ data: { text, url, clientKey: key.current } });
      key.current = crypto.randomUUID();
      setText("");
      setUrl("");
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
