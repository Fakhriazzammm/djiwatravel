import { createFileRoute } from "@tanstack/react-router";

import { buildLlmsTxt } from "@/lib/geo";
import { readGeoConfig } from "@/lib/geo-config.server";
import { travelGuides } from "@/lib/travel-guides";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { config } = await readGeoConfig();
        if (!config.aiSearchEnabled) return new Response("Not found", { status: 404 });
        const destinations = await import("@/lib/destination-availability.server")
          .then((m) => m.getListableDestinations(5_000))
          .catch(() => []);
        const body = buildLlmsTxt({
          destinations: destinations.map((d) => ({ code: d.code, nameId: d.nameId })),
          guides: travelGuides.map((g) => ({
            slug: g.slug,
            title: g.title,
            description: g.description,
          })),
        });
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
