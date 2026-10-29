import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { signInGoogle } from "@/lib/better-auth-client";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";

const button = "tap min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";

/** `compact` is the header slot: never full width, so it cannot stretch a nav bar. */
export function CustomerAuth({ size = "block" }: { size?: "block" | "compact" }) {
  const [open, setOpen] = useState(false);
  const layout = size === "compact" ? "shrink-0 px-3 py-2 text-[13px]" : "w-full sm:w-auto";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`${button} ${layout} bg-brand-red text-white`}>
          Masuk atau daftar
        </button>
      </DialogTrigger>
      {open && <AuthChoice />}
    </Dialog>
  );
}

function AuthChoice() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const googleLabel = useStagedLabel(googleLoading, ACTION_STAGES.auth);

  async function googleLogin() {
    setGoogleLoading(true);
    setError("");
    try {
      const currentUrl = new URL(window.location.href);
      await signInGoogle(
        `${currentUrl.origin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    } catch {
      setError("Google gagal. Coba lagi.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <DialogContent
      overlayClassName="bg-black/35 backdrop-blur-[2px]"
      className="bottom-0 left-0 top-auto max-h-[90dvh] w-full max-w-none translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-[28px] rounded-b-none border-x-0 border-b-0 border-t border-border/70 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.12)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-h-[min(90dvh,32rem)] sm:w-[calc(100%-2rem)] sm:max-w-sm sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:border sm:p-6 sm:shadow-xl sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0"
    >
      <div
        aria-hidden="true"
        className="mx-auto mb-1 h-1 w-9 rounded-full bg-muted-foreground/30 sm:hidden"
      />
      <div className="space-y-1.5">
        <DialogTitle className="text-xl font-bold tracking-tight">
          Satu akun untuk perjalananmu
        </DialogTitle>
        <DialogDescription className="text-[14px] leading-6">
          Masuk atau buat akun untuk menyimpan perjalanan, pesanan, dan eSIM. Djiwa Pay memakai akun
          yang sama.
        </DialogDescription>
      </div>
      <div className="space-y-2 pt-1">
        <button
          type="button"
          className={`${button} flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          disabled={googleLoading}
          onClick={() => void googleLogin()}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            data-icon="google"
            className="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"
            />
          </svg>
          {googleLoading ? googleLabel : "Lanjutkan dengan Google"}
        </button>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Akun baru dibuat otomatis saat pertama kali masuk.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </DialogContent>
  );
}
