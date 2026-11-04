import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { AdminStatStrip, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { runAdminGoogleAction } from "@/lib/google-admin.fn";
import type { GoogleAdminOverview } from "@/lib/google-admin.server";

type AdminGoogleAction =
  | { action: "retry-failed"; reason: string }
  | { action: "disconnect"; subject: string; reason: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Admin control for travelers' Google Drive and Sheets: how many receipts moved to travelers'
 * Drives, what is stuck (with redacted errors), retry for everything failed, and disconnecting one
 * traveler on request. Tokens are never shown.
 */
export function AdminGooglePanel({ overview }: { overview: GoogleAdminOverview }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stuck =
    overview.drive.failed +
    overview.drive.revoked +
    overview.sheets.failed +
    overview.sheets.revoked;

  const run = async (key: string, payload: AdminGoogleAction) => {
    if (reason.trim().length < 4) {
      setMessage("Isi alasan minimal 4 karakter untuk audit log.");
      return;
    }
    setBusy(key);
    setMessage(null);
    try {
      const result = await runAdminGoogleAction({ data: payload });
      setMessage(
        payload.action === "retry-failed"
          ? `${result.retried} item berhasil diproses ulang.`
          : "Koneksi Google customer diputus.",
      );
      await router.invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aksi gagal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminSurface className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading
          title="Google Drive & Sheets customer"
          detail="Foto struk disimpan di Drive milik customer dan budget diekspor ke Sheets mereka. Token tidak pernah ditampilkan."
        />
        <StatusPill tone={!overview.configured ? "warn" : stuck ? "warn" : "good"}>
          {!overview.configured
            ? "Belum dikonfigurasi"
            : stuck
              ? `${stuck} perlu perhatian`
              : "Sehat"}
        </StatusPill>
      </div>
      <AdminStatStrip
        columns={4}
        items={[
          { label: "Terhubung", value: String(overview.connectedUsers) },
          { label: "Drive aktif", value: String(overview.driveUsers) },
          { label: "Struk di Drive", value: String(overview.drive.uploaded), tone: "good" },
          { label: "Menunggu", value: String(overview.drive.pending + overview.sheets.pending) },
          {
            label: "Gagal",
            value: String(overview.drive.failed + overview.sheets.failed),
            ...(stuck ? { tone: "danger" as const } : {}),
          },
          { label: "Dicabut", value: String(overview.drive.revoked + overview.sheets.revoked) },
          { label: "Ekspor Sheets", value: String(overview.sheets.synced), tone: "good" },
          { label: "Diambil dari Sheets", value: String(overview.sheetPulledRows) },
          {
            label: "Bentrok Sheets",
            value: String(overview.sheetConflicts),
            ...(overview.sheetConflicts > 0 ? { tone: "warn" as const } : {}),
          },
          {
            label: "Masih di Postgres",
            value: `${overview.photosInPostgres} · ${mb(overview.bytesInPostgres)}`,
          },
        ]}
      />
      <label className="block text-sm font-semibold">
        Alasan aksi (audit log)
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-normal"
          placeholder="Mis. customer minta putus koneksi"
        />
      </label>
      <button
        type="button"
        disabled={busy !== null || stuck === 0}
        onClick={() => void run("retry", { action: "retry-failed", reason })}
        className="min-h-10 w-full rounded-xl bg-brand-red text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy === "retry" ? "Memproses…" : "Coba ulang semua yang gagal"}
      </button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {overview.issues.length > 0 && (
        <div className="divide-y divide-border rounded-xl border border-border">
          {overview.issues.map((issue) => (
            <div
              key={`${issue.kind}-${issue.id}`}
              className="flex flex-wrap items-center gap-2 p-2.5 text-xs"
            >
              <StatusPill tone="warn">
                {issue.kind === "drive" ? "Drive" : "Sheets"} · {issue.status}
              </StatusPill>
              <span className="font-mono text-muted-foreground">{issue.subjectLabel}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {issue.error ?? "Menunggu akses Google"}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run(`d-${issue.subject}`, {
                    action: "disconnect",
                    subject: issue.subject,
                    reason,
                  })
                }
                className="min-h-9 rounded-lg border border-border px-2.5 font-semibold disabled:opacity-50"
              >
                Putuskan
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminSurface>
  );
}
