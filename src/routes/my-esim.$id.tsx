import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, QrCode, Plus, Headphones } from "lucide-react";
import { Page, BackBar, group, row } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { getDest, getPkg, gbLabel, topUps } from "@/lib/catalog";
import { rupiah, sellingPrice } from "@/lib/pricing";
import { useOrders } from "@/lib/orders";

export const Route = createFileRoute("/my-esim/$id")({
  head: () => ({
    meta: [
      { title: "Detail eSIM — Djiwa Travel" },
      { name: "description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { property: "og:title", content: "Detail eSIM — Djiwa Travel" },
      { property: "og:description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const orders = useOrders();
  const [tab, setTab] = useState<"none" | "install" | "topup">("none");
  const [tech, setTech] = useState(false);
  const o = orders?.find((x) => x.id === id);
  if (!orders) return <Page><div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" /></Page>;
  if (!o || !o.esim) return <Page><BackBar /><p className="mt-10 text-center text-muted-foreground">eSIM tidak ditemukan.</p></Page>;
  const p = getPkg(o.packageId)!;
  const d = getDest(p.dest)!;
  const total = typeof p.dataGb === "number" ? p.dataGb : null;
  const left = total ? total - (o.usedGb ?? 0) : null;
  const exp = new Date(o.createdAt + p.days * 864e5).toLocaleDateString("id-ID", { day: "numeric", month: "long" });

  return (
    <Page>
      <BackBar title={`${d.flag} ${d.nameId}`} />
      <div className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted-foreground">Kuota tersisa</p>
        <p className="text-3xl font-bold">{left !== null ? `${left.toFixed(1)} GB` : "Unlimited"}</p>
        {total && left !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(left / total) * 100}%` }} />
          </div>
        )}
        {left !== null && left < 1 && <p className="mt-2 text-sm text-brand-red">Kuotamu hampir habis.</p>}
      </div>

      <div className={`${group} mt-4`}>
        {[["Paket", `${gbLabel(p.dataGb)} · ${p.days} hari`], ["Berlaku sampai", `±${exp}`], ["Status", "Siap dipasang"], ...(d.network ? [["Jaringan", d.network]] : [])].map(([k, v]) => (
          <div key={k} className={row}><span className="text-[14px] text-muted-foreground">{k}</span><span className="truncate text-[14px] font-medium">{v}</span></div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { id: "install", l: "Instalasi", i: QrCode, on: () => setTab(tab === "install" ? "none" : "install") },
          { id: "topup", l: "Top Up", i: Plus, on: () => setTab(tab === "topup" ? "none" : "topup"), off: !p.topUp },
          { id: "support", l: "Support", i: Headphones, on: () => window.open("https://wa.me/", "_blank") },
        ].map(({ id, l, i: I, on, off }) => (
          <button key={id} disabled={off} onClick={on}
            className={`tap flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold disabled:opacity-40 ${tab === id ? "bg-brand-red-soft text-brand-red" : "bg-surface"}`}>
            <I className="size-5" strokeWidth={1.8} />{l}
          </button>
        ))}
      </div>

      {tab === "install" && (
        <div className="mt-6 space-y-6"><EsimQr esim={o.esim} /><InstallGuide /></div>
      )}
      {tab === "topup" && (
        <div className={`${group} mt-6`}>
          {topUps.map((t) => (
            <div key={t.id} className={row}>
              <span className="font-semibold">+{t.gb} GB</span>
              <span className="text-muted-foreground">{rupiah(sellingPrice(t.supplierUsd, p.dest))}</span>
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-muted-foreground">Pembayaran top up via QRIS segera tersedia.</p>
        </div>
      )}

      <button onClick={() => setTech(!tech)} className="mt-6 flex h-11 w-full items-center justify-between rounded-2xl bg-surface px-4 text-[14px] text-muted-foreground">
        Detail Teknis <ChevronDown className={`size-4 transition ${tech ? "rotate-180" : ""}`} />
      </button>
      {tech && <div className="mt-3"><ManualDetails esim={o.esim} iccid /></div>}
      <Link to="/my-esim" className="sr-only">My eSIM</Link>
    </Page>
  );
}
