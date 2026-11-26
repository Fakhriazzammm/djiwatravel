import { createFileRoute } from "@tanstack/react-router";

import { getListableDestinations } from "@/lib/destination-availability.server";
import { PUBLIC_FLIGHT_ROUTES } from "@/lib/public-flight-fares";
import { publicFlightFaresEnabled } from "@/lib/public-flight-fares.server";
import { PUBLIC_SEARCH_PAGES } from "@/lib/public-search-pages";
import { getNewestTravelGuides } from "@/lib/travel-guides";
import { getIndexablePlans } from "@/lib/seo-indexability.server";
import { listIndexableTemplateSlugs } from "@/lib/trip-templates.server";
import { SEO_BASE_URL } from "@/lib/seo";

function urlEntry(path: string, lastmod?: string) {
  return [
    "  <url>",
    `    <loc>${SEO_BASE_URL}${path}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    "  </url>",
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [destinations, plans, flights, templates] = await Promise.allSettled([
          getListableDestinations(5_000),
          getIndexablePlans(5_000),
          publicFlightFaresEnabled(),
          listIndexableTemplateSlugs(),
        ]);
        const entries = [
          ...PUBLIC_SEARCH_PAGES.map(({ path }) => urlEntry(path)),
          ...(flights.status === "fulfilled" && flights.value
            ? [
                urlEntry("/tiket"),
                ...PUBLIC_FLIGHT_ROUTES.map(({ slug }) => urlEntry(`/tiket/${slug}`)),
              ]
            : []),
          ...getNewestTravelGuides().map((guide) =>
            urlEntry(`/panduan/${guide.slug}`, guide.updatedAt),
          ),
          ...(destinations.status === "fulfilled" ? destinations.value : []).map((destination) =>
            urlEntry(`/destination/${destination.code.toLowerCase()}`),
          ),
          ...(plans.status === "fulfilled" ? plans.value : []).map(({ package: plan }) =>
            urlEntry(`/plan/${encodeURIComponent(plan.packageCode)}`),
          ),
          ...(templates.status === "fulfilled" ? templates.value : []).map((slug) =>
            urlEntry(`/template/${encodeURIComponent(slug)}`),
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
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
