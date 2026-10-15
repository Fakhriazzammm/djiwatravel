import { createFileRoute } from "@tanstack/react-router";

import { getListableDestinations } from "@/lib/destination-availability.server";
import { travelGuideSlugs } from "@/lib/travel-guides";

const BASE_URL = "https://djiwatravel.com";

/** Public pages that should be indexed. Order matters only for readability. */
const STATIC_PATHS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/explore", priority: "0.9", changefreq: "daily" },
  { path: "/panduan", priority: "0.8", changefreq: "weekly" },
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
      GET: async () => {
        // Only advertise destinations that actually have a sellable package; a sitemap full of
        // "belum ada paket live" pages hurts search quality. A degraded provider read keeps the
        // full list rather than publishing an almost-empty sitemap. The list rule is shared with
        // Explore so a regional destination (Asia) is indexed exactly when it is listed.
        const indexed = await getListableDestinations(5_000);
        const entries = [
          ...STATIC_PATHS.map(({ path, priority, changefreq }) =>
            urlEntry(path, priority, changefreq),
          ),
          ...travelGuideSlugs.map((slug) => urlEntry(`/panduan/${slug}`, "0.7", "monthly")),
          ...indexed.map((destination) =>
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
