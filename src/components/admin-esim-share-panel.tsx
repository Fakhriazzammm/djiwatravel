import { useState } from "react";
import { Loader2, Share2, ShieldOff } from "lucide-react";
import { StatusPill } from "@/components/admin-shell";
import { getAdminEsimShareState, revokeAdminEsimShare } from "@/lib/admin-esim-share.fn";
import { formatAdminDateTime } from "@/lib/admin-display";
import type { AdminEsimShareState } from "@/lib/esim-share";

/**
 * Admin monitoring for one order's public share link. The admin can see whether the link was
 * claimed and revoke it, but never sees the bearer token or the eSIM QR/activation secret.
 */
export function AdminEsimSharePanel({
  orderId,
  initial,
}: {
  orderId: string;
  initial: AdminEsimShareState | null;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setState(await getAdminEsimShareState({ data: { orderId } }));
  };

  const revoke = async () => {
    if (
      !window.confirm(
        "Cabut link berbagi eSIM untuk order ini? Penerima langsung kehilangan akses ke QR.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await revokeAdminEsimShare({ data: { orderId } });
      await refresh();
      setNotice(
        result.revoked
          ? "Link dicabut dan tindakan dicatat di audit log."
          : "Tidak ada link aktif untuk dicabut.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Link tidak bisa dicabut.");
    } finally {
      setBusy(false);
    }
  };

  const link = state?.link ?? null;
  const tone = !state?.enabled ? "warn" : link?.claimed ? "good" : "neutral";
  const label = !state
    ? "Tidak tersedia"
    : !state.enabled
      ? "Nonaktif"
      : link?.claimed
        ? "Sudah dibuka"
        : link
          ? "Aktif"
          : "Belum ada link";

  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-surface p-5"
      data-testid="admin-esim-share-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Share2 className="size-4 text-brand-red" aria-hidden="true" /> Berbagi eSIM
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Link publik yang dibuat pelanggan. Token, QR, dan kode aktivasi tidak pernah tampil di
            panel admin.
          </p>
        </div>
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>

      {!state ? (
        <p className="mt-4 text-sm text-muted-foreground">Status berbagi tidak bisa dibaca.</p>
      ) : (
        <>
          {!state.enabled && (
            <p className="mt-3 rounded-xl bg-[#fffaf0] p-3 text-xs leading-5 text-muted-foreground">
              Fitur berbagi sedang dinonaktifkan di Settings. Semua link lama ikut tertutup.
            </p>
          )}
          {!state.eligible && !link && (
            <p className="mt-3 text-sm text-muted-foreground">
              Order ini belum punya eSIM yang siap dibagikan, atau masa aktifnya sudah berakhir.
            </p>
          )}
          {link ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Dibuat</dt>
                <dd>{formatAdminDateTime(link.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status klaim</dt>
                <dd className="font-medium">
                  {link.claimed
                    ? `Dibuka ${link.claimedAt ? formatAdminDateTime(link.claimedAt) : ""}`
                    : "Belum dibuka"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Jumlah buka</dt>
                <dd>{link.viewCount}×</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Terakhir dibuka</dt>
                <dd>
                  {link.lastOpenedAt ? formatAdminDateTime(link.lastOpenedAt) : "Belum pernah"}
                </dd>
              </div>
            </dl>
          ) : null}
          {link && (
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-red/40 px-4 text-sm font-semibold text-brand-red disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="size-4" aria-hidden="true" />
              )}
              Cabut link berbagi
            </button>
          )}
        </>
      )}

      {notice && (
        <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-xs">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-brand-red-soft p-3 text-xs text-brand-red">
          {error}
        </p>
      )}
    </section>
  );
}
