import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, Wordmark, btnPrimary } from "@/components/shell";
import { getDest, getPkg, gbLabel } from "@/lib/catalog";
import { useOrders, type Order } from "@/lib/orders";

export const Route = createFileRoute("/my-esim/")({
  head: () => ({
    meta: [
      { title: "My eSIM — Djiwa Travel" },
      { name: "description", content: "Semua eSIM perjalananmu di satu tempat." },
      { property: "og:title", content: "My eSIM — Djiwa Travel" },
      { property: "og:description", content: "Semua eSIM perjalananmu di satu tempat." },
    ],
  }),
  component: MyEsim,
});

export function EsimCard({ o }: { o: Order }) {
  const p = getPkg(o.packageId)!;
  const d = getDest(p.dest)!;
  const total = typeof p.dataGb === "number" ? p.dataGb : null;
  const left = total ? total - (o.usedGb ?? 0) : null;
  const pct = total && left !== null ? Math.round((left / total) * 100) : 100;
  const ready = o.status === "READY";
  return (
    <Link to={ready ? "/my-esim/$id" : "/order/$id"} params={{ id: o.id }} className="tap block rounded-2xl bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{d.flag}</span>
        <div className="flex-1">
          <p className="font-semibold">{d.nameId}</p>
          <p className="text-sm text-muted-foreground">{gbLabel(p.dataGb)} · {p.days} hari</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-success/15 text-success" : "bg-brand-red-soft text-brand-red"}`}>
          {ready ? "Siap" : o.status === "WAITING_PAYMENT" ? "Belum bayar" : "Diproses"}
        </span>
      </div>
      {ready && (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${pct < 20 ? "bg-brand-red" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span>{left !== null ? `${left.toFixed(1)} GB tersisa` : "Unlimited"}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
        </>
      )}
    </Link>
  );
}

function MyEsim() {
  const orders = useOrders();
  const ready = orders?.filter((o) => o.status === "READY") ?? [];
  const pending = orders?.filter((o) => o.status !== "READY" && o.status !== "REFUNDED") ?? [];
  return (
    <Page>
      <h1 className="large-title pt-4">My eSIM</h1>
      {orders === null ? (
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-secondary" />
      ) : orders.length === 0 ? (
        <div className="mt-24 text-center">
          <Wordmark className="mx-auto h-20" />
          <p className="mt-2 text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
          <p className="mt-6">Belum ada eSIM. Mau pergi ke mana?</p>
          <Link to="/explore" className={`${btnPrimary} mt-6`}>Cari Destinasi</Link>
        </div>
      ) : (
        <>
          {ready.length > 0 && <Section title="Siap dipakai" items={ready} />}
          {pending.length > 0 && <Section title="Menunggu" items={pending} />}
        </>
      )}
    </Page>
  );
}

function Section({ title, items }: { title: string; items: Order[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-3">{items.map((o) => <EsimCard key={o.id} o={o} />)}</div>
    </section>
  );
}
