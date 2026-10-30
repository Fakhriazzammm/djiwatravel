import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Page, BackBar } from "@/components/shell";
import { getDest } from "@/lib/catalog";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";
import { breadcrumbJsonLd, jsonLdScript, productJsonLd, SEO_BASE_URL } from "@/lib/seo";
import { getIndexablePlan } from "@/lib/seo-indexability.fn";

export const Route = createFileRoute("/plan/$id")({
  loader: async ({ params }) => {
    const indexable = await getIndexablePlan(params.id);
    if (!indexable) throw notFound();
    const plan = indexable.package;
    const destination =
      plan.locationCodes.map((code) => getDest(code)).find(Boolean) ?? getDest("ASIA");
    if (!destination) throw notFound();
    return { plan, destination };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ name: "robots", content: "noindex" }] };
    const { plan, destination } = loaderData;
    const id = encodeURIComponent(plan.packageCode);
    const url = `${SEO_BASE_URL}/plan/${id}`;
    const planName = packageDestinationLabel(plan) ?? plan.name;
    const title = `${planName} — eSIM ${destination.nameId} | Djiwa Travel`;
    const description = `${packageDataLabel(plan)}, ${plan.durationDays} hari, untuk ${packageCoverageLabel(plan)}. eSIM Djiwa Travel untuk traveler Indonesia.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        { property: "og:image", content: `${SEO_BASE_URL}/icon-512.png` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: `${SEO_BASE_URL}/icon-512.png` },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        jsonLdScript(
          productJsonLd({
            name: planName,
            description,
            sku: plan.packageCode,
            url,
            priceIdr: plan.priceIdr,
          }),
        ),
        jsonLdScript(
          breadcrumbJsonLd([
            { name: "Beranda", url: `${SEO_BASE_URL}/` },
            { name: "Explore", url: `${SEO_BASE_URL}/explore` },
            {
              name: destination.nameId,
              url: `${SEO_BASE_URL}/destination/${destination.code.toLowerCase()}`,
            },
            { name: planName, url },
          ]),
        ),
      ],
    };
  },
  component: Plan,
});

function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Plan() {
  const { plan, destination } = Route.useLoaderData();
  return (
    <Page>
      <BackBar title={`${destination.flag} ${destination.nameId}`} />
      <article>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">Paket eSIM</p>
        <h1 className="large-title mt-2">{packageDestinationLabel(plan)}</h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Paket eSIM untuk {packageCoverageLabel(plan)} dengan {plan.durationDays} hari masa aktif.
        </p>
        <dl className="mt-6 divide-y divide-border/70 overflow-hidden rounded-2xl bg-surface px-4">
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted-foreground">Kuota</dt>
            <dd className="text-right text-sm font-semibold">{packageDataLabel(plan)}</dd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted-foreground">Masa aktif</dt>
            <dd className="text-right text-sm font-semibold">{plan.durationDays} hari</dd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted-foreground">Kompatibilitas</dt>
            <dd className="max-w-[60%] text-right text-sm font-semibold">
              Ponsel yang mendukung eSIM
            </dd>
          </div>
          <div className="flex min-h-14 items-center justify-between gap-4 py-3">
            <dt className="text-xs text-muted-foreground">Harga</dt>
            <dd className="text-right text-sm font-bold text-brand-red">{rupiah(plan.priceIdr)}</dd>
          </div>
        </dl>
        <section className="mt-8" aria-labelledby="activation-title">
          <h2 id="activation-title" className="text-lg font-bold">
            Cara aktivasi
          </h2>
          <ol className="mt-3 divide-y divide-border/70 rounded-2xl bg-surface px-4 text-sm leading-6 text-muted-foreground">
            <li className="py-3">
              1. Pastikan perangkat mendukung eSIM dan tidak terkunci operator.
            </li>
            <li className="py-3">2. Selesaikan pembelian melalui checkout Djiwa Travel.</li>
            <li className="py-3">
              3. Pasang profil eSIM saat memakai Wi-Fi, lalu aktifkan data eSIM saat tiba.
            </li>
          </ol>
        </section>
        <Link
          to="/checkout/$id"
          params={{ id: plan.packageCode }}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-red px-4 py-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
        >
          Pilih paket ini
        </Link>
        <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
          <Link
            to="/destination/$code"
            params={{ code: destination.code.toLowerCase() }}
            className="rounded-xl bg-secondary px-3 py-2"
          >
            Paket {destination.nameId} lainnya
          </Link>
          <Link to="/panduan" className="rounded-xl bg-secondary px-3 py-2">
            Baca panduan eSIM
          </Link>
        </div>
      </article>
    </Page>
  );
}
