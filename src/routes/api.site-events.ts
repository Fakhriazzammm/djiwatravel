import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 1024;

export const Route = createFileRoute("/api/site-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store" };
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) {
            return Response.json({ error: "Terlalu besar" }, { status: 413, headers });
          }
          const { recordSiteEvent } = await import("@/lib/site-events.server");
          return Response.json(await recordSiteEvent(JSON.parse(text)), { headers });
        } catch {
          return Response.json({ error: "Event tidak valid" }, { status: 400, headers });
        }
      },
    },
  },
});
