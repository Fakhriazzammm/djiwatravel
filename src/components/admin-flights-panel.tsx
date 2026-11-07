import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminFlights } from "@/lib/flights.fn";
import { parseFlightsConfig, travelpayoutsScriptSrc, type FlightsConfig } from "@/lib/flights";

/**
 * Admin control for flight tickets. It edits the `flights` record the customer trip page and the
 * root layout read: the master switch hides the ticket card and the partner script, the Google
 * Flights link and the Travelpayouts script can each be turned off, and the script can wait for
 * the cookie notice. Ids are public values from the Travelpayouts dashboard, never secrets.
 */
export function AdminFlightsPanel({
  initial,
  version: initialVersion,
}: {
  initial: FlightsConfig;
  version: number;
}) {
  const [config, setConfig] = useState(initial);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const set = <K extends keyof FlightsConfig>(key: K, value: FlightsConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const parsed = parseFlightsConfig(config);
      const result = await saveAdminFlights({
        data: { config: parsed, reason, expectedVersion: version },
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
      setConfig(parsed);
      setStatus({ kind: "ok" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan. Tidak ada yang berubah.",
      });
    }
  };

  const toggle = (
    key: "enabled" | "googleFlights" | "travelpayouts" | "waitForConsent",
    label: string,
  ) => (
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
      <input
        type="checkbox"
        checked={config[key]}
        onChange={(event) => set(key, event.target.checked)}
        className="size-5 accent-primary"
      />
      {label}
    </label>
  );
  const field = "mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm";
  const src = travelpayoutsScriptSrc(config);

  return (
    <div className="space-y-2" data-testid="admin-flights-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Tiket pesawat"
          detail="Kartu cari tiket di Ringkas perjalanan dan skrip Travelpayouts."
        />
        <StatusPill tone={config.enabled ? "good" : "warn"}>
          {config.enabled ? "Aktif" : "Nonaktif"}
        </StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        {toggle("enabled", "Tampilkan tiket pesawat")}
        {toggle("googleFlights", "Tombol Cari di Google Flights")}
        {toggle("travelpayouts", "Muat skrip Travelpayouts")}
        {toggle("waitForConsent", "Skrip menunggu pelanggan menekan Setuju")}
        <p className="text-xs text-muted-foreground">
          Matikan opsi terakhir hanya saat verifikasi situs di Travelpayouts: crawler mereka tidak
          bisa menekan Setuju, dan skrip lalu dimuat untuk semua pengunjung.
        </p>
        <label className="block text-sm font-semibold">
          ID skrip
          <input
            value={config.scriptId}
            onChange={(event) => set("scriptId", event.target.value)}
            className={field}
          />
        </label>
        <label className="block text-sm font-semibold">
          Marker (ID partner)
          <input
            inputMode="numeric"
            value={config.partnerId}
            onChange={(event) => set("partnerId", event.target.value)}
            className={field}
          />
        </label>
        <p className="break-all text-xs text-muted-foreground" data-testid="flights-script-src">
          {src ? `Skrip: ${src}` : "Skrip Travelpayouts tidak dimuat."}
        </p>
        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: verifikasi situs di Travelpayouts"
            className={field}
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
            Pengaturan tersimpan dan dicatat di audit log. Pelanggan melihatnya dalam semenit.
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
