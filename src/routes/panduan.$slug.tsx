import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackBar, Page, SectionTitle } from "@/components/shell";
import { getTravelGuide } from "@/lib/travel-guides";

const BASE_URL = "https://djiwatravel.com";

export const Route = createFileRoute("/panduan/$slug")({
  loader: ({ params }) => {
    const guide = getTravelGuide(params.slug);
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ name: "robots", content: "noindex" }] };
    const url = `${BASE_URL}/panduan/${loaderData.slug}`;
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: loaderData.title,
      description: loaderData.description,
      datePublished: loaderData.publishedAt,
      dateModified: loaderData.updatedAt,
      inLanguage: "id-ID",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Organization", name: "Djiwa Travel", url: BASE_URL },
      publisher: { "@type": "Organization", name: "Djiwa Travel", url: BASE_URL },
    };
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Beranda", item: BASE_URL },
        { "@type": "ListItem", position: 2, name: "Panduan Travel", item: `${BASE_URL}/panduan` },
        { "@type": "ListItem", position: 3, name: loaderData.title, item: url },
      ],
    };
    return {
      meta: [
        { title: `${loaderData.title} | Djiwa Travel` },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "id_ID" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(articleSchema) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbSchema) },
      ],
    };
  },
  component: TravelGuideDetail,
});

function TravelGuideDetail() {
  const guide = Route.useLoaderData();
  return (
    <Page>
      <BackBar title="Panduan Travel" />
      <article>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">
          {guide.eyebrow}
        </p>
        <h1 className="large-title mt-2">{guide.heading}</h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{guide.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {guide.readTime} · Diperbarui {guide.updatedAt}
        </p>
        <div className="mt-8 space-y-5 text-[15px] leading-7 text-foreground">
          {guide.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <section className="mt-8" aria-labelledby="guide-steps-title">
          <SectionTitle>Yang perlu disiapkan</SectionTitle>
          <ol className="space-y-3">
            {guide.steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl bg-surface p-4 shadow-sm">
                <h2 className="font-bold">
                  <span className="mr-2 text-brand-red">{index + 1}.</span>
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-8" aria-labelledby="related-destinations-title">
          <SectionTitle>Tujuan terkait</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {guide.relatedDestinations.map((destination) => (
              <Link
                key={destination.code}
                to="/destination/$code"
                params={{ code: destination.code }}
                className="rounded-xl bg-secondary px-3.5 py-2.5 text-sm font-semibold"
              >
                {destination.label}
              </Link>
            ))}
          </div>
        </section>
        <section className="mt-8 rounded-2xl bg-primary p-5 text-primary-foreground">
          <h2 className="text-lg font-bold">Siap tetap terhubung?</h2>
          <p className="mt-2 text-sm leading-6 text-primary-foreground/85">
            Pilih tujuanmu dan siapkan eSIM sebelum berangkat.
          </p>
          <Link
            to="/explore"
            className="mt-4 inline-flex rounded-xl bg-background px-4 py-2.5 text-sm font-bold text-foreground"
          >
            Lihat semua destinasi
          </Link>
        </section>
      </article>
    </Page>
  );
}
