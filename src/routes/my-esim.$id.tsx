import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, QrCode, Plus, Headphones } from "lucide-react";
import { Page, BackBar, group, row } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { getDest, getPkg, gbLabel, topUps } from "@/lib/catalog";
import { rupiah, sellingPrice } from "@/lib/pricing";
import { cancelOrder, markInstalled, retryProvisioning, useOrders } from "@/lib/orders";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";

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
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const o = orders?.find((x) => x.id === id);
  if (!orders) return <Page><div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" /></Page>;
  if (!o) return <Page><BackBar /><p className="mt-10 text-center text-muted-foreground">eSIM tidak ditemukan.</p></Page>;
  const status = effectiveOrderStatus(o.status, o.expiresAt);
  const canInstall = Boolean(o.esim) && (status === "READY" || status === "INSTALLED");
  const p = getPkg(o.packageId)!;
  const d = getDest(p.dest)!;
  const total = typeof p.dataGb === "number" ? p.dataGb : null;
  const left = total ? total - (o.usedGb ?? 0) : null;
  const exp = new Date(o.createdAt + p.days * 864e5).toLocaleDateString("id-ID", { day: "numeric", month: "long" });

  return (
    <Page>
      <BackBar title={`${d.flag} ${d.nameId}`} />
      <div className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted-foreground">Status eSIM</p>
        <p className="text-xl font-bold">{ORDER_STATUS_LABEL[status]}</p>
        <p className="mt-4 text-sm text-muted-foreground">Kuota tersisa</p>
        <p className="text-3xl font-bold">{left !== null ? `${left.toFixed(1)} GB` : "Unlimited"}</p>
        {total && left !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(left / total) * 100}%` }} />
          </div>
        )}
        {left !== null && left < 1 && <p className="mt-2 text-sm text-brand-red">Kuotamu hampir habis.</p>}
      </div>

      {status === "PROVISIONING_FAILED" && (
        <div className="mt-4 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-4">
          <p className="font-semibold">Pemrosesan belum berhasil</p>
          <p className="mt-1 text-sm text-muted-foreground">Kami dapat mencoba memproses pesanan ini kembali tanpa membuat order ganda.</p>
          <button type="button" className="mt-3 rounded-xl bg-brand-red px-4 py-2 text-sm font-semibold text-white" onClick={() => { retryProvisioning(o.id); setActionMessage("Permintaan pemrosesan ulang dikirim."); }}>Coba lagi</button>
        </div>
      )}
      {(status === "ORDER_CREATED" || status === "WAITING_PAYMENT") && (
        <button type="button" className="mt-4 w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold" onClick={() => { cancelOrder(o.id); setActionMessage("Pesanan dibatalkan."); }}>Batalkan pesanan</button>
      )}
      {status === "READY" && (
        <button type="button" className="mt-4 w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold" onClick={() => { markInstalled(o.id); setActionMessage("Status eSIM ditandai sudah terpasang."); }}>Tandai sudah terpasang</button>
      )}
      {actionMessage && <p className="mt-3 text-center text-sm text-muted-foreground">{actionMessage}</p>}

      <div className={`${group} mt-4`}>
        {[["Paket", `${gbLabel(p.dataGb)} · ${p.days} hari`], ["Berlaku sampai", `±${exp}`], ["Status", ORDER_STATUS_LABEL[status]], ...(d.network ? [["Jaringan", d.network]] : [])].map(([k, v]) => (
          <div key={k} className={row}><span className="text-[14px] text-muted-foreground">{k}</span><span className="truncate text-[14px] font-medium">{v}</span></div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { id: "install", l: "Instalasi", i: QrCode, on: () => setTab(tab === "install" ? "none" : "install"), off: !canInstall },
          { id: "topup", l: "Top Up", i: Plus, on: () => setTab(tab === "topup" ? "none" : "topup"), off: !p.topUp },
          { id: "support", l: "Support", i: Headphones, on: () => window.open("https://wa.me/", "_blank") },
        ].map(({ id, l, i: I, on, off }) => (
          <button key={id} disabled={off} onClick={on}
            className={`tap flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold disabled:opacity-40 ${tab === id ? "bg-brand-red-soft text-brand-red" : "bg-surface"}`}>
            <I className="size-5" strokeWidth={1.8} />{l}
          </button>
        ))}
      </div>

      {tab === "install" && canInstall && o.esim && (
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
      {tech && o.esim && <div className="mt-3"><ManualDetails esim={o.esim} iccid /></div>}
      <Link to="/my-esim" className="sr-only">My eSIM</Link>
    </Page>
  );
}
