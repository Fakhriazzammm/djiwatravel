import { useEffect, useState } from "react";
import { AdminSurface, SectionHeading } from "@/components/admin-shell";
import {
  deleteAdminCityCosts,
  getAdminCityCosts,
  saveAdminCityCosts,
} from "@/lib/trip-assistant.fn";
import type { CityCosts } from "@/lib/trip-plan";

type Row = {
  cityKey: string;
  cityName: string;
  countryCode: string;
  costs: CityCosts;
  source: "ai" | "admin" | "default";
  generatedAt: string;
};

const FIELDS: { key: keyof CityCosts; label: string; hint: string }[] = [
  { key: "foodBudget", label: "Makan hemat", hint: "per orang per hari" },
  { key: "foodMid", label: "Makan nyaman", hint: "per orang per hari" },
  { key: "transportDay", label: "Transport lokal", hint: "per orang per hari" },
  { key: "attractionsDay", label: "Tiket wisata", hint: "per orang per hari" },
  { key: "hotelBudget", label: "Hotel hemat", hint: "per kamar per malam" },
  { key: "hotelMid", label: "Hotel nyaman", hint: "per kamar per malam" },
];
const SOURCE_LABEL = { ai: "AI", admin: "Admin", default: "Bawaan" } as const;
const input =
  "min-h-9 w-full rounded-lg border border-border bg-surface px-2 text-right text-[13px] tabular-nums";

function CostEditor({
  row,
  onSaved,
  onDeleted,
}: {
  row: Row;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(row.costs[f.key])])),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const costs = () =>
    Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])) as CityCosts;
  const save = async () => {
    setBusy(true);
    try {
      await saveAdminCityCosts({
        data: { cityName: row.cityName, countryCode: row.countryCode, costs: costs(), reason },
      });
      setMessage("Tersimpan. Angka Admin tidak ditimpa AI.");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteAdminCityCosts({ data: { cityKey: row.cityKey, reason } });
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Belum terhapus.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 pt-2">
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-[12px] font-medium">
            {f.label}
            <span className="block text-[11px] font-normal text-muted-foreground">{f.hint}</span>
            <input
              inputMode="numeric"
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value.replace(/\D/g, "") })}
              className={input}
            />
          </label>
        ))}
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Alasan perubahan (min. 4 huruf)"
        aria-label="Alasan perubahan"
        className="min-h-9 w-full rounded-lg border border-border bg-surface px-2 text-[13px]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 4}
          onClick={() => void save()}
          className="min-h-9 flex-1 rounded-lg bg-brand-red px-3 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Simpan
        </button>
        <button
          type="button"
          disabled={busy || reason.trim().length < 4}
          onClick={() => void remove()}
          className="min-h-9 rounded-lg bg-secondary px-3 text-[13px] font-semibold disabled:opacity-40"
        >
          Hapus (buat ulang oleh AI)
        </button>
      </div>
      {message && (
        <p role="status" className="text-[12px] text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

/** Admin › Travo: the daily-cost table behind "Rencana lengkap", one row per city. */
export function AdminCityCosts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    getAdminCityCosts()
      .then((list) => {
        setRows(list as Row[]);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);
  return (
    <AdminSurface className="space-y-2 p-3">
      <SectionHeading title="Biaya harian per kota" />
      <p className="text-[12px] text-muted-foreground">
        Dibuat AI satu kali per kota saat rencana lengkap pertama, lalu dipakai ulang. Semua angka
        dalam Rupiah dan tampil ke traveler sebagai “perkiraan”. Angka yang Anda ubah tidak pernah
        ditimpa AI.
      </p>
      {error && (
        <p role="alert" className="text-[12px] text-brand-red">
          Tabel belum bisa dimuat.
        </p>
      )}
      {rows && !rows.length && (
        <p className="text-[12px] text-muted-foreground">
          Belum ada kota. Muncul otomatis setelah ada rencana lengkap.
        </p>
      )}
      <ul className="divide-y divide-border">
        {(rows ?? []).map((row) => (
          <li key={row.cityKey}>
            <details className="py-2">
              <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold">
                <span className="min-w-0 flex-1 truncate">
                  {row.cityName} {row.countryCode && `· ${row.countryCode}`}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">
                  {SOURCE_LABEL[row.source]}
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {row.generatedAt.slice(0, 10)}
                </span>
              </summary>
              <CostEditor row={row} onSaved={() => void load()} onDeleted={() => void load()} />
            </details>
          </li>
        ))}
      </ul>
    </AdminSurface>
  );
}
