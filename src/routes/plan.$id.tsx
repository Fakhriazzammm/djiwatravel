import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Page, BackBar, StickyCta, btnRed, group, row } from "@/components/shell";
import { getDest, getPkg, priceOf, gbLabel } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/plan/$id")({
  loader: ({ params }) => {
    const p = getPkg(params.id);
    const d = p && getDest(p.dest);
    if (!p || !d) throw notFound();
    return { p, d, price: priceOf(p) };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.d.nameId} ${gbLabel(loaderData.p.dataGb)} — Djiwa Travel` : "Tidak ditemukan";
    const desc = loaderData ? `${gbLabel(loaderData.p.dataGb)} selama ${loaderData.p.days} hari, ${rupiah(loaderData.price)}.` : "";
    return { meta: [{ title: t }, { name: "description", content: desc }, { property: "og:title", content: t }, { property: "og:description", content: desc }] };
  },
  component: Plan,
});

function Row({ k, v }: { k: string; v: string }) {
  return <div className={row}><span className="text-[14px] text-muted-foreground">{k}</span><span className="truncate text-[14px] font-medium">{v}</span></div>;
}

function Plan() {
  const { p, d, price } = Route.useLoaderData();
  return (
    <Page tabs={false}>
      <BackBar title={`${d.flag} ${d.nameId}`} />
      <div className="rounded-2xl bg-surface p-5 text-center">
        <p className="text-4xl font-bold tracking-tight">{gbLabel(p.dataGb)}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Berlaku {p.days} hari</p>
        <p className="mt-3 text-2xl font-bold text-brand-red">{rupiah(price)}</p>
      </div>

      <div className={`${group} mt-4`}>
        <Row k="Kuota" v={gbLabel(p.dataGb)} />
        <Row k="Masa berlaku" v={`${p.days} hari`} />
        <Row k="Wilayah" v={d.name} />
        {d.network && <Row k="Jaringan" v={d.network} />}
        <Row k="Top up" v={p.topUp ? "Bisa" : "Tidak tersedia"} />
      </div>

      {p.activationOnConnect && (
        <p className="mt-4 px-1 text-[13px] text-muted-foreground">
          Masa aktif dimulai saat eSIM pertama kali terhubung ke jaringan di negara tujuan.
        </p>
      )}
      <p className="mt-2 px-1 text-[13px] text-muted-foreground">Hanya data internet. Nomor WhatsApp-mu tetap bisa dipakai.</p>

      <StickyCta>
        <Link to="/checkout/$id" params={{ id: p.id }} className={btnRed}>Lanjut — {rupiah(price)}</Link>
      </StickyCta>
    </Page>
  );
}
