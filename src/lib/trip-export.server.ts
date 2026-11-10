import { pool } from "../db/client.server";
import { resolveTripOwner } from "./guest-trips.server";
import { buildPlanDocBody } from "./google-plan-doc";
import { docMeta } from "./trip-doc-meta.server";
import { loadPlanState } from "./google-sheets-plan.server";
import { z } from "zod";

const input = z.object({ tripId: z.string().uuid() });
export const tripExportInput = (data: unknown) => input.parse(data);

/**
 * The whole trip as one printable document (itinerary, budget and spending, preparation, bookings,
 * tickets): the print page turns it into a PDF in the traveler's browser. Owner only (guests included).
 */
export async function tripExportHandler({ data }: { data: ReturnType<typeof tripExportInput> }) {
  const owner = await resolveTripOwner();
  if (!owner) throw new Error("Autentikasi diperlukan");
  const owned = await pool.query(
    "select name from travel_trips where id=$1 and customer_auth_subject=$2",
    [data.tripId, owner.id],
  );
  if (!owned.rows[0]) throw new Error("Perjalanan tidak ditemukan");
  const state = await loadPlanState(data.tripId);
  const meta = await docMeta(owner.id, { guest: owner.guest, email: owner.email });
  return { title: String(owned.rows[0].name), body: buildPlanDocBody(state, meta) };
}
