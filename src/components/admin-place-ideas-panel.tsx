import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import {
  clearAdminPlaceIdeasCache,
  hideAdminPlaceIdea,
  saveAdminPlaceIdeas,
} from "@/lib/place-ideas.fn";
import { PLACE_IDEA_MODELS, parsePlaceIdeasConfig, type PlaceIdeasConfig } from "@/lib/place-ideas";

type Stats = {
  searches: number;
  failedPercent: number;
  costIdr: number;
  cachedCities: number;
  hidden: number;
};
type Row = {
  key: string;
  name: string;
  destination: string;
  category: string;
  sourceHost: string;
  hidden: boolean;
};

const toggleRow = "flex min-h-11 items-center gap-3 text-sm font-semibold";
const field =
  "min-h-11 w-24 rounded-xl border border-border bg-surface px-3 text-right text-sm font-semibold";

/**
 * Admin control for "Ide tempat" in the traveler Agenda. It edits the `placeIdeas` setting the
 * carousel and the "Ke mana lagi ya?" sheet read: kill switch, daily search limit per customer,
 * cache lifetime, model, plus the last 30 days of searches and cost, and a list of recent ideas
 * the team can hide when a place is wrong or closed.
 */
export function AdminPlaceIdeasPanel({
  initial,
  version: initialVersion,
  stats,
  recent,
  keys,
}: {
  initial: PlaceIdeasConfig;
  version: number;
  stats: Stats;
  recent: Row[];
  keys: { ai: boolean; tinyfish: boolean };
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [showStrip, setShowStrip] = useState(initial.showStrip);
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [cacheDays, setCacheDays] = useState(String(initial.cacheDays));
  const [maxIdeas, setMaxIdeas] = useState(String(initial.maxIdeas));
  const [model, setModel] = useState(initial.model);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState(recent);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const keysReady = keys.ai && keys.tinyfish;
  const live = enabled && keysReady;

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parsePlaceIdeasConfig({
        enabled,
        showStrip,
        dailyLimit: Number(dailyLimit),
        cacheDays: Number(cacheDays),
        maxIdeas: Number(maxIdeas),
        model,
      });
      const result = await saveAdminPlaceIdeas({
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

  const toggleHidden = async (row: Row) => {
    try {
      await hideAdminPlaceIdea({
        data: { key: row.key, name: row.name, destination: row.destination, hidden: !row.hidden },
      });
      setRows((list) => list.map((r) => (r.key === row.key ? { ...r, hidden: !r.hidden } : r)));
      setNote(null);
    } catch {
      setNote("Belum bisa mengubah. Coba lagi.");
    }
  };

  const clearCache = async () => {
    try {
      const result = await clearAdminPlaceIdeasCache();
      setRows([]);
      setNote(`${result.deleted} jawaban cache dihapus. Pencarian berikutnya mengambil data baru.`);
    } catch {
      setNote("Cache belum bisa dibersihkan. Coba lagi.");
    }
  };

  return (
    <div className="space-y-2" data-testid="admin-place-ideas-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Ide tempat di Agenda"
          detail="AI mencari tempat dari web untuk tujuan trip, lalu pelanggan menambahkannya ke Agenda."
        />
        <StatusPill tone={live ? "good" : "warn"}>{live ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        {!keysReady && (
          <p
            role="alert"
            className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning-foreground"
          >
            {[!keys.ai && "HELIPOD_AI_KEY", !keys.tinyfish && "TINYFISH_API_KEY"]
              .filter(Boolean)
              .join(" dan ")}{" "}
            belum dipasang di server, jadi fitur tetap tersembunyi bagi pelanggan walau saklar
            menyala.
          </p>
        )}
        <label className={toggleRow}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5 accent-primary"
          />
          <span className="flex-1">
            Aktifkan ide tempat
            <span className="block text-xs font-normal text-muted-foreground">
              Mati: carousel dan sheet “Ke mana lagi ya?” disembunyikan, agenda manual tetap ada
            </span>
          </span>
        </label>
        <label className={toggleRow}>
          <input
            type="checkbox"
            checked={showStrip}
            onChange={(e) => setShowStrip(e.target.checked)}
            className="size-5 accent-primary"
          />
          <span className="flex-1">
            Tampilkan carousel kecil di Agenda
            <span className="block text-xs font-normal text-muted-foreground">
              Mati: ide hanya muncul lewat maskot “Ke mana lagi ya?”
            </span>
          </span>
        </label>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              Pencarian baru per pelanggan per hari
              <span className="block text-xs font-normal text-muted-foreground">
                Jawaban dari cache tidak dihitung
              </span>
            </span>
            <input
              inputMode="numeric"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className={field}
              aria-label="Batas pencarian per hari"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Masa berlaku cache (hari)
            <input
              inputMode="numeric"
              value={cacheDays}
              onChange={(e) => setCacheDays(e.target.value)}
              className={field}
              aria-label="Masa berlaku cache"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Jumlah ide per pencarian
            <input
              inputMode="numeric"
              value={maxIdeas}
              onChange={(e) => setMaxIdeas(e.target.value)}
              className={field}
              aria-label="Jumlah ide per pencarian"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              Model AI
              <span className="block text-xs font-normal text-muted-foreground">
                Termurah dulu; cukup untuk merangkum teks
              </span>
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm"
              aria-label="Model AI"
            >
              {PLACE_IDEA_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="border-t border-border pt-3" data-testid="place-ideas-stats">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            30 hari terakhir
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["Pencarian baru", stats.searches.toLocaleString("id-ID")],
              ["Gagal", `${String(stats.failedPercent).replace(".", ",")}%`],
              ["Biaya AI", `Rp ${stats.costIdr.toLocaleString("id-ID")}`],
              ["Jawaban di cache", stats.cachedCities.toLocaleString("id-ID")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-base font-bold">{value}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void clearCache()}
            className="mt-2 min-h-10 w-full rounded-xl bg-secondary px-4 text-sm font-semibold"
          >
            Bersihkan cache
          </button>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Ide terbaru ({stats.hidden} disembunyikan)
          </p>
          {rows.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Belum ada ide. Ide muncul di sini setelah pelanggan membuka Agenda.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border/70">
              {rows.map((row) => (
                <li key={row.key} className="flex min-h-12 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-semibold ${row.hidden ? "line-through opacity-60" : ""}`}
                    >
                      {row.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {row.destination} · {row.category} · {row.sourceHost}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleHidden(row)}
                    className="min-h-9 shrink-0 rounded-lg bg-secondary px-3 text-xs font-semibold"
                    aria-label={`${row.hidden ? "Tampilkan" : "Sembunyikan"} ${row.name}`}
                  >
                    {row.hidden ? "Tampilkan" : "Sembunyikan"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {note && (
            <p role="status" className="mt-2 text-xs font-medium text-muted-foreground">
              {note}
            </p>
          )}
        </div>

        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: menurunkan batas harian untuk menghemat biaya"
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
