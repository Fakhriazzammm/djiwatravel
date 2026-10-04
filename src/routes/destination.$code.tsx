import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Page, BackBar, btnPrimary } from "@/components/shell";
import { getDest, priceOf, gbLabel } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";
import { durations, recommend, usageProfiles, type Usage } from "@/lib/recommend";

export const Route = createFileRoute("/destination/$code")({
  loader: ({ params }) => {
    const d = getDest(params.code);
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `eSIM ${loaderData.nameId} — Djiwa Travel` : "Tidak ditemukan";
    const desc = loaderData ? `Internet untuk perjalananmu ke ${loaderData.nameId}. Bayar QRIS, langsung aktif.` : "";
    return { meta: [{ title: t }, { name: "description", content: desc }, { property: "og:title", content: t }, { property: "og:description", content: desc }] };
  },
  component: Destination,
});

function Destination() {
  const d = Route.useLoaderData();
  const [dur, setDur] = useState(durations[1]!);
  const [usage, setUsage] = useState<Usage>("normal");
  const { best, others } = recommend(d.code, dur.days, usage);

  return (
    <Page>
      <BackBar title={`${d.flag} ${d.nameId}`} />
      <h1 className="large-title">Internet untuk perjalananmu ke {d.nameId}</h1>

      <h2 className="mt-6 text-[15px] font-semibold">Berapa lama kamu pergi?</h2>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1">
        {durations.map((x) => (
          <button key={x.id} onClick={() => setDur(x)}
            className={`rounded-lg py-2 text-[12px] font-medium ${dur.id === x.id ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>
            {x.label}
          </button>
        ))}
      </div>

      <h2 className="mt-5 text-[15px] font-semibold">Internetnya dipakai untuk apa?</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(usageProfiles) as Usage[]).map((k) => (
          <button key={k} onClick={() => setUsage(k)}
            className={`tap flex h-20 flex-col items-center justify-center rounded-2xl border-2 bg-surface px-2 text-center ${usage === k ? "border-brand-red bg-brand-red-soft" : "border-transparent"}`}>
            <span className="text-[14px] font-semibold">{usageProfiles[k].label}</span>
            <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{usageProfiles[k].desc}</span>
          </button>
        ))}
      </div>

      <h2 className="mt-7 text-[18px] font-bold">Pilihan untuk perjalananmu</h2>
      <div className="mt-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="rounded-full bg-brand-red-soft px-2.5 py-1 text-[11px] font-semibold text-brand-red">Rekomendasi</span>
            <p className="mt-2 text-3xl font-bold tracking-tight">{gbLabel(best.dataGb)}</p>
            <p className="text-[13px] text-muted-foreground">{best.days} hari</p>
          </div>
          <p className="shrink-0 pt-7 text-xl font-bold">{rupiah(priceOf(best))}</p>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">Cocok untuk {usageProfiles[usage].fit}.</p>
        <Link to="/plan/$id" params={{ id: best.id }} className={`${btnPrimary} mt-4`}>Pilih Paket</Link>
      </div>

      <h3 className="mt-7 mb-3 text-[15px] font-semibold text-muted-foreground">Pilihan lainnya</h3>
      <div className="grid grid-cols-2 gap-3">
        {others.map((p) => (
          <Link key={p.id} to="/plan/$id" params={{ id: p.id }} className="tap flex flex-col rounded-2xl bg-surface p-4">
            <span className="text-lg font-bold">{gbLabel(p.dataGb)}</span>
            <span className="text-[12px] text-muted-foreground">{p.days} hari</span>
            <span className="mt-2 text-[15px] font-semibold text-brand-red">{rupiah(priceOf(p))}</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
