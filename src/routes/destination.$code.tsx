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
      <BackBar />
      <span className="text-5xl">{d.flag}</span>
      <h1 className="large-title mt-3">Internet untuk perjalananmu ke {d.nameId}</h1>

      <h2 className="mt-8 text-[17px] font-semibold">Berapa lama kamu pergi?</h2>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1">
        {durations.map((x) => (
          <button key={x.id} onClick={() => setDur(x)}
            className={`rounded-lg py-2 text-[13px] font-medium ${dur.id === x.id ? "bg-surface shadow-sm" : "text-muted-foreground"}`}>
            {x.label}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-[17px] font-semibold">Internetnya dipakai untuk apa?</h2>
      <div className="mt-3 space-y-2">
        {(Object.keys(usageProfiles) as Usage[]).map((k) => (
          <button key={k} onClick={() => setUsage(k)}
            className={`tap flex w-full items-center justify-between rounded-2xl border-2 bg-surface px-4 py-3 text-left ${usage === k ? "border-brand-red" : "border-transparent"}`}>
            <div>
              <p className="font-semibold">{usageProfiles[k].label}</p>
              <p className="text-sm text-muted-foreground">{usageProfiles[k].desc}</p>
            </div>
            <span className={`size-5 rounded-full border-2 ${usage === k ? "border-[6px] border-brand-red" : ""}`} />
          </button>
        ))}
      </div>

      <h2 className="mt-8 text-[20px] font-bold">Pilihan untuk perjalananmu</h2>
      <div className="mt-3 rounded-2xl bg-surface p-5 shadow-sm">
        <span className="rounded-full bg-brand-red-soft px-2.5 py-1 text-xs font-semibold text-brand-red">Rekomendasi</span>
        <p className="mt-3 text-4xl font-bold tracking-tight">{gbLabel(best.dataGb)}</p>
        <p className="text-muted-foreground">{best.days} hari</p>
        <p className="mt-3 text-sm">Cocok untuk {usageProfiles[usage].fit}.</p>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-2xl font-bold">{rupiah(priceOf(best))}</p>
        </div>
        <Link to="/plan/$id" params={{ id: best.id }} className={`${btnPrimary} mt-4`}>Pilih Paket</Link>
      </div>

      <h3 className="mt-8 mb-3 font-semibold text-muted-foreground">Pilihan lainnya</h3>
      <div className="grid grid-cols-2 gap-3">
        {others.map((p) => (
          <Link key={p.id} to="/plan/$id" params={{ id: p.id }} className="tap rounded-2xl bg-surface p-4">
            <p className="text-xl font-bold">{gbLabel(p.dataGb)}</p>
            <p className="text-sm text-muted-foreground">{p.days} hari</p>
            <p className="mt-3 font-semibold">{rupiah(priceOf(p))}</p>
          </Link>
        ))}
      </div>
    </Page>
  );
}
