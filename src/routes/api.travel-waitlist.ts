import { createFileRoute } from "@tanstack/react-router";
import { joinTravelWaitlist } from "@/lib/travel-waitlist.server";

export const Route = createFileRoute("/api/travel-waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return Response.json(await joinTravelWaitlist(await request.json()), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const status = (error as { status?: number }).status ?? 400;
          return Response.json(
            { error: error instanceof Error ? error.message : "Pendaftaran belum berhasil" },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
