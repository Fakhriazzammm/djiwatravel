import { Link } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";
import type { ReactNode } from "react";

export const SUPPORT_URL = "https://wa.me/6285156399831";
export const BASE_URL = "https://djiwatravel.com";

export function publicTrustHead(title: string, description: string, path: string) {
  const url = `${BASE_URL}${path}`;
  return {
    meta: [
      { title: `${title} | Djiwa Travel` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | Djiwa Travel` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: `${BASE_URL}/og/default.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${title} | Djiwa Travel` },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: `${BASE_URL}/og/default.png` },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              name: title,
              description,
              url,
              inLanguage: "id-ID",
              isPartOf: { "@type": "WebSite", name: "Djiwa Travel", url: BASE_URL },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Beranda", item: BASE_URL },
                { "@type": "ListItem", position: 2, name: title, item: url },
              ],
            },
          ],
        }),
      },
    ],
  };
}

export function TrustPage({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <Page>
      <BackBar title="Djiwa Travel" />
      <main>
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">{eyebrow}</p>
        )}
        <h1 className="large-title mt-2 text-balance">{title}</h1>
        <div className="mt-5 space-y-7 text-[15px] leading-7 text-muted-foreground">{children}</div>
        <TrustNotice />
        <TrustLinks />
      </main>
    </Page>
  );
}

export function TrustSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title}>
      <h2 id={title} className="text-[18px] font-bold leading-6 text-foreground">
        {title}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function TrustNotice() {
  return (
    <p className="mt-8 rounded-2xl bg-secondary px-4 py-3 text-[13px] leading-6 text-muted-foreground">
      Informasi ini perlu ditinjau dan dapat diperbarui. Untuk pertanyaan yang terkait pesanan atau
      kondisi tertentu, hubungi dukungan Djiwa Travel sebelum mengambil keputusan.
    </p>
  );
}

export function TrustLinks() {
  return (
    <footer className="mt-7 border-t pt-5 text-[13px] leading-6 text-muted-foreground">
      <p className="font-semibold text-foreground">Informasi Djiwa Travel</p>
      <nav aria-label="Tautan informasi publik" className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <Link className="text-brand-red" to="/tentang-djiwa-travel">
          Tentang Djiwa Travel
        </Link>
        <Link className="text-brand-red" to="/bantuan-esim">
          Bantuan eSIM
        </Link>
        <Link className="text-brand-red" to="/kebijakan-refund">
          Kebijakan refund
        </Link>
        <Link className="text-brand-red" to="/syarat-ketentuan">
          Syarat & ketentuan
        </Link>
        <Link className="text-brand-red" to="/kebijakan-privasi">
          Kebijakan privasi
        </Link>
        <Link className="text-brand-red" to="/kontak">
          Kontak
        </Link>
      </nav>
      <a
        className="mt-3 inline-block text-brand-red"
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
      >
        Hubungi dukungan via WhatsApp
      </a>
    </footer>
  );
}
