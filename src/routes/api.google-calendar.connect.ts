import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { googleConfigured, parseFeatures, startGoogleConnect } from "@/lib/google-account.server";
import {
  CALENDAR_RETURN_COOKIE,
  GOOGLE_FEATURES_COOKIE,
  isSafeCalendarReturn,
} from "@/lib/calendar-return";

export const Route = createFileRoute("/api/google-calendar/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!googleConfigured())
            return new Response("Google belum dikonfigurasi", { status: 503 });
          const user = await getAuthenticatedUser();
          // ?features=drive,sheets asks only for the extra access; the default stays Calendar.
          const features = parseFeatures(new URL(request.url).searchParams.get("features"));
          const location = await startGoogleConnect(user, features);
          const headers = new Headers({ Location: location });
          headers.append(
            "Set-Cookie",
            `${GOOGLE_FEATURES_COOKIE}=${features.join("-")}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
          );
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
          return new Response(error instanceof Error ? error.message : "Koneksi Google gagal", {
            status: 401,
          });
        }
      },
    },
  },
});
