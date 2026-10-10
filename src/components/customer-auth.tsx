import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { signInGoogle, type BetterAuthUser } from "@/lib/better-auth-client";

const button = "tap min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";

export function CustomerAuth({ onAuthenticated: _onAuthenticated }: { onAuthenticated: (user: BetterAuthUser) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`${button} w-full bg-brand-red text-white sm:w-auto`}>Masuk atau daftar</button>
      </DialogTrigger>
      {open && <AuthChoice />}
    </Dialog>
  );
}

function AuthChoice() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function googleLogin() {
    setGoogleLoading(true);
    setError("");
    try { await signInGoogle(`${window.location.origin}/profile`); }
    catch { setError("Google gagal. Coba lagi."); }
    finally { setGoogleLoading(false); }
  }

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl">
      <DialogTitle>Selamat datang</DialogTitle>
      <DialogDescription>Simpan pesanan dan eSIM dalam satu akun.</DialogDescription>
      <div className="space-y-2 pt-2">
        <button type="button" className={`${button} flex w-full items-center justify-center gap-2 bg-brand-red text-white`} disabled={googleLoading} onClick={() => void googleLogin()}>
          <svg aria-hidden="true" focusable="false" data-icon="google" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
            <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
            <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z" />
          </svg>
          {googleLoading ? "Menghubungkan…" : "Lanjutkan dengan Google"}
        </button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </DialogContent>
  );
}
