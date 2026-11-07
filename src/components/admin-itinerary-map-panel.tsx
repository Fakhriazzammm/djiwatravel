import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminItineraryMap } from "@/lib/itinerary-map.fn";
import {
  ALLOWED_MAP_STYLE_HOSTS,
  DEFAULT_MAP_STYLE_URL,
  parseItineraryMapConfig,
  type ItineraryMapConfig,
} from "@/lib/itinerary-map";

/**
 * Admin control for the Agenda map. It edits the same `itineraryMap` record the customer Agenda
 * reads: the kill switch hides the map, place search can be turned off on its own, and the
 * basemap style is limited to approved hosts. Usage numbers show whether customers use pins.
 */
export function AdminItineraryMapPanel({
  initial,
  version: initialVersion,
  stats,
  geocoder,
}: {
  initial: ItineraryMapConfig;
  version: number;
  stats: { totalItems: number; pinnedItems: number; tripsWithPins: number };
  /** Which geocoder answers place search. Only the provider name and whether it is set. */
  geocoder: { provider: "maptiler" | "photon" | null; configured: boolean };
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [placeSearch, setPlaceSearch] = useState(initial.placeSearch);
  const [poiHelper, setPoiHelper] = useState(initial.poiHelper);
  const [locateMe, setLocateMe] = useState(initial.locateMe);
  const [placeImages, setPlaceImages] = useState(initial.placeImages);
  const [summaryMap, setSummaryMap] = useState(initial.summaryMap);
  const [weather, setWeather] = useState(initial.weather);
  const [styleUrl, setStyleUrl] = useState(initial.styleUrl);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseItineraryMapConfig({
        enabled,
        placeSearch,
        poiHelper,
        locateMe,
        placeImages,
        summaryMap,
        weather,
        styleUrl,
      });
      const result = await saveAdminItineraryMap({
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

  const percent = stats.totalItems ? Math.round((stats.pinnedItems / stats.totalItems) * 100) : 0;

  return (
    <div className="space-y-2" data-testid="admin-itinerary-map-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Peta Agenda"
          detail="Peta dan titik lokasi di halaman Agenda trip pelanggan."
        />
        <StatusPill tone={enabled ? "good" : "warn"}>{enabled ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground" data-testid="itinerary-map-stats">
          {stats.pinnedItems} dari {stats.totalItems} aktivitas punya titik peta ({percent}%) di{" "}
          {stats.tripsWithPins} trip.
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 accent-primary"
          />
          Tampilkan peta di Agenda
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={summaryMap}
            onChange={(event) => setSummaryMap(event.target.checked)}
            className="size-5 accent-primary"
          />
          Tampilkan peta di halaman Ringkas trip
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={weather}
            onChange={(event) => setWeather(event.target.checked)}
            className="size-5 accent-primary"
          />
          Prakiraan cuaca per hari di halaman Ringkas trip
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={placeSearch}
            onChange={(event) => setPlaceSearch(event.target.checked)}
            className="size-5 accent-primary"
          />
          Pencarian tempat saat menambah aktivitas
        </label>
        <p className="flex flex-wrap items-center gap-2 text-xs leading-5 text-muted-foreground">
          <StatusPill tone={geocoder.configured ? "good" : "warn"}>
            {geocoder.configured ? "Terhubung" : "Belum terhubung"}
          </StatusPill>
          Penyedia pencarian lokasi:{" "}
          {geocoder.provider === "maptiler"
            ? "MapTiler"
            : geocoder.provider === "photon"
              ? "Photon (server sendiri)"
              : "belum diatur"}
          {!geocoder.configured &&
            ". Pencarian gagal sampai MAPTILER_API_KEY diisi di server; lokasi tetap bisa diketik."}
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={poiHelper}
            onChange={(event) => setPoiHelper(event.target.checked)}
            className="size-5 accent-primary"
          />
          Penanda stasiun, bandara, makan, dan atraksi di peta
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={locateMe}
            onChange={(event) => setLocateMe(event.target.checked)}
            className="size-5 accent-primary"
          />
          Tombol "Lokasi saya" (GPS perangkat)
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={placeImages}
            onChange={(event) => setPlaceImages(event.target.checked)}
            className="size-5 accent-primary"
          />
          Foto tempat di kartu agenda (dari Wikipedia)
        </label>
        <p className="text-xs leading-5 text-muted-foreground">
          Posisi GPS tidak disimpan. Posisi hanya dikirim ke server saat pelanggan menekan "Tambah
          di sini" untuk mencari nama jalan. Pencarian berjalan lewat server Djiwa (tanpa kunci di
          browser) dan dibatasi per pelanggan. Jika dimatikan, lokasi tetap bisa diketik sebagai
          teks. Menonaktifkan peta tidak menghapus titik yang sudah tersimpan dan tidak mengubah
          daftar Agenda.
        </p>
        <label className="block text-sm font-semibold">
          Gaya peta (URL style MapLibre)
          <input
            value={styleUrl}
            onChange={(event) => setStyleUrl(event.target.value)}
            placeholder={DEFAULT_MAP_STYLE_URL}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Hanya https dari: {ALLOWED_MAP_STYLE_HOSTS.join(", ")}.
          </span>
        </label>
        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: mematikan peta sementara saat tile provider down"
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
