import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { clearAdminTripAssistantHistory, saveAdminTripAssistant } from "@/lib/trip-assistant.fn";
import {
  TRIP_ASSISTANT_MODELS,
  parseTripAssistantConfig,
  type TripAssistantConfig,
  TRAVO_SCOPE_LABEL,
  type TravoScope,
} from "@/lib/trip-assistant";

type Stats = {
  messages: number;
  guestMessages: number;
  travelers: number;
  failedPercent: number;
  costIdr: number;
  avgCostIdr: number;
  proposals: number;
  applied: number;
  undone: number;
  appliedPercent: number;
  byIntent: { intent: string; n: number }[];
  byScope: { scope: string; n: number }[];
  byCard: { card: string; n: number }[];
  conversations: number;
};
type Recent = {
  at: string;
  intent: string;
  scope: string;
  status: string;
  model: string;
  proposalKind: string | null;
  guest: boolean;
  tokens: number;
  costIdr: number;
};

const toggleRow = "flex min-h-11 items-center gap-3 text-sm font-semibold";
const field =
  "min-h-11 w-24 rounded-xl border border-border bg-surface px-3 text-right text-sm font-semibold";
const CARD_LABEL: Record<string, string> = {
  esim: "eSIM",
  tiket: "Tiket",
  panduan: "Panduan",
  trip: "Trip",
  pesanan: "Pesanan",
  dompet: "Dompet",
  buat_trip: "Buat trip",
  titip: "Titip belanja",
};
const INTENT_LABEL: Record<string, string> = {
  chat: "Tanya jawab",
  plan: "Itinerary",
  budget: "Anggaran",
  tidy: "Rapikan agenda",
  checklist: "Checklist",
  expense: "Catat biaya",
};

/**
 * Admin control for the trip assistant (AI chat in Ringkas). It edits the `tripAssistant` setting:
 * kill switch, guest access, what the AI may propose to change, daily limits, models, house
 * tone and forbidden topics; shows 30 days of usage, cost and how many proposals travelers
 * apply; lists recent calls without any message text; and clears stored conversations.
 */
export function AdminTripAssistantPanel({
  initial,
  version: initialVersion,
  stats,
  recent,
  keyConfigured,
  reminderSent = 0,
}: {
  initial: TripAssistantConfig;
  version: number;
  stats: Stats;
  recent: Recent[];
  keyConfigured: boolean;
  reminderSent?: number;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [guestEnabled, setGuestEnabled] = useState(initial.guestEnabled);
  const [allowAgenda, setAllowAgenda] = useState(initial.allowAgenda);
  const [allowBudget, setAllowBudget] = useState(initial.allowBudget);
  const [allowCommerce, setAllowCommerce] = useState(initial.allowCommerce);
  const [verifyHours, setVerifyHours] = useState(initial.verifyHours);
  const [reminders, setReminders] = useState(initial.reminders);
  const [dailyMessages, setDailyMessages] = useState(String(initial.dailyMessages));
  const [guestDailyMessages, setGuestDailyMessages] = useState(String(initial.guestDailyMessages));
  const [maxAgendaItems, setMaxAgendaItems] = useState(String(initial.maxAgendaItems));
  const [historyDays, setHistoryDays] = useState(String(initial.historyDays));
  const [model, setModel] = useState(initial.model);
  const [generationModel, setGenerationModel] = useState(initial.generationModel);
  const [tone, setTone] = useState(initial.tone);
  const [blockedTopics, setBlockedTopics] = useState(initial.blockedTopics);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const live = enabled && keyConfigured;

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseTripAssistantConfig({
        enabled,
        guestEnabled,
        allowAgenda,
        allowBudget,
        allowCommerce,
        verifyHours,
        reminders,
        dailyMessages: Number(dailyMessages),
        guestDailyMessages: Number(guestDailyMessages),
        maxAgendaItems: Number(maxAgendaItems),
        historyDays: Number(historyDays),
        model,
        generationModel,
        tone,
        blockedTopics,
      });
      const result = await saveAdminTripAssistant({
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

  const clearHistory = async () => {
    try {
      const result = await clearAdminTripAssistantHistory();
      setNote(`${result.deleted} pesan dihapus. Perubahan yang sudah diterapkan tetap ada.`);
    } catch {
      setNote("Riwayat belum bisa dihapus. Coba lagi.");
    }
  };

  const number = (label: string, hint: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value)}
        className={field}
        aria-label={label}
      />
    </label>
  );
  const check = (label: string, hint: string, value: boolean, set: (v: boolean) => void) => (
    <label className={toggleRow}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
        className="size-5 accent-primary"
      />
      <span className="flex-1">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  const modelSelect = (label: string, hint: string, value: string, set: (v: string) => void) => (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm"
        aria-label={label}
      >
        {TRIP_ASSISTANT_MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-2" data-testid="admin-trip-assistant-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Travo (asisten perjalanan AI)"
          detail="Obrolan Travo di Ringkas yang membuat itinerary, anggaran, dan checklist. AI hanya mengusulkan; pelancong yang menerapkan."
        />
        <StatusPill tone={live ? "good" : "warn"}>{live ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        {!keyConfigured && (
          <p
            role="alert"
            className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning-foreground"
          >
            HELIPOD_AI_KEY belum dipasang di server, jadi asisten tetap tersembunyi bagi pelanggan
            walau saklar menyala.
          </p>
        )}
        {check(
          "Aktifkan asisten",
          "Mati: obrolan hilang, kartu Agenda dan Biaya tampil seperti biasa",
          enabled,
          setEnabled,
        )}
        {check(
          "Boleh untuk tamu (tanpa akun)",
          "Pemilik trip tamu memakai batas harian khusus tamu di bawah",
          guestEnabled,
          setGuestEnabled,
        )}
        {check(
          "AI boleh mengusulkan perubahan Agenda",
          "Menambah, memindah, dan menghapus aktivitas (tetap perlu Terapkan)",
          allowAgenda,
          setAllowAgenda,
        )}
        {check(
          "AI boleh mengusulkan Anggaran, Checklist, dan Biaya",
          "Pembagian anggaran, item checklist, dan satu catatan biaya",
          allowBudget,
          setAllowBudget,
        )}
        {check(
          "AI boleh menampilkan kartu produk di chat",
          "Paket eSIM dengan tombol Beli (checkout langsung di chat), harga tiket, panduan, dan daftar trip. Harga selalu diambil langsung dari katalog",
          allowCommerce,
          setAllowCommerce,
        )}

        {check(
          "Cek lokasi dan jam buka di peta",
          "Tempat baru dicari di OpenStreetMap; kartu menandai yang mungkin tutup. Mati: hanya catatan “cek jam buka”",
          verifyHours,
          setVerifyHours,
        )}
        {check(
          "Pengingat proaktif (notifikasi)",
          `Anggaran, agenda kosong, checklist, hari tanpa agenda. Hanya akun, maks 1 per hari, jam 08-20 WIB. Terkirim 30 hari: ${reminderSent}`,
          reminders,
          setReminders,
        )}

        <div className="space-y-2 border-t border-border pt-3">
          {number("Pesan per akun per hari", "Zona waktu Jakarta", dailyMessages, setDailyMessages)}
          {number(
            "Pesan per tamu per hari",
            "0 = tamu tidak bisa",
            guestDailyMessages,
            setGuestDailyMessages,
          )}
          {number("Aktivitas maks per usulan", "3-15", maxAgendaItems, setMaxAgendaItems)}
          {number(
            "Simpan riwayat (hari)",
            "Lebih lama dihapus otomatis",
            historyDays,
            setHistoryDays,
          )}
          {modelSelect(
            "Model obrolan",
            "Tanya jawab dan catat biaya. Termurah dulu",
            model,
            setModel,
          )}
          {modelSelect(
            "Model penyusun",
            "Itinerary, anggaran, rapikan agenda",
            generationModel,
            setGenerationModel,
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="block text-sm font-semibold">
            Gaya bicara tambahan
            <textarea
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Contoh: panggil pelancong 'kak', hindari istilah teknis"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold">
            Topik yang harus ditolak
            <textarea
              value={blockedTopics}
              onChange={(e) => setBlockedTopics(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Contoh: nasihat medis, visa ilegal, politik"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>

        <div className="border-t border-border pt-3" data-testid="assistant-stats">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            30 hari terakhir
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["Pesan", stats.messages.toLocaleString("id-ID")],
              ["Dari tamu", stats.guestMessages.toLocaleString("id-ID")],
              ["Pelancong aktif", stats.travelers.toLocaleString("id-ID")],
              ["Gagal", `${String(stats.failedPercent).replace(".", ",")}%`],
              ["Usulan dibuat", stats.proposals.toLocaleString("id-ID")],
              ["Usulan diterapkan", `${stats.appliedPercent}% (${stats.applied})`],
              ["Diurungkan", stats.undone.toLocaleString("id-ID")],
              ["Biaya AI", `Rp ${stats.costIdr.toLocaleString("id-ID")}`],
              ["Rata-rata per pesan", `Rp ${stats.avgCostIdr.toLocaleString("id-ID")}`],
              ["Obrolan baru", stats.conversations.toLocaleString("id-ID")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-base font-bold">{value}</p>
              </div>
            ))}
          </div>
          {stats.byScope.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="assistant-scopes">
              Topik chat:{" "}
              {stats.byScope
                .map(
                  (i) =>
                    `${i.scope === "all" ? "Umum" : i.scope === "trip" ? "Trip" : (TRAVO_SCOPE_LABEL[i.scope as TravoScope] ?? i.scope)} ${i.n}`,
                )
                .join(" · ")}
            </p>
          )}
          {stats.byCard.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="assistant-cards">
              Kartu di chat:{" "}
              {stats.byCard.map((i) => `${CARD_LABEL[i.card] ?? i.card} ${i.n}`).join(" · ")}
            </p>
          )}
          {stats.byIntent.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {stats.byIntent
                .map((i) => `${INTENT_LABEL[i.intent] ?? i.intent} ${i.n}`)
                .join(" · ")}
            </p>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Panggilan terbaru (tanpa isi pesan)
          </p>
          {recent.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Belum ada. Muncul setelah pelancong mulai mengobrol.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border/70">
              {recent.map((row, index) => (
                <li key={`${row.at}-${index}`} className="flex min-h-11 items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {row.scope === "trip"
                        ? (INTENT_LABEL[row.intent] ?? row.intent)
                        : `Travo · ${TRAVO_SCOPE_LABEL[row.scope as TravoScope] ?? row.scope}`}
                      {row.proposalKind ? ` → ${row.proposalKind}` : ""}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {new Date(row.at).toLocaleString("id-ID")} · {row.guest ? "tamu" : "akun"} ·{" "}
                      {row.model} · {row.tokens.toLocaleString("id-ID")} token
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold ${row.status === "ok" ? "text-success" : "text-brand-red"}`}
                  >
                    {row.status === "ok" ? `Rp ${row.costIdr}` : "Gagal"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => void clearHistory()}
            className="mt-2 min-h-10 w-full rounded-xl bg-secondary px-4 text-sm font-semibold"
          >
            Hapus semua riwayat obrolan
          </button>
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
            placeholder="Contoh: batas tamu dinaikkan untuk uji coba"
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
