import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page, BackBar, btnPrimary, group } from "@/components/shell";
import { destinations, gbLabel, priceOf } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";
import { recommend, usageProfiles, type Usage } from "@/lib/recommend";

export const Route = createFileRoute("/finder")({
  head: () => ({
    meta: [
      { title: "Cari Paket yang Cocok — Djiwa Travel" },
      { name: "description", content: "Masukkan tujuan, tanggal, dan kebutuhan — kami pilihkan paketnya." },
      { property: "og:title", content: "Cari Paket yang Cocok — Djiwa Travel" },
      { property: "og:description", content: "Masukkan tujuan, tanggal, dan kebutuhan — kami pilihkan paketnya." },
    ],
  }),
  component: Finder,
});

function Finder() {
  const [dest, setDest] = useState("JP");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [usage, setUsage] = useState<Usage>("normal");
  const days = from && to ? Math.max(1, Math.round((+new Date(to) - +new Date(from)) / 864e5) + 1) : 0;
  const rec = days ? recommend(dest, days, usage).best : null;
  const field = "w-full bg-transparent px-4 py-3.5 text-[17px] outline-none";

  return (
    <Page>
      <BackBar title="Cari Paket" />
      <h1 className="large-title">Cari Paket yang Cocok</h1>
      <div className={`${group} mt-4`}>
        <select className={field} value={dest} onChange={(e) => setDest(e.target.value)}>
          {destinations.map((d) => <option key={d.code} value={d.code}>{d.flag} {d.nameId}</option>)}
        </select>
        <label className="flex items-center px-4"><span className="w-20 text-muted-foreground">Berangkat</span><input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center px-4"><span className="w-20 text-muted-foreground">Pulang</span><input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
        {(Object.keys(usageProfiles) as Usage[]).map((k) => (
          <button key={k} onClick={() => setUsage(k)} className={`rounded-lg py-2 text-sm font-medium ${usage === k ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>{usageProfiles[k].label}</button>
        ))}
      </div>

      {rec && (
        <div className="mt-8 rounded-2xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">{days} hari perjalanan · Rekomendasi</p>
          <p className="mt-1 text-3xl font-bold">{gbLabel(rec.dataGb)} / {rec.days} hari</p>
          <p className="mt-2 text-sm">Cocok untuk {usageProfiles[usage].fit}.</p>
          <Link to="/plan/$id" params={{ id: rec.id }} className={`${btnPrimary} mt-5`}>Pilih — {rupiah(priceOf(rec))}</Link>
        </div>
      )}
    </Page>
  );
}
