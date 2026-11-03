import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

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
};

/** Google Calendar connection, as a bottom sheet opened from the "Kalender" tile. */
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
  } = props;
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
        className="mx-auto max-w-md rounded-t-[28px] px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-3"
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
            <SheetTitle className="text-[19px] font-semibold tracking-tight">
              Google Calendar
            </SheetTitle>
            {!loading && connected && (
              <p className="truncate text-sm font-medium text-success">
                Terhubung{account ? ` · ${account}` : ""}
              </p>
            )}
          </div>
        </div>
        <SheetDescription className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Agenda perjalanan disinkronkan otomatis.{" "}
          {connected && "Event yang sudah tersinkron tetap ada jika koneksi diputus."}
        </SheetDescription>
        {!loading && message && (
          <p
            role={messageKind === "error" ? "alert" : "status"}
            className={`mt-3 text-[13px] ${messageClass}`}
          >
            {message}
          </p>
        )}
        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Memeriksa koneksi…</p>
          ) : !signedIn ? (
            <p className="text-sm text-muted-foreground">Masuk untuk menghubungkan kalender.</p>
          ) : statusError ? (
            <p role="alert" className="text-sm text-destructive">
              Status kalender belum tersedia. Muat ulang halaman untuk mencoba lagi.
            </p>
          ) : connected ? (
            <>
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
                {busy ? "Memproses…" : "Putuskan koneksi"}
              </button>
            </>
          ) : (
            <a
              href="/api/google-calendar/connect"
              className="tap flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-red text-[14px] font-semibold text-white"
            >
              Hubungkan Google Calendar
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
    </Sheet>
  );
}
