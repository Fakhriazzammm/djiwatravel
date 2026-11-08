import { useEffect, useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { getAdminFlightEarnings, revokeFlightShares, saveAdminFlights } from "@/lib/flights.fn";
import type { FlightEarnings } from "@/lib/flight-earnings.server";
import {
  FLIGHT_NUMBER_LIMITS,
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
    saves7d: number;
    insightPicks7d: number;
    esimOffers7d: number;
    alertsActive: number;
    alertsNotified: number;
    sharesActive: number;
    shareOpens: number;
    votes: number;
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
    key:
      | "enabled"
      | "heroTab"
      | "homeTile"
      | "guestSearch"
      | "travelpayouts"
      | "waitForConsent"
      | "priceAlerts"
      | "saveToTrip"
      | "dateInsight"
      | "esimOffer"
      | "share",
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
  const [shareNote, setShareNote] = useState<string | null>(null);
  const closeShares = async () => {
    try {
      const result = await revokeFlightShares({ data: { reason } });
      setShareNote(`${result.revoked} tautan dicabut dan dicatat di audit log.`);
    } catch {
      setShareNote("Gagal mencabut tautan. Tidak ada yang berubah.");
    }
  };

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
      <EarningsCard />
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
          <Stat label="Pantauan harga aktif" value={String(stats.alertsActive)} />
          <Stat label="Notifikasi harga terkirim" value={String(stats.alertsNotified)} />
          <Stat label="Disimpan ke perjalanan (7 hari)" value={String(stats.saves7d)} />
          <Stat label="Pindah tanggal hemat (7 hari)" value={String(stats.insightPicks7d)} />
          <Stat label="Buka paket eSIM dari tiket (7 hari)" value={String(stats.esimOffers7d)} />
          <Stat
            label="Tautan bagikan aktif / dibuka / suara"
            value={`${stats.sharesActive} / ${stats.shareOpens} / ${stats.votes}`}
          />
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
        <div className="space-y-1 rounded-xl bg-secondary/60 p-2" data-testid="flights-features">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Fitur di hasil pencarian
          </p>
          {toggle("priceAlerts", "Pantau harga (notifikasi saat harga turun)")}
          {config.priceAlerts && (
            <NumberField
              label="Pantauan aktif per member"
              limits={FLIGHT_NUMBER_LIMITS.alertsPerMember}
              value={config.alertsPerMember}
              onChange={(value) => set("alertsPerMember", value)}
              className={field}
            />
          )}
          {toggle("saveToTrip", "Simpan penerbangan ke perjalanan (Agenda)")}
          {toggle("dateInsight", "Saran tanggal lebih hemat")}
          {config.dateInsight && (
            <NumberField
              label="Selisih minimal untuk saran (%)"
              limits={FLIGHT_NUMBER_LIMITS.insightMinPercent}
              value={config.insightMinPercent}
              onChange={(value) => set("insightMinPercent", value)}
              className={field}
            />
          )}
          {toggle("esimOffer", "Tawarkan eSIM negara tujuan")}
          {toggle("share", "Bagikan pilihan ke teman (voting)")}
          {config.share && (
            <NumberField
              label="Masa berlaku tautan (hari)"
              limits={FLIGHT_NUMBER_LIMITS.shareDays}
              value={config.shareDays}
              onChange={(value) => set("shareDays", value)}
              className={field}
            />
          )}
          <button
            type="button"
            onClick={() => void closeShares()}
            disabled={reason.trim().length < 4 || stats.sharesActive === 0}
            className="min-h-10 w-full rounded-xl bg-secondary px-3 text-xs font-semibold disabled:opacity-40"
          >
            Cabut semua tautan bagikan aktif ({stats.sharesActive})
          </button>
          {shareNote && (
            <p role="status" className="text-xs font-medium text-muted-foreground">
              {shareNote}
            </p>
          )}
        </div>
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

const usd = (value: number | null) =>
  value === null ? "-" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const STATE_LABEL = { paid: "Dibayar", processing: "Diproses", cancelled: "Dibatalkan" } as const;

/** Travelpayouts balance, next payout and the last 30 days of bookings, read from their finance API. */
function EarningsCard() {
  const [data, setData] = useState<FlightEarnings | null>(null);
  const [busy, setBusy] = useState(true);
  const load = async (refresh: boolean) => {
    setBusy(true);
    try {
      setData(await getAdminFlightEarnings({ data: { refresh } }));
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load(false);
  }, []);

  return (
    <AdminSurface className="space-y-2 p-3" data-testid="flights-earnings">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Pendapatan Travelpayouts</p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={busy}
          className="min-h-9 rounded-xl bg-secondary px-3 text-xs font-semibold disabled:opacity-40"
        >
          {busy ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
      {!busy && (!data || data.status === "failed") && (
        <p role="alert" className="text-xs font-medium text-brand-red">
          Data Travelpayouts belum bisa dibaca. Coba lagi sebentar lagi.
        </p>
      )}
      {data?.status === "unconfigured" && (
        <p className="text-xs text-muted-foreground">TRAVELPAYOUTS_TOKEN belum ada di server.</p>
      )}
      {data?.status === "ok" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Saldo" value={usd(data.balance)} />
            <Stat label="Pembayaran berikutnya" value={usd(data.nextPayout)} />
            <Stat
              label={`Booking ${data.windowDays} hari`}
              value={`${data.bookings}${data.truncated ? "+" : ""}`}
            />
            <Stat label="Komisi diproses" value={usd(data.profit.processing)} />
            <Stat label="Komisi dibayar" value={usd(data.profit.paid)} />
            <Stat label="Dibatalkan" value={String(data.count.cancelled)} />
          </div>
          {data.recent.length > 0 && (
            <ul className="space-y-1 text-xs" data-testid="flights-earnings-recent">
              {data.recent.map((row, index) => (
                <li key={`${row.bookedAt}-${index}`} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {row.bookedAt.slice(0, 10)} · {row.description || "Booking"}
                  </span>
                  <span className="shrink-0 font-semibold">
                    {usd(row.profit)} · {row.state === "other" ? "-" : STATE_LABEL[row.state]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Semua program Travelpayouts di akun, bukan hanya tiket. Disimpan 10 menit; Muat ulang
            paling cepat sekali semenit. Dalam USD sesuai dashboard.
          </p>
        </>
      )}
    </AdminSurface>
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

function NumberField({
  label,
  limits,
  value,
  onChange,
  className,
}: {
  label: string;
  limits: readonly [number, number];
  value: number;
  onChange: (value: number) => void;
  className: string;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <input
        type="number"
        min={limits[0]}
        max={limits[1]}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={className}
      />
      <span className="mt-0.5 block font-normal text-muted-foreground">
        {limits[0]}-{limits[1]}
      </span>
    </label>
  );
}
