import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Page, BackBar, StickyCta, btnRed, group } from "@/components/shell";
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
  return <div className="flex justify-between px-4 py-3.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}

function Plan() {
  const { p, d, price } = Route.useLoaderData();
  return (
    <Page tabs={false}>
      <BackBar />
      <p className="text-[17px]">{d.flag} {d.nameId}</p>
      <h1 className="mt-1 text-5xl font-bold tracking-tight">{gbLabel(p.dataGb)}</h1>
      <p className="mt-1 text-muted-foreground">Berlaku {p.days} hari</p>

      <div className={`${group} mt-8`}>
        <Row k="Kuota" v={gbLabel(p.dataGb)} />
        <Row k="Masa berlaku" v={`${p.days} hari`} />
        <Row k="Wilayah" v={d.name} />
        {d.network && <Row k="Jaringan" v={d.network} />}
        <Row k="Top up" v={p.topUp ? "Bisa" : "Tidak tersedia"} />
      </div>

      {p.activationOnConnect && (
        <p className="mt-5 px-1 text-sm text-muted-foreground">
          Masa aktif dimulai saat eSIM pertama kali terhubung ke jaringan di negara tujuan.
        </p>
      )}
      <p className="mt-3 px-1 text-sm text-muted-foreground">Hanya data internet. Nomor WhatsApp-mu tetap bisa dipakai.</p>

      <StickyCta>
        <Link to="/checkout/$id" params={{ id: p.id }} className={btnRed}>Lanjut — {rupiah(price)}</Link>
      </StickyCta>
    </Page>
  );
}
