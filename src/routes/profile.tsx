import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Page, Wordmark, group } from "@/components/shell";
import { useOrders } from "@/lib/orders";
import { getDest, getPkg } from "@/lib/catalog";
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
  const item = "flex items-center justify-between px-4 py-3.5";
  return (
    <Page>
      <h1 className="large-title pt-6">Profil</h1>
      <div className="mt-6 flex items-center gap-4 rounded-2xl bg-surface p-4">
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-xl font-semibold">T</div>
        <div className="flex-1"><p className="font-semibold">Traveler</p><p className="text-sm text-muted-foreground">Masuk untuk menyimpan pesananmu</p></div>
      </div>

      <h2 className="mt-8 mb-2 px-1 text-sm font-medium text-muted-foreground">Riwayat Pesanan</h2>
      <div className={group}>
        {orders.length === 0 && <p className="px-4 py-3.5 text-muted-foreground">Belum ada pesanan.</p>}
        {orders.map((o) => {
          const p = getPkg(o.packageId); const d = p && getDest(p.dest);
          return (
            <Link key={o.id} to="/order/$id" params={{ id: o.id }} className={item}>
              <span>{d?.flag} {d?.nameId} <span className="text-xs text-muted-foreground">#{o.id}</span></span>
              <span className="text-sm text-muted-foreground">{rupiah(o.amount)}</span>
            </Link>
          );
        })}
      </div>

      <div className={`${group} mt-6`}>
        {["Bantuan", "Syarat & Ketentuan", "Kebijakan Privasi"].map((l) => (
          <div key={l} className={item}><span>{l}</span><ChevronRight className="size-5 text-muted-foreground" /></div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Wordmark className="mx-auto h-16" />
        <p className="mt-1 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
      </div>
    </Page>
  );
}
