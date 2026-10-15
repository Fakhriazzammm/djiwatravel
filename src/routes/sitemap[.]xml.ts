import { createFileRoute } from "@tanstack/react-router";

          ...travelGuideSlugs.map((slug) => urlEntry(`/panduan/${slug}`, "0.7", "monthly")),
          ...destinations.map((destination) =>
            urlEntry(`/destination/${destination.code.toLowerCase()}`, "0.8", "weekly"),
          ),

const BASE_URL = "https://djiwatravel.com";

/** Public pages that should be indexed. Order matters only for readability. */
const STATIC_PATHS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/explore", priority: "0.9", changefreq: "daily" },
  { path: "/panduan", priority: "0.8", changefreq: "weekly" },
  { path: "/profile", priority: "0.3", changefreq: "monthly" },
];

function urlEntry(path: string, priority: string, changefreq: string) {
  return [
    "  <url>",
    `    <loc>${BASE_URL}${path}</loc>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

/**
 * XML sitemap: the storefront is a search-driven business (people Google "eSIM Jepang"), so
 * every destination page needs a discoverable URL. Generated from the same destination list
 * the app renders, so it cannot drift from the catalogue.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const entries = [
          ...STATIC_PATHS.map(({ path, priority, changefreq }) =>
            urlEntry(path, priority, changefreq),
          ),
<<<<<<< HEAD
          ...destinations.map((destination) =>
=======
          ...travelGuideSlugs.map((slug) => urlEntry(`/panduan/${slug}`, "0.7", "monthly")),
          ...indexed.map((destination) =>
>>>>>>> 60c2974b (feat(seo): add Indonesian travel guides)
            urlEntry(`/destination/${destination.code.toLowerCase()}`, "0.8", "weekly"),
          ),
        ];
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...entries,
          "</urlset>",
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
