import { createFileRoute } from "@tanstack/react-router";

import { buildRobotsTxt } from "@/lib/geo";
import { readGeoConfig } from "@/lib/geo-config.server";

/** Dynamic so Admin can open/close AI crawler access without a deploy. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { config } = await readGeoConfig();
        return new Response(buildRobotsTxt(config), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
