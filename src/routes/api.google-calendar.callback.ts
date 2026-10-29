import { createFileRoute } from "@tanstack/react-router";
import { finishGoogleCalendarConnect } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error)
          return Response.redirect(
            `${process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com"}/profile?calendar=denied`,
            302,
          );
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state)
          return new Response("Callback Google Calendar tidak lengkap", { status: 400 });
        try {
          const sync = await finishGoogleCalendarConnect(code, state);
          const result = sync.failed > 0 ? "calendar=connected&sync=failed" : "calendar=connected";
          return Response.redirect(
            `${process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com"}/profile?${result}`,
            302,
          );
        } catch (cause) {
          console.error("[google-calendar] callback failed", cause);
          return Response.redirect(
            `${process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com"}/profile?calendar=failed`,
            302,
          );
        }
      },
    },
  },
});
