import { useEffect, useMemo, useState } from "react";
import { Headphones, ShieldCheck, X } from "lucide-react";
import { FixedLayer } from "@/components/motion-primitives";
import {
  recordSupportSend,
  shouldSuppressSupportSend,
  supportDedupeKey,
  supportMessage,
  supportUrl,
  type SupportContext,
  type SupportTopic,
} from "@/lib/travel-support";

/**
 * Contextual support sheet.
 *
 * Nothing is sent before the customer sees the exact payload: the preview below IS the
 * message, and every identifier in it is already masked.
 */
export function TravelSupportDialog({
  open,
  onClose,
  topics,
  contextFor,
  supportBaseUrl,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  topics: SupportTopic[];
  contextFor: (topic: SupportTopic) => SupportContext;
  supportBaseUrl: string;
  onSent?: ((topic: SupportTopic) => void) | undefined;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  const activeTopic = useMemo(() => {
    const found = topics.find((topic) => topic.id === selectedId);
    return found ?? topics[0] ?? null;
  }, [topics, selectedId]);

  const context = useMemo(
    () => (activeTopic ? contextFor(activeTopic) : null),
    [activeTopic, contextFor],
  );

  useEffect(() => {
    if (!open || !context) {
      setSuppressed(false);
      return;
    }
    setSuppressed(shouldSuppressSupportSend(supportDedupeKey(context)));
  }, [open, context]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !context || !activeTopic) return null;

  const message = supportMessage(context);

  function send() {
    if (!context || !activeTopic) return;
    window.open(supportUrl(context, supportBaseUrl), "_blank", "noreferrer");
    recordSupportSend(supportDedupeKey(context));
    setSuppressed(true);
    onSent?.(activeTopic);
  }

  return (
    <FixedLayer>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Bantuan pesanan"
      >
        <button
          type="button"
          aria-label="Tutup bantuan"
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Headphones className="size-4 text-brand-red" aria-hidden="true" />
              <p className="font-semibold">Bantuan pesanan ini</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="tap flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Apa yang terjadi?
            </p>
            <div className="mt-2 space-y-2">
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setSelectedId(topic.id)}
                  aria-pressed={topic.id === activeTopic.id}
                  className={`tap flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium ${
                    topic.id === activeTopic.id
                      ? "bg-brand-red-soft text-brand-red"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {topic.label}
                </button>
              ))}
            </div>

            <p className="mt-5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Data yang akan dibagikan
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-secondary p-3 text-[12px] leading-relaxed text-muted-foreground">
              {message}
            </pre>
            <p className="mt-2 flex items-start gap-2 text-[12px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
              Nomor pesanan dan eSIM sudah disamarkan. Kode QR dan kode aktivasi tidak pernah ikut
              terkirim.
            </p>

            {suppressed && (
              <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-[12px] text-muted-foreground">
                Kamu baru saja mengirim topik ini. Kirim ulang hanya kalau percakapan sebelumnya
                tidak terbuka.
              </p>
            )}
          </div>

          <div className="border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={send}
              className="tap h-12 w-full rounded-2xl bg-brand-red text-[16px] font-semibold text-primary-foreground"
            >
              {suppressed ? "Kirim ulang ke support" : "Kirim ke support"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="tap mt-2 h-11 w-full rounded-2xl bg-secondary text-[14px] font-semibold"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </FixedLayer>
  );
}
