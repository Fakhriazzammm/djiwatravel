import { createFileRoute } from "@tanstack/react-router";
import { requireBetterAuthUser } from "@/lib/customer-profile.server";
import { googleCalendarStatus } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await googleCalendarStatus(await requireBetterAuthUser()), { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Status Calendar gagal" }, { status: 401 });
        }
      },
    },
  },
});
