import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminFlights } from "@/lib/flights.fn";
import {
  SEARCHES_PER_HOUR_MAX,
  SEARCHES_PER_HOUR_MIN,
  parseFlightsConfig,
  travelpayoutsScriptSrc,
  type FlightsConfig,
} from "@/lib/flights";

/**
 * Admin control for flight tickets. It edits the `flights` record that Home (hero tab, tile), the
 * /tiket search and Ringkas read: the master switch, each entry point on its own, whether guests
 * may search, the hourly search allowance, and the Travelpayouts partner script. The provider
 * token is a server secret and is only reported here as present or missing, never shown.
 */
export function AdminFlightsPanel({
  initial,
  version: initialVersion,
  tokenConfigured,
  stats,
}: {
  initial: FlightsConfig;
  version: number;
  tokenConfigured: boolean;
  stats: {
    searches: number;
    cacheHits: number;
    empty: number;
    rateLimited: number;
    failed: number;
    clicks7d: number;
    embedOpens7d: number;
  };
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
    key: "enabled" | "heroTab" | "homeTile" | "guestSearch" | "travelpayouts" | "waitForConsent",
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
          detail="Pencarian tiket di /tiket, pintu masuknya, White Label, dan skrip Travelpayouts."
        />
        <StatusPill tone={config.enabled ? "good" : "warn"}>
          {config.enabled ? "Aktif" : "Nonaktif"}
        </StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2" data-testid="flights-stats">
          <Stat
            label="Token"
            value={tokenConfigured ? "Terpasang" : "Belum ada"}
            bad={!tokenConfigured}
          />
          <Stat label="Klik ke mitra (7 hari)" value={String(stats.clicks7d)} />
          <Stat label="Buka hasil lengkap (7 hari)" value={String(stats.embedOpens7d)} />
          <Stat label="Pencarian harga (sejak restart)" value={String(stats.searches)} />
        </div>
        {!tokenConfigured && (
          <p role="alert" className="text-xs font-medium text-brand-red">
            TRAVELPAYOUTS_TOKEN belum ada di server. Tanpa itu pencarian tidak jalan dan pintu
            masuknya disembunyikan dari pelanggan.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Sejak restart: {stats.cacheHits} dari cache, {stats.empty} tanpa hasil,{" "}
          {stats.rateLimited} dibatasi, {stats.failed} gagal.
        </p>
        {toggle("enabled", "Aktifkan tiket pesawat")}
        {toggle("heroTab", "Tab Tiket di hero Beranda")}
        {toggle("homeTile", "Tile Tiket di Kebutuhan perjalanan")}
        {toggle("guestSearch", "Tamu (belum login) boleh mencari")}
        <label className="block text-sm font-semibold">
          Batas pencarian per jam (per akun atau alamat)
          <input
            type="number"
            min={SEARCHES_PER_HOUR_MIN}
            max={SEARCHES_PER_HOUR_MAX}
            value={config.searchesPerHour}
            onChange={(event) => set("searchesPerHour", Number(event.target.value))}
            className={field}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {SEARCHES_PER_HOUR_MIN}-{SEARCHES_PER_HOUR_MAX}. Pencarian yang sama dalam 30 menit
            diambil dari cache dan tidak dihitung.
          </span>
        </label>
        <label className="block text-sm font-semibold">
          ID White Label (tipe Widget)
          <input
            inputMode="numeric"
            value={config.whiteLabelId}
            onChange={(event) => set("whiteLabelId", event.target.value)}
            placeholder="12345"
            className={field}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Angka setelah <code>wl_id=</code> di kode widget (Travelpayouts › White Label › WL Web ›
            Widget › Your widget code). Kosong = hanya harga termurah per hari dari data tersimpan.
          </span>
        </label>
        <p className="text-xs text-muted-foreground" data-testid="flights-wl-status">
          {config.whiteLabelId
            ? `Hasil lengkap aktif (White Label ${config.whiteLabelId}), dimuat setelah pelanggan setuju.`
            : "Hasil lengkap belum aktif: belum ada White Label."}
        </p>
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

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${bad ? "text-brand-red" : ""}`}>{value}</p>
    </div>
  );
}
