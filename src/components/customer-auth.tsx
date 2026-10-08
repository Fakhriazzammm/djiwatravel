import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getBetterAuthSession, signInEmail, signInGoogle, signUpEmail, type BetterAuthUser } from "@/lib/better-auth-client";

const button = "tap min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const input = "mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-base";

export function CustomerAuth({ onAuthenticated }: { onAuthenticated: (user: BetterAuthUser) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`${button} w-full bg-brand-red text-white sm:w-auto`}>Masuk atau daftar</button>
      </DialogTrigger>
      {open && <AuthChoice onAuthenticated={(user) => { setOpen(false); onAuthenticated(user); }} />}
    </Dialog>
  );
}

function AuthChoice({ onAuthenticated }: { onAuthenticated: (user: BetterAuthUser) => void }) {
  const [emailMode, setEmailMode] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  async function googleLogin() {
    setGoogleLoading(true);
    setError("");
    try { await signInGoogle(`${window.location.origin}/profile`); }
    catch { setError("Google gagal. Coba lagi atau gunakan email."); }
    finally { setGoogleLoading(false); }
  }

  return (
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl">
      <DialogTitle>{emailMode ? "Masuk atau daftar" : "Selamat datang"}</DialogTitle>
      <DialogDescription>{emailMode ? "Gunakan akun Djiwa Travel untuk melanjutkan." : "Simpan pesanan dan eSIM dalam satu akun."}</DialogDescription>
      {!emailMode ? <div className="space-y-2 pt-2">
        <button type="button" className={`${button} w-full bg-brand-red text-white`} disabled={googleLoading} onClick={() => void googleLogin()}>{googleLoading ? "Menghubungkan…" : "Lanjutkan dengan Google"}</button>
        <button type="button" className={`${button} w-full border bg-background`} onClick={() => setEmailMode(true)}>Lanjutkan dengan email</button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div> : <EmailAuthForm onAuthenticated={onAuthenticated} onBack={() => { setEmailMode(false); setError(""); }} />}
      {error && emailMode && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  );
}

function EmailAuthForm({ onBack, onAuthenticated }: { onBack: () => void; onAuthenticated: (user: BetterAuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return; setLoading(true); setError("");
    try {
      if (mode === "register") await signUpEmail(name.trim(), email.trim(), password); else await signInEmail(email.trim(), password);
      const session = await getBetterAuthSession(); if (!active.current) return;
      if (!session?.user?.id) { setError("Sesi belum aktif. Silakan coba lagi."); return; }
      onAuthenticated(session.user);
    } catch { if (active.current) setError(mode === "register" ? "Pendaftaran gagal. Periksa data lalu coba lagi." : "Masuk gagal. Periksa email dan kata sandi."); }
    finally { if (active.current) setLoading(false); }
  }
  return <div className="space-y-4 pt-2">
    <div className="flex items-center justify-center gap-1 rounded-xl bg-secondary p-1" aria-label="Mode akun">
      {(["login", "register"] as const).map((value) => <button key={value} type="button" disabled={loading} aria-pressed={mode === value} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold ${mode === value ? "bg-background shadow-sm" : "text-muted-foreground"}`} onClick={() => { setMode(value); setError(""); }}>{value === "login" ? "Masuk" : "Daftar"}</button>)}
    </div>
    <form onSubmit={submit} className="space-y-3" aria-busy={loading}>
      {mode === "register" && <label className="block text-sm font-medium">Nama<input className={input} name="name" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={loading} /></label>}
      <label className="block text-sm font-medium">Email<input className={input} name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} /></label>
      <label className="block text-sm font-medium">Kata sandi<input className={input} name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} /></label>
      {mode === "register" && <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className={`${button} w-full bg-brand-red text-white`}>{loading ? "Memverifikasi…" : mode === "login" ? "Masuk" : "Buat akun"}</button>
      <button type="button" className="min-h-11 w-full text-sm font-semibold text-muted-foreground" onClick={onBack}>‹ Pilih metode lain</button>
    </form>
  </div>;
}
