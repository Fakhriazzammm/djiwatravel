import { SEO_BASE_URL } from "./seo";
import type { TravelGuide } from "./travel-guides";

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

/** RSS 2.0 feed of travel guides (newest first); lets readers, aggregators and AI crawlers discover new articles. */
export function buildGuideRss(guides: readonly TravelGuide[]): string {
  const sorted = [...guides].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const items = sorted.map((g) => {
    const url = `${SEO_BASE_URL}/panduan/${g.slug}`;
    return [
      "    <item>",
      `      <title>${esc(g.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${rfc822(g.publishedAt)}</pubDate>`,
      `      <category>${esc(g.eyebrow)}</category>`,
      `      <description>${esc(g.summary ?? g.description)}</description>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Panduan Travel Djiwa Travel</title>",
    `    <link>${SEO_BASE_URL}/panduan</link>`,
    "    <description>Panduan transportasi, eSIM, internet perjalanan, dan persiapan liburan untuk traveler Indonesia.</description>",
    "    <language>id-ID</language>",
    `    <atom:link href="${SEO_BASE_URL}/panduan/feed.xml" rel="self" type="application/rss+xml" />`,
    ...(sorted[0] ? [`    <lastBuildDate>${rfc822(sorted[0].updatedAt)}</lastBuildDate>`] : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Full plain-text corpus of the guides for answer engines (served at /llms-full.txt). */
export function buildGuidesFullText(guides: readonly TravelGuide[]): string {
  const blocks = guides.map((g) =>
    [
      `## ${g.title}`,
      `URL: ${SEO_BASE_URL}/panduan/${g.slug}`,
      `Terbit: ${g.publishedAt} · Diperbarui: ${g.updatedAt}`,
      "",
      ...(g.summary ? [`Jawaban singkat: ${g.summary}`, ""] : []),
      ...g.paragraphs.flatMap((p) => [p, ""]),
      "Langkah:",
      ...g.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`),
      ...(g.faqs?.length
        ? ["", "FAQ:", ...g.faqs.flatMap((f) => [`T: ${f.question}`, `J: ${f.answer}`])]
        : []),
      ...(g.sources?.length
        ? ["", "Sumber:", ...g.sources.map((s) => `- ${s.label}: ${s.url}`)]
        : []),
      "",
    ].join("\n"),
  );
  return [
    "# Djiwa Travel: panduan lengkap",
    "",
    "> Teks lengkap panduan travel Djiwa Travel untuk mesin pencari AI. Harga dan stok paket tidak ada di sini; lihat halaman destinasi untuk data live.",
    "",
    ...blocks,
  ].join("\n");
}
