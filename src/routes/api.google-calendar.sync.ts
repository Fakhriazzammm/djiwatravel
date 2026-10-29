import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/customer-session.fn";
import { googleCalendarStatus, syncAllForUser } from "@/lib/google-calendar.server";

export const Route = createFileRoute("/api/google-calendar/sync")({
  server: {
    handlers: {
      POST: async () => {
        let user: AuthenticatedUser;
        try {
          user = await getAuthenticatedUser();
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Masuk kembali untuk melanjutkan." },
            { status: 401 },
          );
        }
        try {
          const status = await googleCalendarStatus(user);
          if (!status.connected) {
            return Response.json(
              { error: "Hubungkan Google Calendar terlebih dahulu." },
              { status: 409 },
            );
          }
          return Response.json(await syncAllForUser(user.id), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          return Response.json(
            {
              error: error instanceof Error ? error.message : "Agenda belum berhasil disinkronkan.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
