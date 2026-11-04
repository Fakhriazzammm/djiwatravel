import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/customer-session.fn";

/** Link to the trip's Drive folder, or null when it does not exist yet. */
const folderUrl = async (subject: string, tripId: string) => {
  const { tripFolderUrl } = await import("@/lib/google-drive.server");
  return tripFolderUrl(subject, tripId);
};

const bodySchema = z.object({
  tripId: z.string().uuid(),
  action: z.enum(["start", "sync", "stop"]),
});

/** Budget export of one trip to the traveler's Google Sheets. Owner only. */
export const Route = createFileRoute("/api/google-sheets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await getAuthenticatedUser();
          const tripId = z.string().uuid().parse(new URL(request.url).searchParams.get("tripId"));
          const { sheetExportStatus } = await import("@/lib/google-sheets.server");
          return Response.json(
            {
              export: await sheetExportStatus(user.id, tripId),
              folderUrl: await folderUrl(user.id, tripId),
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const bad = error instanceof z.ZodError;
          return Response.json(
            { error: bad ? "Permintaan tidak valid" : "Status Sheets gagal" },
            { status: bad ? 400 : 401 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await getAuthenticatedUser();
          const { tripId, action } = bodySchema.parse(await request.json());
          const sheets = await import("@/lib/google-sheets.server");
          if (action !== "stop" && !(await sheets.sheetsActive(user.id)))
            return Response.json({ error: "Izin Google Sheets belum diberikan" }, { status: 403 });
          if (action === "start") await sheets.startSheetExport(user.id, tripId);
          if (action === "sync") {
            await sheets.markSheetDirty(user.id, tripId);
            await sheets.syncTripSheet(user.id, tripId);
          }
          if (action === "stop") await sheets.stopSheetExport(user.id, tripId);
          return Response.json(
            {
              export: await sheets.sheetExportStatus(user.id, tripId),
              folderUrl: await folderUrl(user.id, tripId),
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          const bad = error instanceof z.ZodError;
          const notFound = error instanceof Error && error.message === "Perjalanan tidak ditemukan";
          return Response.json(
            {
              error: bad
                ? "Permintaan tidak valid"
                : notFound
                  ? "Perjalanan tidak ditemukan"
                  : "Ekspor Sheets gagal",
            },
            { status: bad ? 400 : notFound ? 404 : 502 },
          );
        }
      },
    },
  },
});
