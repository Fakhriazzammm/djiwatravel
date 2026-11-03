import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Share2, ShieldCheck, Trash2, X } from "lucide-react";
import { FixedLayer } from "@/components/motion-primitives";
import { createEsimShareLink, getEsimShareState, revokeEsimShareLink } from "@/lib/esim-share.fn";
import { shareMessage, shareUrl, type OwnerShareState } from "@/lib/esim-share";

function formatMoment(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Owner-facing share sheet.
 *
 * The QR never appears here: the owner hands over a capability link, and the recipient claims it
 * once on their own phone. That keeps a forwarded link or a chat preview from exposing the eSIM.
 */
export function EsimShareSheet({
  orderId,
  packageName,
  open,
  onClose,
}: {
  orderId: string;
  packageName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<OwnerShareState | null>(null);
  const [busy, setBusy] = useState<"load" | "create" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy("load");
    setError(null);
    setMessage("");
    void getEsimShareState({ data: { orderId } })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setState(null);
        setError(reason instanceof Error ? reason.message : "Status berbagi tidak bisa dimuat.");
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const link = state?.link ?? null;
  const url = link ? shareUrl(origin, link.token) : null;
  const shareText = url ? shareMessage(packageName, url) : "";

  async function create() {
    setBusy("create");
    setError(null);
    setMessage("");
    try {
      const created = await createEsimShareLink({ data: { orderId } });
      setState((current) =>
        current
          ? {
              ...current,
              link: {
                token: created.token,
                createdAt: created.createdAt,
                claimed: false,
                claimedAt: null,
                viewCount: 0,
                lastOpenedAt: null,
              },
            }
          : current,
      );
      setMessage("Link dibuat. Kirim ke orang yang akan memakai eSIM ini.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Link tidak bisa dibuat.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    const confirmed = window.confirm(
      link?.claimed
        ? "Link ini sudah dibuka penerima. Mencabutnya akan menghentikan akses mereka. Lanjutkan?"
        : "Cabut link berbagi ini? Penerima tidak bisa membukanya lagi.",
    );
    if (!confirmed) return;
    setBusy("revoke");
    setError(null);
    setMessage("");
    try {
      await revokeEsimShareLink({ data: { orderId } });
      setState((current) => (current ? { ...current, link: null } : current));
      setMessage("Link dicabut. Kamu bisa membuat link baru kapan saja.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Link tidak bisa dicabut.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link disalin.");
    } catch {
      setMessage("Tidak bisa menyalin otomatis. Pilih link lalu salin manual.");
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: `eSIM ${packageName}`, text: shareText });
    } catch (reason) {
      if (reason instanceof Error && reason.name !== "AbortError")
        setMessage("Perangkat belum bisa membagikan. Salin linknya saja.");
    }
  }

  const statusLine = link
    ? link.claimed
      ? `Sudah dibuka penerima${link.claimedAt ? ` pada ${formatMoment(link.claimedAt)}` : ""} · ${link.viewCount}× dibuka`
      : "Belum dibuka. Link masih bisa dipakai satu kali."
    : null;

  return (
    <FixedLayer>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="esim-share-title"
      >
        <button
          type="button"
          aria-label="Tutup berbagi eSIM"
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Share2 className="size-4 text-brand-red" aria-hidden="true" />
              <p id="esim-share-title" className="font-semibold">
                Bagikan eSIM
              </p>
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
            <p className="text-[13px] leading-5 text-muted-foreground">
              Kirim link ke orang yang akan memakai eSIM ini. Mereka membukanya di HP masing-masing,
              menekan <b>Buka eSIM</b> sekali, lalu memasangnya. Kamu tidak perlu mengirim foto QR.
            </p>

            {busy === "load" ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Memeriksa link…
              </p>
            ) : error ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-brand-red-soft p-3 text-sm text-brand-red"
              >
                {error}
              </p>
            ) : !state ? (
              <p className="mt-4 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                Status berbagi belum tersedia.
              </p>
            ) : !state.enabled ? (
              <p className="mt-4 rounded-xl bg-[#fffaf0] p-3 text-sm text-muted-foreground">
                Admin menonaktifkan berbagi eSIM untuk sementara. Link yang sudah ada juga tidak
                bisa dibuka sampai fitur ini diaktifkan lagi.
              </p>
            ) : !state.eligible ? (
              <p className="mt-4 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                Link bisa dibuat saat eSIM sudah siap dipasang atau aktif. eSIM yang gagal, batal,
                refund, atau sudah berakhir tidak bisa dibagikan.
              </p>
            ) : link && url ? (
              <div className="mt-4 rounded-2xl bg-secondary/60 p-3">
                <label
                  htmlFor="esim-share-url"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Link berbagi
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="esim-share-url"
                    readOnly
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => void copy()}
                    aria-label="Salin link"
                    className="tap grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground"
                  >
                    {message === "Link disalin." ? (
                      <Check className="size-4 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-sm font-semibold text-white"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                  </a>
                  {canNativeShare ? (
                    <button
                      type="button"
                      onClick={() => void nativeShare()}
                      className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                    >
                      <Share2 className="size-4" aria-hidden="true" /> Bagikan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void copy()}
                      className="tap flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                    >
                      <Copy className="size-4" aria-hidden="true" /> Salin
                    </button>
                  )}
                </div>

                <p
                  className="mt-2 text-[12px] text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  {statusLine}
                </p>
                {link.lastOpenedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    Terakhir dibuka {formatMoment(link.lastOpenedAt)}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void revoke()}
                  disabled={busy === "revoke"}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-brand-red disabled:opacity-50"
                >
                  {busy === "revoke" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  Cabut link
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy === "create"}
                className="tap mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-[14px] font-bold text-white disabled:opacity-50"
              >
                {busy === "create" ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="size-5" aria-hidden="true" />
                )}
                Buat link berbagi
              </button>
            )}

            {message && !error && (
              <p
                role="status"
                aria-live="polite"
                className="mt-3 text-center text-xs text-muted-foreground"
              >
                {message}
              </p>
            )}

            <p className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Link mengikuti masa aktif paket. Setelah eSIM berakhir, dicabut, atau dibuka di
              perangkat lain, link tidak menampilkan QR lagi.
            </p>
          </div>
        </div>
      </div>
    </FixedLayer>
  );
}
