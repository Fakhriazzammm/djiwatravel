import { createFileRoute } from "@tanstack/react-router";

import { buildGuideRss } from "@/lib/guide-feed";
import { travelGuides } from "@/lib/travel-guides";

export const Route = createFileRoute("/panduan/feed.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildGuideRss(travelGuides), {
          headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
