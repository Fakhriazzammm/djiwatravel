import { createFileRoute } from "@tanstack/react-router";

import { buildGuidesFullText } from "@/lib/guide-feed";
import { readGeoConfig } from "@/lib/geo-config.server";
import { travelGuides } from "@/lib/travel-guides";

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { config } = await readGeoConfig();
        if (!config.aiSearchEnabled) return new Response("Not found", { status: 404 });
        return new Response(buildGuidesFullText(travelGuides), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
