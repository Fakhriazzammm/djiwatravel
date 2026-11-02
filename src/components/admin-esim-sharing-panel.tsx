import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminEsimSharing } from "@/lib/admin-esim-share.fn";
import { parseEsimSharingConfig, type EsimSharingConfig } from "@/lib/esim-share";

/**
 * Admin kill switch for public eSIM share links. It edits the same `esimSharing` record the owner
 * sheet reads, so disabling it immediately stops new links and makes existing links unavailable.
 */
export function AdminEsimSharingPanel({
  initial,
  version: initialVersion,
}: {
  initial: EsimSharingConfig;
  version: number;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseEsimSharingConfig({ enabled });
      const result = await saveAdminEsimSharing({
        data: { config, reason, expectedVersion: version },
      });
      if (!result.ok) {
        setVersion(result.version);
        setStatus({
          kind: "error",
          message: "Pengaturan sudah diubah admin lain. Muat ulang halaman, lalu coba lagi.",
        });
        return;
      }
      setVersion(result.version);
      setStatus({ kind: "ok" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan. Tidak ada yang berubah.",
      });
    }
  };

  return (
    <div className="space-y-2" data-testid="admin-esim-sharing-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Berbagi eSIM"
          detail="Izinkan pelanggan mengirim eSIM yang sudah siap ke orang lain lewat link sekali-buka."
        />
        <StatusPill tone={enabled ? "good" : "warn"}>{enabled ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 accent-primary"
          />
          Aktifkan link berbagi eSIM
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          Penerima membuka link di HP-nya dan menekan <b>Buka eSIM</b> satu kali. Setelah itu link
          terikat ke browser tersebut. Link mengikuti masa aktif paket dan berhenti bekerja saat
          eSIM berakhir, refund, batal, atau gagal. Menonaktifkan sakelar ini juga menutup semua
          link yang sudah beredar.
        </p>

        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: menutup berbagi selama audit"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={() => void save()}
          disabled={status.kind === "saving" || reason.trim().length < 4}
          className="min-h-11 w-full rounded-xl bg-brand-red px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {status.kind === "saving" ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
        {status.kind === "ok" && (
          <p role="status" className="text-xs font-medium text-success">
            Pengaturan tersimpan dan dicatat di audit log.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="text-xs font-medium text-brand-red">
            {status.message}
          </p>
        )}
      </AdminSurface>
    </div>
  );
}
