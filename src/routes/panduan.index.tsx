import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, BackBar, SectionTitle } from "@/components/shell";
import { travelGuides } from "@/lib/travel-guides";

const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/panduan/")({
  head: () => ({
    meta: [
      { title: "Panduan Travel — Tips eSIM untuk Traveler Indonesia | Djiwa Travel" },
      {
        name: "description",
        content:
          "Panduan praktis menyiapkan eSIM, memilih kuota, dan tetap terhubung saat traveling dari Indonesia.",
      },
      { property: "og:title", content: "Panduan Travel — Djiwa Travel" },
      {
        property: "og:description",
        content: "Tips praktis eSIM dan internet untuk perjalanan dari Indonesia.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${BASE_URL}/panduan` }],
  }),
  component: TravelGuideIndex,
});

function TravelGuideIndex() {
  return (
    <Page>
      <BackBar title="Panduan Travel" />
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">Djiwa Travel</p>
      <h1 className="large-title mt-2">Panduan Travel</h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        Tips singkat dan bisa langsung dipakai untuk menyiapkan internet perjalananmu.
      </p>
      <section className="mt-8" aria-labelledby="guide-list-title">
        <SectionTitle>Artikel terbaru</SectionTitle>
        <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {travelGuides.map((guide) => (
            <article key={guide.slug} className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-red">
                {guide.eyebrow}
              </p>
              <h2 className="mt-2 text-lg font-bold leading-snug">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.description}</p>
              <Link
                to="/panduan/$slug"
                params={{ slug: guide.slug }}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Baca panduan
              </Link>
            </article>
          ))}
        </div>
      </section>
    </Page>
  );
}
