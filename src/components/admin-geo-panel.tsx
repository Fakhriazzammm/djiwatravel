import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveGeoConfig } from "@/lib/geo-config.fn";
import { parseGeoConfig, type GeoConfig } from "@/lib/geo-config";

/** Admin control for AI discoverability (GEO). Edits the record that /robots.txt and /llms.txt read. */
export function AdminGeoPanel({
  initial,
  version: initialVersion,
}: {
  initial: GeoConfig;
  version: number;
}) {
  const [draft, setDraft] = useState<GeoConfig>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const result = await saveGeoConfig({
        data: { config: parseGeoConfig(draft), reason, expectedVersion: version },
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
    <div className="space-y-2" data-testid="admin-geo-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Visibilitas AI (GEO)"
          detail="Mengatur akses crawler AI di robots.txt dan berkas teks publik. Aturan robots diperbarui dalam 5 menit."
        />
        <StatusPill tone={draft.aiSearchEnabled ? "good" : "warn"}>
          {draft.aiSearchEnabled ? "AI search terbuka" : "AI search ditutup"}
        </StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.aiSearchEnabled}
            onChange={(e) => setDraft({ ...draft, aiSearchEnabled: e.target.checked })}
            className="size-5 accent-primary"
          />
          Izinkan pencarian ChatGPT dan Claude, serta tampilkan sumber harga publik
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.aiTrainingEnabled}
            onChange={(e) => setDraft({ ...draft, aiTrainingEnabled: e.target.checked })}
            className="size-5 accent-primary"
          />
          Izinkan pelatihan model dan akses sumber web Gemini (Google-Extended)
        </label>
        <p className="text-xs text-muted-foreground">
          Google memakai satu izin untuk pelatihan model dan penggunaan halaman sebagai sumber di
          aplikasi Gemini. Sumber teks publik menyajikan harga yang tersedia.{" "}
          <a href="/llms-full.txt" className="font-semibold underline">
            Periksa sumber harga publik
          </a>
          .
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan perubahan (min. 4 karakter)"
          className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={status.kind === "saving" || reason.trim().length < 4}
          className="min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {status.kind === "saving" ? "Menyimpan…" : "Simpan"}
        </button>
        {status.kind === "ok" ? <p className="text-xs text-success">Tersimpan.</p> : null}
        {status.kind === "error" ? (
          <p className="text-xs text-destructive">{status.message}</p>
        ) : null}
      </AdminSurface>
    </div>
  );
}
