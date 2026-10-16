import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { BackBar, Page, SectionTitle } from "@/components/shell";
import { getListableDestinations } from "@/lib/destination-availability.server";
import { travelGuides } from "@/lib/travel-guides";

const BASE_URL = "https://djiwatravel.com";
const PAGE_URL = `${BASE_URL}/esim-untuk-traveler-indonesia`;

export const Route = createFileRoute("/esim-untuk-traveler-indonesia")({
  loader: () => getListableDestinations(2_000),
  head: () => ({
    meta: [
      { title: "eSIM untuk Traveler Indonesia — Internet Saat Traveling | Djiwa Travel" },
      {
        name: "description",
        content:
          "Pilih eSIM untuk perjalanan luar negeri sesuai destinasi, kuota, dan masa aktif. Bandingkan paket Djiwa Travel dan tetap terhubung saat traveling.",
      },
      { property: "og:title", content: "eSIM untuk Traveler Indonesia — Djiwa Travel" },
      {
        property: "og:description",
        content: "Pilih eSIM untuk perjalanan luar negeri sesuai destinasi, kuota, dan masa aktif.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:image", content: `${BASE_URL}/og/default.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "eSIM untuk Traveler Indonesia — Djiwa Travel" },
      {
        name: "twitter:description",
        content: "Pilih eSIM sesuai destinasi, kuota, dan masa aktif perjalananmu.",
      },
      { name: "twitter:image", content: `${BASE_URL}/og/default.png` },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              name: "eSIM untuk Traveler Indonesia",
              description:
                "Panduan memilih eSIM untuk perjalanan luar negeri sesuai destinasi, kuota, dan masa aktif.",
              url: PAGE_URL,
              inLanguage: "id-ID",
              isPartOf: { "@type": "WebSite", name: "Djiwa Travel", url: BASE_URL },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Beranda", item: BASE_URL },
                { "@type": "ListItem", position: 2, name: "eSIM untuk Traveler Indonesia", item: PAGE_URL },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: EsimTravelerLanding,
});

const selectionFactors = [
  ["Destinasi", "Pastikan negara atau wilayah perjalananmu tercakup oleh paket yang dipilih."],
  ["Durasi perjalanan", "Sesuaikan masa aktif dengan lama perjalanan agar pilihan paket lebih relevan."],
  ["Kebutuhan data", "Pertimbangkan aktivitas seperti peta, pesan, terjemahan, dan unggah foto."],
  ["Perangkat dan pemasangan", "Cek dukungan eSIM di ponsel dan siapkan pemasangan sebelum berangkat."],
] as const;

function EsimTravelerLanding() {
  const destinations = Route.useLoaderData();
  const guides = travelGuides.slice(0, 3);

  return (
    <Page>
      <BackBar title="Djiwa Travel" />
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">Djiwa Travel</p>
      <h1 className="large-title mt-2">eSIM untuk Traveler Indonesia</h1>
      <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
        Siapkan koneksi internet untuk perjalanan luar negeri dengan memilih destinasi, kuota, dan
        masa aktif yang sesuai dengan rencana perjalananmu.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/explore" className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
          Cari paket eSIM
        </Link>
        <Link to="/finder" className="rounded-xl bg-secondary px-4 py-3 text-sm font-bold">
          Bingung pilih paket?
        </Link>
      </div>

      <section className="mt-9" aria-labelledby="how-to-choose-title">
        <SectionTitle><span id="how-to-choose-title">Cara memilih eSIM</span></SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {selectionFactors.map(([title, body]) => (
            <article key={title} className="rounded-2xl bg-surface p-4 shadow-sm">
              <h2 className="font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-9" aria-labelledby="destination-links-title">
        <SectionTitle action={<Link to="/explore">Lihat semua ›</Link>}>
          <span id="destination-links-title">Pilih berdasarkan destinasi</span>
        </SectionTitle>
        <p className="mb-3 text-sm leading-6 text-muted-foreground">
          Buka halaman destinasi untuk melihat katalog yang tersedia saat ini. Ketersediaan dan detail
          paket mengikuti katalog Djiwa Travel.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {destinations.slice(0, 10).map((destination) => (
            <Link
              key={destination.code}
              to="/destination/$code"
              params={{ code: destination.code.toLowerCase() }}
              className="tap flex min-h-11 items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm"
            >
              <span className="text-2xl" aria-hidden="true">{destination.flag}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{destination.nameId}</span>
                <span className="block text-xs text-muted-foreground">
                  {destination.region === "Regional" ? "Paket regional" : "Paket negara"}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-9" aria-labelledby="how-it-works-title">
        <SectionTitle><span id="how-it-works-title">Cara mulai</span></SectionTitle>
        <ol className="grid gap-3 sm:grid-cols-2">
          {[
            "Pilih destinasi dan buka paket yang tersedia.",
            "Bandingkan kuota dan masa aktif sesuai rencana perjalanan.",
            "Lanjutkan ke checkout dengan metode pembayaran yang tampil di halaman transaksi.",
            "Ikuti instruksi pemasangan eSIM yang diterima setelah pembelian.",
          ].map((step, index) => (
            <li key={step} className="rounded-2xl bg-secondary p-4 text-sm leading-6">
              <span className="mr-2 font-bold text-brand-red">{index + 1}.</span>{step}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-9" aria-labelledby="guide-links-title">
        <SectionTitle action={<Link to="/panduan">Lihat semua ›</Link>}>
          <span id="guide-links-title">Panduan untuk perjalanan</span>
        </SectionTitle>
        <div className="grid gap-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              to="/panduan/$slug"
              params={{ slug: guide.slug }}
              className="tap flex min-h-11 items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{guide.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{guide.description}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
