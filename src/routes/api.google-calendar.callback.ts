import { createFileRoute } from "@tanstack/react-router";
import { finishGoogleCalendarConnect } from "@/lib/google-calendar.server";
import {
  CALENDAR_RETURN_COOKIE,
  GOOGLE_FEATURES_COOKIE,
  isSafeCalendarReturn,
  readCookie,
} from "@/lib/calendar-return";
import { parseFeatures, type GoogleFeature } from "@/lib/google-account.server";

function redirectTo(request: Request, query: string) {
  const base = process.env["PUBLIC_APP_URL"] ?? "https://djiwatravel.com";
  const back = readCookie(request.headers.get("cookie"), CALENDAR_RETURN_COOKIE);
  const target = isSafeCalendarReturn(back)
    ? `${base}${back}${back.includes("?") ? "&" : "?"}${query}`
    : `${base}/profile?${query}`;
  const headers = new Headers({ Location: target });
  for (const name of [CALENDAR_RETURN_COOKIE, GOOGLE_FEATURES_COOKIE])
    headers.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

function requestedFeatures(request: Request): GoogleFeature[] {
  const raw = readCookie(request.headers.get("cookie"), GOOGLE_FEATURES_COOKIE);
  return parseFeatures(raw ? raw.replace(/-/g, ",") : null);
}

export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const wanted = requestedFeatures(request);
        const onlyCalendar = wanted.length === 1 && wanted[0] === "calendar";
        if (url.searchParams.get("error"))
          return redirectTo(request, onlyCalendar ? "calendar=denied" : "google=denied");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("Callback Google tidak lengkap", { status: 400 });
        try {
          const result = await finishGoogleCalendarConnect(code, state);
          // Waiting Drive/Sheets work (from before a revoke, or queued while unconnected) resumes now.
          // The connection is already saved, so a problem here must not look like a failed connect.
          try {
            const { requeueRevokedDrive, kickDriveQueue } =
              await import("@/lib/google-drive.server");
            const { requeueRevokedSheets, drainSheetQueue } =
              await import("@/lib/google-sheets.server");
            await requeueRevokedDrive(result.subject);
            kickDriveQueue(result.subject);
            void requeueRevokedSheets(result.subject)
              .then(() => drainSheetQueue(result.subject))
              .catch((cause) => console.error("[google] sheet resume failed", cause));
          } catch (cause) {
            console.error("[google] resume after connect failed", cause);
          }
          const missing = wanted.filter((feature) => !result.features[feature]);
          if (missing.length) return redirectTo(request, "google=partial");
          if (!onlyCalendar)
            return redirectTo(
              request,
              `google=connected&feature=${wanted.filter((f) => f !== "calendar").join("-") || "calendar"}`,
            );
          return redirectTo(
            request,
            result.failed > 0 ? "calendar=connected&sync=failed" : "calendar=connected",
          );
        } catch (cause) {
          console.error("[google] callback failed", cause);
          return redirectTo(request, onlyCalendar ? "calendar=failed" : "google=failed");
        }
      },
    },
  },
});
