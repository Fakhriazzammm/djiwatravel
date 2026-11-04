import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { GoogleConsentSheet } from "@/components/google-consent-sheet";
import { googleConnectHref, useGoogleStatus } from "@/lib/google-status";

type SheetExport = {
  status: "pending" | "synced" | "failed" | "revoked";
  spreadsheetUrl: string | null;
  lastSyncedAt: string | null;
  error: string | null;
} | null;

const DISMISS_KEY = "djiwa:drive-invite-dismissed";
const card = "rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-border/50";
const primary =
  "tap inline-flex min-h-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-red px-3.5 text-[13px] font-semibold text-white disabled:opacity-50";
const secondary =
  "tap inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold disabled:opacity-50";

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < 7 * 86_400_000;
  } catch {
    return false;
  }
}

function ago(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} jam lalu` : `${Math.round(hours / 24)} hari lalu`;
}

/** Shows the toast for a finished Google connect and removes its query params. */
function useGoogleReturnToast(onDone: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    if (result === "connected") toast.success("Google terhubung.");
    else if (result === "partial")
      toast.error("Sebagian izin tidak diberikan. Aktifkan lagi dan centang semua izin file.");
    else if (result === "denied") toast.error("Izin Google dibatalkan.");
    else if (result === "failed") toast.error("Google belum terhubung. Coba lagi.");
    params.delete("google");
    params.delete("feature");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Google Drive + Sheets on the Biaya page: an invitation to save receipts to the traveler's Drive,
 * a retry/reconnect notice when Google work is stuck, and the per-trip Sheets export. Renders
 * nothing while the status is unknown or Google is not configured.
 */
export function TripGoogleCards({ tripId, showDrive }: { tripId: string; showDrive: boolean }) {
  const { status, reload } = useGoogleStatus();
  useGoogleReturnToast(() => void reload());
  const [consent, setConsent] = useState<null | "drive" | "sheets">(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetExport>(null);
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const returnTo = useRef("/my-trips");

  useEffect(() => {
    returnTo.current = window.location.pathname;
    setDismissed(recentlyDismissed());
  }, []);

  const sheetsOn = Boolean(status?.features.sheets);
  const loadSheet = async () => {
    try {
      const response = await fetch(`/api/google-sheets?tripId=${tripId}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      setSheet(((await response.json()) as { export: SheetExport }).export ?? null);
    } finally {
      setSheetLoaded(true);
    }
  };
  useEffect(() => {
    if (sheetsOn) void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetsOn, tripId]);
  useEffect(() => {
    if (sheet?.status !== "pending") return;
    const timer = window.setInterval(() => void loadSheet(), 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.status]);

  if (!status || !status.configured) return null;

  const sheetCall = async (action: "start" | "sync" | "stop") => {
    setBusy(true);
    try {
      const response = await fetch("/api/google-sheets", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, action }),
      });
      const body = (await response.json()) as { export?: SheetExport; error?: string };
      if (!response.ok) throw new Error(body.error || "Ekspor Sheets gagal");
      setSheet(body.export ?? null);
      if (action === "start") toast.success("Spreadsheet dibuat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ekspor Sheets gagal");
      void loadSheet();
    } finally {
      setBusy(false);
    }
  };
  const retryDrive = async () => {
    setBusy(true);
    try {
      await fetch("/api/google-drive", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
    } finally {
      setBusy(false);
      void reload();
    }
  };

  return (
    <div className="space-y-2" data-testid="trip-google-cards">
      {status.needsReconnect && (
        <div role="alert" className={`${card} bg-destructive/10`}>
          <p className="text-[14px] font-semibold text-destructive">
            Google perlu dihubungkan ulang
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Aksesnya dicabut. Pengeluaranmu aman; unggahan dan ekspor lanjut setelah terhubung.
          </p>
          <a
            href={googleConnectHref("drive,sheets", returnTo.current)}
            className={`${primary} mt-2 w-full`}
          >
            Hubungkan ulang
          </a>
        </div>
      )}
      {!status.needsReconnect && status.drive.failed > 0 && (
        <div className={card}>
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">
                {status.drive.failed} struk belum masuk Drive
              </p>
              <p className="text-[11px] text-muted-foreground">
                Fotonya aman di Djiwa. Coba unggah lagi.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void retryDrive()}
              className={secondary}
            >
              {busy ? "Mencoba…" : "Coba lagi"}
            </button>
          </div>
        </div>
      )}
      {showDrive && !status.features.drive && !dismissed && (
        <div className={`${card} bg-secondary`}>
          <p className="text-[14px] font-semibold">Simpan struk di Drive-mu</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Foto struk tidak memenuhi penyimpanan Djiwa dan bisa kamu buka kapan saja.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConsent("drive")}
              className={`${primary} flex-1`}
            >
              Aktifkan Drive
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(DISMISS_KEY, String(Date.now()));
                } catch {
                  /* dismiss only lasts for this visit */
                }
              }}
              className={secondary}
            >
              Nanti
            </button>
          </div>
        </div>
      )}
      {sheetsOn ? (
        sheetLoaded && (
          <div className={card}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-green-100 text-[11px] font-bold text-green-700">
                Sh
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  {sheet ? "Budget di Google Sheets" : "Ekspor ke Google Sheets"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground" role="status">
                  {!sheet
                    ? "Budget trip jadi spreadsheet di Drive-mu"
                    : sheet.status === "synced"
                      ? `Tersinkron ${ago(sheet.lastSyncedAt)}`
                      : sheet.status === "pending"
                        ? "Menyinkronkan…"
                        : sheet.status === "revoked"
                          ? "Menunggu Google terhubung ulang"
                          : "Gagal sinkron · Fotonya aman, data tidak berubah"}
                </p>
              </div>
              {!sheet ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sheetCall("start")}
                  className={primary}
                >
                  {busy ? "Membuat…" : "Buat"}
                </button>
              ) : sheet.status === "failed" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void sheetCall("sync")}
                  className={secondary}
                >
                  Coba lagi
                </button>
              ) : sheet.spreadsheetUrl ? (
                <a
                  href={sheet.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={secondary}
                >
                  Buka <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        )
      ) : status.googleConnected || status.features.calendar ? (
        <div className={card}>
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-green-100 text-[11px] font-bold text-green-700">
              Sh
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">Ekspor ke Google Sheets</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Budget trip jadi spreadsheet
              </p>
            </div>
            <button type="button" onClick={() => setConsent("sheets")} className={secondary}>
              Aktifkan
            </button>
          </div>
        </div>
      ) : null}
      <GoogleConsentSheet
        open={consent !== null}
        onOpenChange={(next) => !next && setConsent(null)}
        features={consent ?? "drive"}
        returnTo={returnTo.current}
      />
    </div>
  );
}

/** Small status chip for a receipt whose photo goes to the traveler's Drive. */
export function DriveChip({ status }: { status: unknown }) {
  if (status === "uploaded")
    return (
      <span className="rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success">
        Di Drive
      </span>
    );
  if (status === "pending" || status === "uploading")
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
        Mengunggah…
      </span>
    );
  if (status === "failed" || status === "revoked")
    return (
      <span className="rounded-full bg-destructive/10 px-1.5 py-px text-[10px] font-semibold text-destructive">
        Belum di Drive
      </span>
    );
  return null;
}
