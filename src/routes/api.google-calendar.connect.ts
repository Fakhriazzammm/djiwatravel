import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { googleCalendarConfigured, startGoogleCalendarConnect } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/connect")({
  server: {
    handlers: {
      GET: async () => {
        try {
          if (!googleCalendarConfigured()) return new Response("Google Calendar belum dikonfigurasi", { status: 503 });
          const user = await getAuthenticatedUser();
          return Response.redirect(await startGoogleCalendarConnect(user), 302);
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Koneksi Google Calendar gagal", { status: 401 });
        }
      },
    },
  },
});
