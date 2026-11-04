import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminReceiptScan } from "@/lib/receipt-scan.fn";
import {
  RECEIPT_VISION_MODELS,
  parseReceiptScanConfig,
  type ReceiptScanConfig,
} from "@/lib/receipt-scan";

type Stats = {
  scans: number;
  needsCheckPercent: number;
  editedPercent: number;
  costIdr: number;
  saved: number;
};

const toggleRow = "flex min-h-11 items-center gap-3 text-sm font-semibold";

/**
 * Admin control for "Scan struk pengeluaran". It edits the `receiptScan` setting the customer
 * Biaya page and the scan API read: the kill switch hides the Scan button (manual expenses keep
 * working), photos can be switched off, limits and the model are set here, and the last 30 days
 * show how often receipts needed a human check and what the AI cost.
 */
export function AdminReceiptScanPanel({
  initial,
  version: initialVersion,
  stats,
  aiConfigured,
}: {
  initial: ReceiptScanConfig;
  version: number;
  stats: Stats;
  aiConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [savePhoto, setSavePhoto] = useState(initial.savePhoto);
  const [retryStrongModel, setRetryStrongModel] = useState(initial.retryStrongModel);
  const [dailyLimit, setDailyLimit] = useState(String(initial.dailyLimit));
  const [maxPhotos, setMaxPhotos] = useState(String(initial.maxPhotos));
  const [maxMb, setMaxMb] = useState(String(initial.maxMb));
  const [model, setModel] = useState(initial.model);
  const [strongModel, setStrongModel] = useState(initial.strongModel);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseReceiptScanConfig({
        enabled,
        savePhoto,
        retryStrongModel,
        dailyLimit: Number(dailyLimit),
        maxPhotos: Number(maxPhotos),
        maxMb: Number(maxMb),
        model,
        strongModel,
      });
      const result = await saveAdminReceiptScan({
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

  const field =
    "min-h-11 w-24 rounded-xl border border-border bg-surface px-3 text-right text-sm font-semibold";
  const live = enabled && aiConfigured;

  return (
    <div className="space-y-2" data-testid="admin-receipt-scan-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Scan struk pengeluaran"
          detail="Foto struk di halaman Biaya trip pelanggan dibaca AI menjadi pengeluaran."
        />
        <StatusPill tone={live ? "good" : "warn"}>{live ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        {!aiConfigured && (
          <p
            role="alert"
            className="rounded-xl bg-warning/15 px-3 py-2 text-xs text-warning-foreground"
          >
            Kunci AI (HELIPOD_AI_KEY) belum dipasang di server, jadi tombol Scan tetap tersembunyi
            bagi pelanggan walau saklar menyala.
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
            Aktifkan scan struk
            <span className="block text-xs font-normal text-muted-foreground">
              Mati: tombol Scan disembunyikan, catat manual tetap ada
            </span>
          </span>
        </label>
        <label className={toggleRow}>
          <input
            type="checkbox"
            checked={savePhoto}
            onChange={(e) => setSavePhoto(e.target.checked)}
            className="size-5 accent-primary"
          />
          <span className="flex-1">
            Simpan foto struk
            <span className="block text-xs font-normal text-muted-foreground">
              Pelanggan bisa melampirkan foto ke pengeluaran. Mati: foto dibuang setelah dibaca
            </span>
          </span>
        </label>
        <label className={toggleRow}>
          <input
            type="checkbox"
            checked={retryStrongModel}
            onChange={(e) => setRetryStrongModel(e.target.checked)}
            className="size-5 accent-primary"
          />
          <span className="flex-1">
            Ulang dengan model kuat
            <span className="block text-xs font-normal text-muted-foreground">
              Dipakai sekali jika jumlah item tidak cocok dengan total
            </span>
          </span>
        </label>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Batas scan per pelanggan per hari
            <input
              inputMode="numeric"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className={field}
              aria-label="Batas scan per hari"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Maksimal foto per sekali scan
            <input
              inputMode="numeric"
              value={maxPhotos}
              onChange={(e) => setMaxPhotos(e.target.value)}
              className={field}
              aria-label="Maksimal foto per scan"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Ukuran foto maksimal (MB)
            <input
              inputMode="numeric"
              value={maxMb}
              onChange={(e) => setMaxMb(e.target.value)}
              className={field}
              aria-label="Ukuran foto maksimal"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              Model pembaca
              <span className="block text-xs font-normal text-muted-foreground">
                Termurah yang bisa membaca gambar
              </span>
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm"
              aria-label="Model pembaca"
            >
              {RECEIPT_VISION_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Model ulang (lebih kuat)
            <select
              value={strongModel}
              onChange={(e) => setStrongModel(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-2 text-sm"
              aria-label="Model ulang"
            >
              {RECEIPT_VISION_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="border-t border-border pt-3" data-testid="receipt-scan-stats">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            30 hari terakhir
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["Struk dibaca", stats.scans.toLocaleString("id-ID")],
              ["Perlu dicek", `${String(stats.needsCheckPercent).replace(".", ",")}%`],
              ["Diubah pelanggan", `${stats.editedPercent}%`],
              ["Biaya AI", `Rp ${stats.costIdr.toLocaleString("id-ID")}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-base font-bold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: menaikkan batas harian untuk musim liburan"
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
