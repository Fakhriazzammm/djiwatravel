import { createFileRoute } from "@tanstack/react-router";
import { requireBetterAuthUser } from "@/lib/customer-profile.server";
import { disconnectGoogleCalendar } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/disconnect")({
  server: {
    handlers: {
      POST: async () => {
        try {
          await disconnectGoogleCalendar(await requireBetterAuthUser());
          return Response.json({ ok: true, eventsKept: true });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Calendar belum diputus" }, { status: 401 });
        }
      },
    },
  },
});
