import { createFileRoute } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";
import { googleCalendarConfigured, googleCalendarStatus } from "@/lib/google-calendar.server";

/** Google connection status for Calendar, Drive and Sheets. Never includes a token. */
export const Route = createFileRoute("/api/google-calendar/status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const user = await getAuthenticatedUser();
          const calendar = await googleCalendarStatus(user);
          // Drive/Sheets summary is best effort: a deploy before migration 040 still reports Calendar.
          let drive = { pending: 0, uploaded: 0, failed: 0, revoked: 0 };
          const sheets = { pending: 0, failed: 0, revoked: 0 };
          try {
            const { driveSummary } = await import("@/lib/google-drive.server");
            drive = await driveSummary(user.id);
            const { pool } = await import("@/db/client.server");
            const rows = await pool.query(
              "select status, count(*)::int as n from travel_google_sheet_exports where customer_auth_subject=$1 group by status",
              [user.id],
            );
            for (const row of rows.rows as Array<{ status: string; n: number }>) {
              const key = row.status === "syncing" ? "pending" : row.status;
              if (key in sheets) sheets[key as keyof typeof sheets] += Number(row.n);
            }
          } catch (error) {
            console.error(
              "[google] drive/sheets status unavailable",
              error instanceof Error ? error.message : error,
            );
          }
          const needsReconnect = calendar.googleConnected && drive.revoked + sheets.revoked > 0;
          return Response.json(
            { ...calendar, drive, sheets, needsReconnect, configured: googleCalendarConfigured() },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Status Google gagal" },
            { status: 401 },
          );
        }
      },
    },
  },
});
