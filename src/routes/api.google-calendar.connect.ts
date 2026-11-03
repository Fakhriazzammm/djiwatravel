import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { googleCalendarConfigured, startGoogleCalendarConnect } from "@/lib/google-calendar.server";
import { CALENDAR_RETURN_COOKIE, isSafeCalendarReturn } from "@/lib/calendar-return";

export const Route = createFileRoute("/api/google-calendar/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!googleCalendarConfigured()) return new Response("Google Calendar belum dikonfigurasi", { status: 503 });
          const user = await getAuthenticatedUser();
          const location = await startGoogleCalendarConnect(user);
          const headers = new Headers({ Location: location });
          // Coming from a trip page: come back there after Google, not to the profile.
          const returnTo = new URL(request.url).searchParams.get("returnTo");
          if (isSafeCalendarReturn(returnTo)) {
            headers.append(
              "Set-Cookie",
              `${CALENDAR_RETURN_COOKIE}=${encodeURIComponent(returnTo)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
            );
          }
          return new Response(null, { status: 302, headers });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Koneksi Google Calendar gagal", { status: 401 });
        }
      },
    },
  },
});
