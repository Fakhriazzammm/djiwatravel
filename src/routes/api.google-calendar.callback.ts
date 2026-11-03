import { createFileRoute } from "@tanstack/react-router";
import { finishGoogleCalendarConnect } from "@/lib/google-calendar.server";
import { CALENDAR_RETURN_COOKIE, isSafeCalendarReturn, readCookie } from "@/lib/calendar-return";

function redirectTo(request: Request, profileQuery: string) {
  const base = process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com";
  const back = readCookie(request.headers.get("cookie"), CALENDAR_RETURN_COOKIE);
  const target = isSafeCalendarReturn(back)
    ? `${base}${back}${back.includes("?") ? "&" : "?"}${profileQuery}`
    : `${base}/profile?${profileQuery}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Set-Cookie": `${CALENDAR_RETURN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error)
        return redirectTo(request, "calendar=denied");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state)
          return new Response("Callback Google Calendar tidak lengkap", { status: 400 });
        try {
          const sync = await finishGoogleCalendarConnect(code, state);
          const result = sync.failed > 0 ? "calendar=connected&sync=failed" : "calendar=connected";
          return redirectTo(request, result);
        } catch (cause) {
          console.error("[google-calendar] callback failed", cause);
          return redirectTo(request, "calendar=failed");
        }
      },
    },
  },
});
