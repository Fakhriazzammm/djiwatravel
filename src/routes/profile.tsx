import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Eye, EyeOff, LogIn, LogOut } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getBetterAuthSession, signInEmail, signInGoogle, signOutBetterAuth, signUpEmail, type BetterAuthUser } from "@/lib/better-auth-client";
import { Page, Wordmark, group, row, label } from "@/components/shell";
import { useOrders } from "@/lib/orders";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profil — Djiwa Travel" },
      { name: "description", content: "Akun, riwayat pesanan, dan bantuan Djiwa Travel." },
      { property: "og:title", content: "Profil — Djiwa Travel" },
      { property: "og:description", content: "Akun, riwayat pesanan, dan bantuan Djiwa Travel." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const orders = useOrders() ?? [];
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void getBetterAuthSession().then((session) => setUser(session?.user ?? null)).catch(() => setUser(null)); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = register ? await signUpEmail(name.trim(), email.trim(), password) : await signInEmail(email.trim(), password);
      setUser(result?.user ?? (await getBetterAuthSession())?.user ?? null); setPassword(""); setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Autentikasi gagal"); }
    finally { setBusy(false); }
  }
  return (
    <Page>
      <h1 className="large-title pt-4">Profil</h1>
      <div className="mt-4 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold">{user?.name?.slice(0, 1).toUpperCase() || "T"}</div>
          <div className="min-w-0 flex-1"><p className="font-semibold">{user?.name || "Traveler"}</p><p className="text-sm text-muted-foreground">{user?.email || "Masuk untuk menyimpan pesananmu"}</p></div>
          {user ? <button className="tap rounded-xl p-2 text-muted-foreground" aria-label="Keluar" onClick={() => { void signOutBetterAuth().then(() => setUser(null)); }}><LogOut className="size-5" /></button> : <button className="tap rounded-xl bg-brand-red px-3 py-2 text-sm font-semibold text-white" onClick={() => setOpen(true)}><LogIn className="mr-1 inline size-4" />Masuk</button>}
        </div>
        {!user && <button className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-semibold" onClick={() => { setRegister(true); setOpen(true); }}>Daftar akun</button>}
      </div>
      {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-3xl bg-background p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">{register ? "Daftar akun" : "Masuk ke Djiwa Travel"}</h2><button className="text-2xl text-muted-foreground" onClick={() => setOpen(false)} aria-label="Tutup">×</button></div><form className="space-y-3" onSubmit={submit}>{register && <input className="w-full rounded-xl border bg-surface px-3 py-3" placeholder="Nama" value={name} onChange={(event) => setName(event.target.value)} required />}<input className="w-full rounded-xl border bg-surface px-3 py-3" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required /><div className="relative"><input className="w-full rounded-xl border bg-surface px-3 py-3 pr-12" type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><button type="button" className="absolute right-3 top-3 text-muted-foreground" onClick={() => setShowPassword((value) => !value)} aria-label="Tampilkan password">{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div>{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-brand-red py-3 font-semibold text-white disabled:opacity-50">{busy ? "Memproses…" : register ? "Daftar" : "Masuk"}</button></form><div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />atau<span className="h-px flex-1 bg-border" /></div><button className="w-full rounded-xl border py-3 font-semibold" onClick={() => void signInGoogle(`${window.location.origin}/profile`)}>Lanjut dengan Google</button><button className="mt-4 w-full text-sm text-muted-foreground" onClick={() => { setRegister((value) => !value); setError(""); }}>{register ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}</button></div></div>}

      <h2 className={`${label} mt-6`}>Riwayat Pesanan</h2>
      <div className={group}>
        {orders.length === 0 && (
          <p className="px-4 py-3.5 text-muted-foreground">Belum ada pesanan.</p>
        )}
        {orders.map((o) => {
          return (
            <Link key={o.id} to="/order/$id" params={{ id: o.id }} className={item}>
              <span className="min-w-0 truncate text-[14px]">
                🌐 {o.packageName ?? o.packageId}{" "}
                <span className="text-[12px] text-muted-foreground">
                  #{o.publicOrderCode ?? o.id.slice(0, 8)}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{rupiah(o.amount)}</span>
            </Link>
          );
        })}
      </div>

      <div className={`${group} mt-6`}>
        {["Bantuan", "Syarat & Ketentuan", "Kebijakan Privasi"].map((l) => (
          <div key={l} className={item}>
            <span className="text-[14px]">{l}</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Wordmark className="mx-auto h-16" />
        <p className="mt-1 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
      </div>
    </Page>
  );
}
