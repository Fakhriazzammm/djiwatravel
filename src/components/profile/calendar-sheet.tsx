import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { GoogleConsentSheet } from "@/components/google-consent-sheet";
import { driveIsOn, googleConnectHref, type GoogleStatus } from "@/lib/google-status";

export type CalendarSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  loading: boolean;
  statusError: boolean;
  connected: boolean;
  account: string | null;
  message: string | null;
  messageKind: "success" | "warning" | "error";
  syncIssue: boolean;
  busy: boolean;
  onRetrySync: () => void;
  onDisconnect: () => void;
  /** Drive and Sheets state next to Calendar; absent while loading or before they exist. */
  google?: GoogleStatus | null;
  /** Called after a Drive toggle or retry so the status is read again. */
  onGoogleChanged?: () => void;
};

const tileClass = "grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold";
const rowClass =
  "flex min-h-12 items-center gap-2.5 border-t border-border/60 px-3 py-2 first:border-t-0";
const pillClass = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold";
const smallBtn =
  "tap min-h-9 shrink-0 rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold disabled:opacity-50";

/** Google connection (Calendar, Drive, Sheets) as a bottom sheet opened from the "Google" tile. */
export function CalendarSheet(props: CalendarSheetProps) {
  const {
    open,
    onOpenChange,
    signedIn,
    loading,
    statusError,
    connected,
    account,
    message,
    messageKind,
    syncIssue,
    busy,
    onRetrySync,
    onDisconnect,
    google,
    onGoogleChanged,
  } = props;
  const [consent, setConsent] = useState<null | "drive" | "sheets">(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const driveCall = async (action: "enable" | "disable" | "retry") => {
    setDriveBusy(true);
    try {
      await fetch("/api/google-drive", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setDriveBusy(false);
      onGoogleChanged?.();
    }
  };
  const anyGoogle = connected || Boolean(google?.googleConnected);
  const messageClass =
    messageKind === "success"
      ? "text-success"
      : messageKind === "error"
        ? "text-destructive"
        : "text-amber-700";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-[28px] px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-3"
      >
        <div className="mx-auto mb-4 h-1.5 w-9 rounded-full bg-border" aria-hidden="true" />
        <div className="flex items-center gap-3.5">
          <img
            src="/assets/profile/profile-calendar-v2.jpg"
            alt=""
            width={56}
            height={56}
            className="size-10 object-contain mix-blend-multiply"
          />
          <div className="min-w-0">
            <SheetTitle className="text-[19px] font-semibold tracking-tight">Google</SheetTitle>
            {!loading && anyGoogle && (
              <p className="truncate text-sm font-medium text-success">
                Terhubung{account ? ` · ${account}` : ""}
              </p>
            )}
          </div>
        </div>
        <SheetDescription className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Agenda ke Calendar, foto struk ke Drive-mu, dan budget ke Sheets. Datamu tetap milikmu.{" "}
          {anyGoogle && "File dan event yang sudah dibuat tetap ada jika koneksi diputus."}
        </SheetDescription>
        {!loading && message && (
          <p
            role={messageKind === "error" ? "alert" : "status"}
            className={`mt-3 text-[13px] ${messageClass}`}
          >
            {message}
          </p>
        )}
        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memeriksa koneksi…</p>
          ) : !signedIn ? (
            <p className="text-sm text-muted-foreground">Masuk untuk menghubungkan kalender.</p>
          ) : statusError ? (
            <p role="alert" className="text-sm text-destructive">
              Status kalender belum tersedia. Muat ulang halaman untuk mencoba lagi.
            </p>
          ) : anyGoogle ? (
            <>
              {google?.needsReconnect && (
                <div
                  role="alert"
                  className="rounded-xl bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
                >
                  Akses Google dicabut. {google.drive.revoked} struk dan {google.sheets.revoked}{" "}
                  ekspor menunggu. Data pengeluaranmu tidak berubah.
                  <a
                    href={googleConnectHref("drive,sheets")}
                    className="tap mt-2 flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-semibold text-white"
                  >
                    Hubungkan ulang
                  </a>
                </div>
              )}
              <div className="overflow-hidden rounded-2xl bg-surface" data-testid="google-features">
                <div className={rowClass}>
                  <span className={`${tileClass} bg-blue-100 text-blue-700`}>Ka</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">Kalender</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {google?.features.calendar === false && !connected
                        ? "Jadwal trip ke Google Calendar"
                        : "Jadwal trip tersinkron"}
                    </p>
                  </div>
                  {connected ? (
                    <span className={`${pillClass} bg-success/15 text-success`}>Aktif</span>
                  ) : (
                    <a
                      href={googleConnectHref("calendar")}
                      className={`${smallBtn} flex items-center`}
                    >
                      Aktifkan
                    </a>
                  )}
                </div>
                <div className={rowClass}>
                  <span className={`${tileClass} bg-amber-100 text-amber-700`}>Dr</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">Drive</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {!google?.features.drive
                        ? "Foto struk disimpan di Drive-mu"
                        : !google.driveEnabled
                          ? "Dijeda · struk baru tetap di Djiwa"
                          : google.drive.failed > 0
                            ? `${google.drive.failed} struk gagal diunggah`
                            : google.drive.pending > 0
                              ? `${google.drive.pending} struk menunggu`
                              : `${google.drive.uploaded} struk di folder Djiwa Travel`}
                    </p>
                  </div>
                  {!google?.features.drive ? (
                    <button type="button" className={smallBtn} onClick={() => setConsent("drive")}>
                      Aktifkan
                    </button>
                  ) : google.drive.failed > 0 ? (
                    <button
                      type="button"
                      disabled={driveBusy}
                      className={smallBtn}
                      onClick={() => void driveCall("retry")}
                    >
                      {driveBusy ? "Mencoba…" : "Coba lagi"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={driveIsOn(google)}
                      aria-label="Simpan struk ke Drive"
                      disabled={driveBusy}
                      onClick={() => void driveCall(google.driveEnabled ? "disable" : "enable")}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${driveIsOn(google) ? "bg-brand-red" : "bg-border"}`}
                    >
                      <span
                        className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${driveIsOn(google) ? "left-[18px]" : "left-0.5"}`}
                      />
                    </button>
                  )}
                </div>
                <div className={rowClass}>
                  <span className={`${tileClass} bg-green-100 text-green-700`}>Sh</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">Sheets</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {google?.features.sheets
                        ? google.sheets.failed > 0
                          ? `${google.sheets.failed} ekspor gagal · buka Biaya`
                          : "Aktifkan ekspor per trip di halaman Biaya"
                        : "Budget trip jadi spreadsheet"}
                    </p>
                  </div>
                  {google?.features.sheets ? (
                    <span className={`${pillClass} bg-success/15 text-success`}>Siap</span>
                  ) : (
                    <button type="button" className={smallBtn} onClick={() => setConsent("sheets")}>
                      Aktifkan
                    </button>
                  )}
                </div>
              </div>
              {syncIssue && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRetrySync}
                  className="tap min-h-10 w-full rounded-xl bg-brand-red text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Menyinkronkan…" : "Coba sinkronkan lagi"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onDisconnect}
                className="tap min-h-12 w-full rounded-2xl bg-secondary text-[16px] font-semibold text-destructive disabled:opacity-50"
              >
                {busy ? "Memproses…" : "Putuskan Google"}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                File di Drive dan Sheets-mu tidak dihapus.
              </p>
            </>
          ) : (
            <a
              href="/api/google-calendar/connect"
              className="tap flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-semibold text-white"
            >
              Hubungkan Google
            </a>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="tap min-h-10 w-full rounded-xl text-[14px] font-semibold text-muted-foreground"
          >
            Tutup
          </button>
        </div>
      </SheetContent>
      <GoogleConsentSheet
        open={consent !== null}
        onOpenChange={(next) => !next && setConsent(null)}
        features={consent ?? "drive"}
      />
    </Sheet>
  );
}
