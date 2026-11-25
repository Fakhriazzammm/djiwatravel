import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, BackBar, SectionTitle } from "@/components/shell";
import { formatTravelGuideDate, getNewestTravelGuides } from "@/lib/travel-guides";
import { breadcrumbJsonLd } from "@/lib/seo";

const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/panduan/")({
  head: () => {
    const indexImage = getNewestTravelGuides(1)[0]?.image ?? "/icon-512.png";
    return {
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Panduan Travel Djiwa Travel",
            url: `${BASE_URL}/panduan`,
            inLanguage: "id-ID",
            mainEntity: {
              "@type": "ItemList",
              itemListElement: getNewestTravelGuides().map((guide, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: `${BASE_URL}/panduan/${guide.slug}`,
                name: guide.title,
              })),
            },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Beranda", url: BASE_URL },
              { name: "Panduan Travel", url: `${BASE_URL}/panduan` },
            ]),
          ),
        },
      ],
      meta: [
        { title: "Panduan Travel: Transportasi, eSIM & Tax Refund Jepang | Djiwa Travel" },
        {
          name: "description",
          content:
            "Panduan praktis untuk traveler Indonesia: transportasi bandara dan kereta kota, memilih eSIM, dan memahami tax refund Jepang.",
        },
        {
          property: "og:title",
          content: "Panduan Travel: Transportasi, eSIM & Tax Refund Jepang — Djiwa Travel",
        },
        {
          property: "og:description",
          content:
            "Siapkan perjalanan dengan panduan transportasi, eSIM, dan tax refund Jepang untuk traveler Indonesia.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${BASE_URL}/panduan` },
        { property: "og:image", content: `${BASE_URL}${indexImage}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: `${BASE_URL}${indexImage}` },
      ],
      links: [
        { rel: "canonical", href: `${BASE_URL}/panduan` },
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "Panduan Djiwa Travel",
          href: `${BASE_URL}/panduan/feed.xml`,
        },
      ],
    };
  },
  component: TravelGuideIndex,
});

function TravelGuideIndex() {
  const newestGuides = getNewestTravelGuides();

  return (
    <Page>
      <BackBar title="Panduan Travel" />
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">Djiwa Travel</p>
      <h1 className="text-[22px] font-bold leading-tight tracking-tight mt-2">Panduan Travel</h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        Panduan transportasi, internet perjalanan, dan belanja untuk liburan ke luar negeri.
      </p>
      <section className="mt-4" aria-labelledby="guide-list-title">
        <SectionTitle>Artikel terbaru</SectionTitle>
        <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
          {newestGuides.map((guide) => (
            <article key={guide.slug} className="p-4">
              {guide.image && (
                <img
                  src={guide.image}
                  alt={guide.imageAlt ?? ""}
                  width={1200}
                  height={800}
                  loading="lazy"
                  className="mb-4 aspect-[3/2] w-full rounded-xl object-cover"
                />
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-brand-red">
                {guide.eyebrow}
              </p>
              <h2 className="mt-2 text-lg font-bold leading-snug">{guide.title}</h2>
              <time
                dateTime={guide.publishedAt}
                className="mt-1 block text-xs font-medium text-muted-foreground"
              >
                Terbit {formatTravelGuideDate(guide.publishedAt)}
              </time>
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
