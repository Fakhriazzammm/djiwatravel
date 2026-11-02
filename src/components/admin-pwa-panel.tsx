import { useState } from "react";
import { AdminStatStrip, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { savePwaConfig, sendPwaNotification } from "@/lib/pwa.fn";
import { parsePwaConfig, type PwaConfig, type PwaStats } from "@/lib/pwa-config";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const inputClass = "min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm";

/** Admin control for the installable app: install prompt, offline cache kill switch, push. */
export function AdminPwaPanel({
  initial,
  version: initialVersion,
  stats,
}: {
  initial: PwaConfig;
  version: number;
  stats: PwaStats | null;
}) {
  const [draft, setDraft] = useState<PwaConfig>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [push, setPush] = useState({
    subject: "",
    title: "",
    body: "",
    href: "/notifications",
    reason: "",
  });
  const [pushStatus, setPushStatus] = useState<Status>({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const result = await savePwaConfig({
        data: { config: parsePwaConfig(draft), reason, expectedVersion: version },
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
      setStatus({
        kind: "ok",
        message: "Tersimpan. Berlaku di perangkat customer saat app dibuka lagi.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan. Tidak ada yang berubah.",
      });
    }
  };

  const send = async () => {
    setPushStatus({ kind: "saving" });
    try {
      const result = await sendPwaNotification({ data: push });
      setPushStatus({
        kind: "ok",
        message: `Notifikasi dibuat. Push terkirim ke ${result.pushSent} perangkat.`,
      });
    } catch (error) {
      setPushStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Gagal mengirim.",
      });
    }
  };

  const c = stats?.counts;
  return (
    <div className="space-y-2" data-testid="admin-pwa-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Aplikasi (PWA)"
          detail="Install ke layar utama, cache offline, dan push notification."
        />
        <StatusPill tone={stats?.pushConfigured ? "good" : "warn"}>
          {stats?.pushConfigured ? "Push siap" : "Push: VAPID belum diset"}
        </StatusPill>
      </div>

      {stats ? (
        <AdminSurface className="p-2.5">
          <AdminStatStrip
            columns={3}
            items={[
              {
                label: `Prompt tampil (${stats.days}h)`,
                value: String(c?.install_prompt_shown ?? 0),
              },
              {
                label: "Install",
                value: String(Math.max(c?.install_accepted ?? 0, c?.app_installed ?? 0)),
                tone: "good",
              },
              { label: "Ditutup", value: String(c?.install_dismissed ?? 0) },
              { label: "Panduan iOS", value: String(c?.ios_guide_opened ?? 0) },
              { label: "Update diterapkan", value: String(c?.sw_update_applied ?? 0) },
              { label: "Halaman offline", value: String(c?.offline_page_shown ?? 0) },
              { label: "Perangkat push aktif", value: String(stats.activePushSubscriptions) },
              { label: "Push terkirim", value: String(stats.pushSent), tone: "good" },
              {
                label: "Push gagal",
                value: String(stats.pushFailed),
                tone: stats.pushFailed > 0 ? "warn" : "neutral",
              },
            ]}
          />
        </AdminSurface>
      ) : (
        <AdminSurface className="p-3 text-xs text-muted-foreground">
          Statistik belum tersedia (migrasi 032 belum diterapkan atau database tidak terjangkau).
        </AdminSurface>
      )}

      <AdminSurface className="space-y-3 p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.installPromptEnabled}
            onChange={(e) => setDraft({ ...draft, installPromptEnabled: e.target.checked })}
            className="size-5 accent-primary"
          />
          Tampilkan ajakan "Pasang aplikasi" ke customer
        </label>
        <input
          value={draft.promptTitle}
          maxLength={60}
          onChange={(e) => setDraft({ ...draft, promptTitle: e.target.value })}
          placeholder="Judul ajakan"
          aria-label="Judul ajakan install"
          className={inputClass}
        />
        <input
          value={draft.promptBody}
          maxLength={160}
          onChange={(e) => setDraft({ ...draft, promptBody: e.target.value })}
          placeholder="Teks ajakan"
          aria-label="Teks ajakan install"
          className={inputClass}
        />
        <label className="flex items-center gap-3 text-sm font-semibold">
          Tampil lagi setelah ditutup
          <input
            type="number"
            min={1}
            max={90}
            value={draft.snoozeDays}
            onChange={(e) => setDraft({ ...draft, snoozeDays: Number(e.target.value) })}
            className="min-h-11 w-20 rounded-xl border border-border bg-surface px-3 text-sm"
          />
          hari
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.offlineCacheEnabled}
            onChange={(e) => setDraft({ ...draft, offlineCacheEnabled: e.target.checked })}
            className="size-5 accent-primary"
          />
          Cache offline aktif (matikan = semua perangkat menghapus cache dan berhenti menyimpan)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.pushEnabled}
            onChange={(e) => setDraft({ ...draft, pushEnabled: e.target.checked })}
            className="size-5 accent-primary"
          />
          Push notification aktif
        </label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan perubahan (min. 4 karakter)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={save}
          disabled={status.kind === "saving" || reason.trim().length < 4}
          className="min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {status.kind === "saving" ? "Menyimpan…" : "Simpan"}
        </button>
        {status.kind === "ok" ? <p className="text-xs text-success">{status.message}</p> : null}
        {status.kind === "error" ? (
          <p className="text-xs text-destructive">{status.message}</p>
        ) : null}
      </AdminSurface>

      <AdminSurface className="space-y-3 p-3">
        <p className="text-sm font-semibold">Kirim notifikasi ke satu customer</p>
        <p className="text-xs text-muted-foreground">
          Tercatat di audit log dan muncul di Notifikasi customer. Bukan broadcast: satu penerima
          per kiriman.
        </p>
        <input
          value={push.subject}
          onChange={(e) => setPush({ ...push, subject: e.target.value })}
          placeholder="ID akun customer (customer_auth_subject)"
          className={inputClass}
        />
        <input
          value={push.title}
          maxLength={80}
          onChange={(e) => setPush({ ...push, title: e.target.value })}
          placeholder="Judul"
          className={inputClass}
        />
        <input
          value={push.body}
          maxLength={200}
          onChange={(e) => setPush({ ...push, body: e.target.value })}
          placeholder="Isi pesan"
          className={inputClass}
        />
        <input
          value={push.href}
          onChange={(e) => setPush({ ...push, href: e.target.value })}
          placeholder="Tujuan, mis. /my-esim"
          className={inputClass}
        />
        <input
          value={push.reason}
          onChange={(e) => setPush({ ...push, reason: e.target.value })}
          placeholder="Alasan (min. 4 karakter)"
          className={inputClass}
        />
        <button
          type="button"
          onClick={send}
          disabled={
            pushStatus.kind === "saving" ||
            !push.subject.trim() ||
            push.title.trim().length < 2 ||
            push.body.trim().length < 2 ||
            push.reason.trim().length < 4
          }
          className="min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pushStatus.kind === "saving" ? "Mengirim…" : "Kirim"}
        </button>
        {pushStatus.kind === "ok" ? (
          <p className="text-xs text-success">{pushStatus.message}</p>
        ) : null}
        {pushStatus.kind === "error" ? (
          <p className="text-xs text-destructive">{pushStatus.message}</p>
        ) : null}
      </AdminSurface>
    </div>
  );
}
