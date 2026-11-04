import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";

const bodySchema = z.object({ action: z.enum(["enable", "disable", "retry"]) });

/**
 * Drive controls for the signed-in traveler: pause/resume saving receipts to Drive, and retry
 * uploads that failed. Connecting (the consent screen) goes through /api/google-calendar/connect.
 */
export const Route = createFileRoute("/api/google-drive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await getAuthenticatedUser();
          const { action } = bodySchema.parse(await request.json());
          const { setDriveEnabled } = await import("@/lib/google-account.server");
          const { processDriveQueue, driveSummary, requeueRevokedDrive } =
            await import("@/lib/google-drive.server");
          if (action === "enable") await setDriveEnabled(user.id, true);
          if (action === "disable") await setDriveEnabled(user.id, false);
          if (action === "retry") {
            const { pool } = await import("@/db/client.server");
            // Manual retry gives failed receipts a fresh set of attempts.
            await pool.query(
              "update travel_google_drive_files set attempts=0 where customer_auth_subject=$1 and status='failed'",
              [user.id],
            );
            await requeueRevokedDrive(user.id);
            await processDriveQueue(user.id, { retryFailed: true, limit: 20 });
          }
          return Response.json(
            { ok: true, drive: await driveSummary(user.id) },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const bad = error instanceof z.ZodError;
          return Response.json(
            { error: bad ? "Permintaan tidak valid" : "Drive belum dapat diproses" },
            { status: bad ? 400 : 401 },
          );
        }
      },
    },
  },
});
