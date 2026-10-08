import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getBetterAuthSession, signInEmail, signInGoogle, signUpEmail, type BetterAuthUser } from "@/lib/better-auth-client";

const button = "tap min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-base";

export function CustomerAuth({ onAuthenticated }: { onAuthenticated: (user: BetterAuthUser) => void }) {
  const [open, setOpen] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

  async function googleLogin() {
    setGoogleLoading(true);
    setGoogleError("");
    try {
      await signInGoogle(`${window.location.origin}/profile`);
    } catch {
      setGoogleError("Masuk dengan Google gagal. Silakan coba lagi atau gunakan email.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-col gap-2">
        <button type="button" className={`${button} bg-brand-red text-white`} disabled={googleLoading} onClick={() => void googleLogin()}>
          {googleLoading ? "Menghubungkan…" : "Masuk dengan Google"}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><button type="button" className={`${button} bg-secondary`}>Masuk / daftar dengan email</button></DialogTrigger>
          {open && <EmailAuthForm onCancel={() => setOpen(false)} onAuthenticated={(user) => { setOpen(false); onAuthenticated(user); }} />}
        </Dialog>
      </div>
      {googleError && <p role="alert" className="mt-2 max-w-sm text-sm text-destructive">{googleError}</p>}
    </div>
  );
}

function EmailAuthForm({ onCancel, onAuthenticated }: { onCancel: () => void; onAuthenticated: (user: BetterAuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "register") await signUpEmail(name.trim(), email.trim(), password);
      else await signInEmail(email.trim(), password);
      const session = await getBetterAuthSession();
      if (!active.current) return;
      if (!session?.user?.id) {
        setError(mode === "register"
          ? "Akun telah dibuat, tetapi sesi belum aktif. Jika verifikasi email diperlukan, periksa emailmu lalu masuk."
          : "Sesi belum aktif. Silakan coba masuk lagi dan pastikan browser mengizinkan cookie autentikasi.");
        return;
      }
      onAuthenticated(session.user);
    } catch {
      // Keep upstream details (which may contain internal information) out of the UI.
      if (active.current) setError(mode === "register"
        ? "Pendaftaran gagal. Periksa data atau coba masuk jika email sudah terdaftar."
        : "Masuk gagal. Periksa email dan kata sandi, lalu coba lagi.");
    } finally {
      if (active.current) setLoading(false);
    }
  }

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl">
      <DialogTitle>{mode === "login" ? "Masuk dengan email" : "Daftar akun"}</DialogTitle>
      <DialogDescription>Gunakan akun Djiwa Travel untuk menyimpan pesananmu.</DialogDescription>
      <div className="flex gap-2" aria-label="Pilihan autentikasi">
        {(["login", "register"] as const).map((value) => <button key={value} type="button" disabled={loading} aria-pressed={mode === value} className={`${button} flex-1 ${mode === value ? "bg-brand-red text-white" : "bg-secondary"}`} onClick={() => { setMode(value); setError(""); setPassword(""); }}>{value === "login" ? "Masuk" : "Daftar"}</button>)}
      </div>
      <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
        {mode === "register" && <label className="block text-sm font-medium">Nama<input className={input} name="name" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={loading} /></label>}
        <label className="block text-sm font-medium">Email<input className={input} name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} /></label>
        <label className="block text-sm font-medium">Kata sandi<input className={input} name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} /></label>
        {mode === "register" && <p className="text-sm text-muted-foreground">Gunakan minimal 8 karakter untuk kata sandi.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={loading} className={`${button} w-full bg-brand-red text-white`}>{loading ? "Memverifikasi sesi…" : mode === "login" ? "Masuk dengan email" : "Buat akun"}</button>
        <button type="button" className={`${button} w-full bg-secondary`} onClick={onCancel}>Batal</button>
      </form>
    </DialogContent>
  );
}
