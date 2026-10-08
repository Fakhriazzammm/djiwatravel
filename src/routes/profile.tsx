import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { getBetterAuthSession, signOutBetterAuth, type BetterAuthUser } from "@/lib/better-auth-client";
import { Page, Wordmark, group, row, label } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
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
  const item = row;
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  useEffect(() => { void getBetterAuthSession().then((session) => setUser(session?.user ?? null)).catch(() => setUser(null)); }, []);
  return (
    <Page>
      <h1 className="large-title pt-4">Profil</h1>
      <div className="mt-4 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold">{user?.name?.slice(0, 1).toUpperCase() || "T"}</div>
          <div className="min-w-0 flex-1"><p className="font-semibold">{user?.name || "Traveler"}</p><p className="text-sm text-muted-foreground">{user?.email || "Masuk untuk menyimpan pesananmu"}</p></div>
          {user ? <button className="tap rounded-xl p-2 text-muted-foreground" aria-label="Keluar" onClick={() => { void signOutBetterAuth().then(() => setUser(null)); }}><LogOut className="size-5" /></button> : null}
        </div>
        {!user && <div className="mt-4"><CustomerAuth onAuthenticated={setUser} /></div>}
      </div>

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
